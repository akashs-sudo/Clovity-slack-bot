# Setup

From an empty Slack workspace to a working `/suggestion` command.
Time: ~15-20 minutes, assuming you can install apps in the workspace.

---

## Before you start

- Node 18 or newer (`node -v`)
- A Slack workspace you can install apps into
- Member IDs of the 2-3 people allowed to send

Installing a Slack app may need admin approval. Check first:
Slack -> Settings & administration -> Manage apps.

---

## 1. Create the app

1. Go to https://api.slack.com/apps
2. **Create New App** -> **From a manifest**
3. Pick your workspace -> **Next**
4. **YAML** tab -> paste the contents of `manifest.yml` (in this folder)
5. **Next** -> **Create**

## 2. Bot token (xoxb-)

1. Left menu -> **OAuth & Permissions**
2. **Install to Workspace** -> **Allow**
3. Copy **Bot User OAuth Token** using Slack's copy button

Use the copy button. Hand-selecting truncates the token, and a truncated
token returns the same error as a completely wrong one.

## 3. App-level token (xapp-)

The manifest does NOT create this. Generate it by hand.

1. Left menu -> **Basic Information**
2. Scroll to **App-Level Tokens** -> **Generate Token and Scopes**
3. Name: anything (`socket`)
4. **Add Scope** -> `connections:write`   <- required
5. **Generate** -> copy -> **Done**

While there, confirm the manifest set these:

| Left menu | Check |
|---|---|
| Socket Mode | Enable Socket Mode is on |
| Interactivity & Shortcuts | Interactivity is on |
| Slash Commands | `/suggestion` is listed |

## 4. Member IDs

In Slack: click a person -> **View full profile** -> **More** (...) ->
**Copy member ID**. Starts with `U`.

Include your own ID, or your first test fails with a permission error.

## 5. Fill in .env

```powershell
npm install                      # only if node_modules is missing
Copy-Item .env.example .env
notepad .env
```

```
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_APP_TOKEN=xapp-your-token-here
ALLOWED_USER_IDS=U01ABCDEFGH,U02IJKLMNOP
```

Rules that cause most failures:

- No quotes around values
- No spaces around `=`
- Each token on one unbroken line
- Member IDs separated by commas

## 6. Verify, then start

```powershell
node diagnose.js     # both tokens must report OK
npm start            # -> [anon-bot] Running. 2 user(s) allowed.
```

To test a token without saving it to `.env`:

```powershell
node diagnose.js --paste
```

Reads from stdin, so the token does not land in PowerShell history.

## 7. Test in Slack

1. Reload Slack (`Ctrl+R`) so the new command registers
2. Type `/sug` -> `/suggestion` should autocomplete
3. Enter -> modal opens
4. Pick a public channel, write something, **Send**
5. Message posts as **Anonymous Suggestions** with an `APP` badge

The `APP` badge is permanent. Slack puts it on every bot message.

Two more tests worth doing:

- **Private channel** -> should error until you run
  `/invite @Anonymous Suggestions` in it
- **Allowlist blocks** -> remove your own ID, restart, run `/suggestion`.
  You should get a private refusal. Put your ID back afterwards.
  Until you have seen it refuse someone, you have not confirmed it works.

## 8. Keep it running (optional)

Socket Mode means the bot dies when the process stops.

```powershell
npm install -g pm2
pm2 start app.js --name anon-bot
pm2 save
pm2 startup            # prints a command to run once, as admin

pm2 logs anon-bot
pm2 restart anon-bot   # after editing .env
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `invalid_auth` at startup | `xapp-` token wrong or truncated | Re-copy; length should be ~90 |
| `invalid_auth` on auth.test | `xoxb-` token wrong, or app reinstalled | OAuth & Permissions -> copy again |
| `not_authed` | A token variable is empty | Check key name spelling in `.env` |
| `not_allowed_token_type` | Tokens are swapped | `xoxb-` in BOT, `xapp-` in APP |
| `missing_scope` | Scope never granted | Add scope, reinstall, re-copy bot token |
| `/suggestion` not in autocomplete | Slack hasn't picked it up | `Ctrl+R`, then check Slash Commands |
| `dispatch_failed` | Bot is not running | `npm start` |
| "You do not have permission" | Your ID is not in the allowlist | Add it, then restart |
| Modal opens but Send fails | Private channel, bot not a member | `/invite @Anonymous Suggestions` |
| `.env` change did nothing | Read once, at startup | `Ctrl+C`, then `npm start` |

## Where things live

| Need | Location |
|---|---|
| Bot token `xoxb-` | App -> OAuth & Permissions -> Bot User OAuth Token |
| App token `xapp-` | App -> Basic Information -> App-Level Tokens |
| Scopes | App -> OAuth & Permissions -> Bot Token Scopes |
| Reinstall | App -> Install App |
| Rename the bot | App -> App Home -> Display Name |
| Config as YAML | App -> App Manifest |
| Member ID | Slack -> profile -> More -> Copy member ID |
| Revoke a token | Same page you copied it from |
