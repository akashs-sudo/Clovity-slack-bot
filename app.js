require('dotenv').config();
console.log('ENV CHECK:', {
  botToken: !!process.env.SLACK_BOT_TOKEN,
  appToken: !!process.env.SLACK_APP_TOKEN,
  allowedUsers: !!process.env.ALLOWED_USER_IDS,
});
const { App } = require('@slack/bolt');

const ALLOWED_USER_IDS = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const USE_CUSTOM_IDENTITY = process.env.USE_CUSTOM_IDENTITY === 'true';
const ANON_DISPLAY_NAME = process.env.ANON_DISPLAY_NAME || 'Anonymous';
const ANON_ICON = process.env.ANON_ICON || ':bust_in_silhouette:';

const MODAL_ID = 'anon_suggestion_modal';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Slack permalink se channel + thread ka timestamp nikalta hai.
// Format: https://ws.slack.com/archives/C0123ABCD/p1699999999123456
// Thread ke andar wale reply ke link mein ?thread_ts=... bhi hota hai — wo parent hai.
function parseSlackLink(link) {
  if (!link) return null;
  const match = link.match(/\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/i);
  if (!match) return null;

  const [, channel, seconds, micros] = match;
  let ts = `${seconds}.${micros}`;

  try {
    const parentTs = new URL(link).searchParams.get('thread_ts');
    if (parentTs) ts = parentTs;
  } catch {
    // link mein query string nahi hai — koi baat nahi
  }

  return { channel, ts };
}

function buildModal(prefillText) {
  return {
    type: 'modal',
    callback_id: MODAL_ID,
    title: { type: 'plain_text', text: 'Anonymous Suggestion' },
    submit: { type: 'plain_text', text: 'Send' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'channel_block',
        label: { type: 'plain_text', text: 'Which channel should this go to?' },
        element: {
          type: 'conversations_select',
          action_id: 'channel',
          default_to_current_conversation: true,
          filter: { include: ['public', 'private'], exclude_bot_users: true },
        },
      },
      {
        type: 'input',
        block_id: 'message_block',
        label: { type: 'plain_text', text: 'Your message' },
        element: {
          type: 'plain_text_input',
          action_id: 'message',
          multiline: true,
          initial_value: prefillText || undefined,
          placeholder: { type: 'plain_text', text: 'Write what you want to say...' },
        },
      },
      {
        type: 'input',
        block_id: 'thread_block',
        optional: true,
        label: { type: 'plain_text', text: 'Replying to something? Paste the message link' },
        hint: {
          type: 'plain_text',
          text: 'Hover the message -> ... -> Copy link. If a link is given, the channel is taken from it.',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'thread',
          placeholder: { type: 'plain_text', text: 'https://....slack.com/archives/C.../p...' },
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '_Channel members will not see your name. Workspace admins may still have audit logs._',
          },
        ],
      },
    ],
  };
}

app.command('/suggestion', async ({ command, ack, client, respond }) => {
  await ack();

  if (!ALLOWED_USER_IDS.includes(command.user_id)) {
    await respond({
      response_type: 'ephemeral',
      text: 'You do not have permission to send anonymous suggestions.',
    });
    return;
  }

  await client.views.open({
    trigger_id: command.trigger_id,
    view: buildModal(command.text),
  });
});

app.view(MODAL_ID, async ({ ack, body, view, client }) => {
  // Double-check: modal ka trigger purana ho sakta hai, ya allowlist beech mein badli ho.
  if (!ALLOWED_USER_IDS.includes(body.user.id)) {
    await ack({
      response_action: 'errors',
      errors: { message_block: 'You do not have permission.' },
    });
    return;
  }

  const values = view.state.values;
  const pickedChannel = values.channel_block.channel.selected_conversation;
  const text = (values.message_block.message.value || '').trim();
  const link = (values.thread_block.thread.value || '').trim();

  if (!text) {
    await ack({
      response_action: 'errors',
      errors: { message_block: 'Message cannot be empty.' },
    });
    return;
  }

  let channel = pickedChannel;
  let threadTs;

  if (link) {
    const parsed = parseSlackLink(link);
    if (!parsed) {
      await ack({
        response_action: 'errors',
        errors: { thread_block: 'That does not look like a Slack message link. Use Copy link and try again.' },
      });
      return;
    }
    channel = parsed.channel;
    threadTs = parsed.ts;
  }

  const message = { channel, text, unfurl_links: false };
  if (threadTs) message.thread_ts = threadTs;
  if (USE_CUSTOM_IDENTITY) {
    message.username = ANON_DISPLAY_NAME;
    message.icon_emoji = ANON_ICON;
  }

  // Post pehle, ack baad mein — taki fail hone pe error modal ke andar dikha sakein.
  // Slack ka ack window 3 second ka hai; chat.postMessage usually <1s leta hai.
  try {
    await client.chat.postMessage(message);
  } catch (error) {
    const code = error?.data?.error;
    const reason =
      code === 'not_in_channel' || code === 'channel_not_found'
        ? 'The bot is not in that channel. For a private channel, run /invite @Anonymous Suggestions first.'
        : code === 'invalid_arguments' && USE_CUSTOM_IDENTITY
          ? 'Custom identity is on but the chat:write.customize scope is missing. Add the scope and reinstall the app.'
          : `Slack rejected the message (${code || 'unknown'}).`;

    await ack({ response_action: 'errors', errors: { channel_block: reason } });
    return;
  }

  await ack();
});

app.error(async (error) => {
  // Jaanbujh kar sirf error log ho raha hai — message text aur sender ID kabhi log mat karna.
  console.error('[anon-bot]', error?.data?.error || error.message);
});

(async () => {
  if (ALLOWED_USER_IDS.length === 0) {
    console.warn('[anon-bot] WARNING: ALLOWED_USER_IDS is empty - nobody will be able to send messages.');
  }
  await app.start();
  console.log(`[anon-bot] Running. ${ALLOWED_USER_IDS.length} user(s) allowed.`);
})();
