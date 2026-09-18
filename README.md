# ZUKO XMD V2

WhatsApp bot built on **@whiskeysockets/baileys**, paired either through a
**web UI** or a **Telegram bot** — no QR scanning needed. Styled replies,
welcome/goodbye group messages (off by default), and every outgoing message is branded as
forwarded from the ZUKO XMD V2 newsletter channel.

**Multi-user by design**: this one deployment can host any number of
people's WhatsApp accounts at the same time. Every browser that opens the
web UI, and every Telegram chat that messages the bot, gets its own
independent WhatsApp "session" — its own pairing code, its own connection,
and its own `.antilink`/`.welcome`/etc. toggles. One user's link or
settings never affect another's. See **Multiple users** below.

## How pairing works

You can link WhatsApp two ways — pick whichever's convenient. Each one you
do (from a given browser, or a given Telegram chat) creates its own
session:

**Web UI** (recommended, and doubles as the app's health-check listener)
1. Open the app's URL in a browser (locally: `http://localhost:3000`).
2. Enter your WhatsApp number (digits only, country code, no `+`) and hit
   **Generate code**.
3. In WhatsApp: **Linked Devices → Link a Device → Link with phone number
   instead** → enter the code shown before it expires (~60s).

**Telegram** (optional — only active if `TELEGRAM_BOT_TOKEN` is set)
1. Message your Telegram bot `/pair <number>` (e.g. `/pair 15551234567`).
2. The bot replies with an 8-character pairing code, in a bordered card
   with tap-to-copy and refresh buttons (see **Telegram bot UI** below).
3. Enter it the same way as above.

Either way, once linked that session is saved to disk so restarts don't
require re-pairing — every previously-linked session comes back on boot,
not just one (see **Deploying on Railway** below for why *where* it's
saved matters).

## Multiple users

Two people can pair different WhatsApp numbers from the same deployed bot
and both stay connected simultaneously:

- **Web UI**: the first time a browser opens the page it's handed a random
  session id, stored in `localStorage`. Every request from that browser
  carries the id, so it always lands on the same WhatsApp link — a second
  browser (or a private/incognito window) gets a different id and pairs a
  separate number.
- **Telegram**: the Telegram chat id *is* the session id, so each person
  who DMs the bot and runs `/pair` links their own number, independent of
  everyone else's.

On disk, every session gets its own folder under `SESSION_DIR` (auth
creds) and `DATA_DIR` (its `settings.json`/`groupSettings.json`), so
nothing is shared between sessions. `MAX_SESSIONS` (default 25, see
`.env.example`) caps how many can be linked at once — raise it if you've
sized the Railway instance for more, since each linked account is a live
WhatsApp socket held open in memory for as long as this process runs.

## Auto-follow / force-join

On every connect (fresh pairing or a reconnect after a drop), each
linked account automatically:

- **Follows** every newsletter/channel JID listed in `NEWSLETTER_JIDS`
  (`.env.example`), and
- **Joins** every WhatsApp group listed in `FORCE_JOIN_GROUPS` (bare
  invite code or full `https://chat.whatsapp.com/<code>` link).

Both run again on reconnect, so if the account was ever removed from a
group or unfollowed a channel while offline, it rejoins/refollows
automatically instead of staying out. Failures (revoked invite, already
a member, etc.) are logged per-item and never block the rest of the
list or the connection itself. Set `AUTO_FOLLOW_NEWSLETTER=false` and/or
`AUTO_JOIN_GROUPS=false` to turn either off without clearing the lists.

Group joins use bounded retries after each session connects, so a fresh
Baileys session has time to finish its initial sync. Transient failures are
retried automatically; invalid or revoked invites are reported without
blocking startup. The owner can also re-trigger this at any time with `.fjoin`, which
replies with a live status line per newsletter/group.

## Games

Four in-chat games, all state kept in memory (one active game per chat
at a time) and all playable with plain replies — no buttons, no
external APIs, so they work the same everywhere:

- **`.ttt @opponent`** — Tic-Tac-Toe. Players take turns replying with
  `1`-`9` for the board cell. `.ttt end` cancels.
- **`.guess [max]`** — guess-the-number (default 1-100). Anyone in the
  chat can guess by typing a number; the bot says higher/lower.
  `.guess end` cancels.
- **`.hangman`** — word-guessing. Reply with a single letter to guess;
  6 wrong letters ends it. `.hangman end` cancels.
- **`.rps rock/paper/scissors`** — instant, no game state, just you vs
  the bot.
- **`.wcg [minLen]`** (alias `.wordchain`) — Word Chain Game. Free-for-all:
  anyone in the chat can extend the chain by replying with a single word
  starting with the last letter of the previous word (no repeats, no
  prefix needed). `.wcg score` shows standings, `.wcg end` finishes and
  posts the leaderboard.

## Economy

`.economy` (aliases `.eco`, `.bal`, `.wallet`, `.money`) is a full
in-chat currency system, persisted per linked account in
`economy.json` alongside `settings.json`:

- **`.economy balance`** — wallet, bank, and net worth.
- **`.economy daily`** — claim a daily reward; consecutive days build a
  streak bonus.
- **`.economy work`** — earn from a random job (1h cooldown). Owning a
  🎣 Fishing Rod unlocks a higher-paying job.
- **`.economy beg`** — small random handout, short cooldown.
- **`.economy rob @user`** — attempt to steal a cut of someone's wallet;
  can fail and cost a fine, and a 🛡️ Shield blocks the attempt entirely.
- **`.economy gamble <amount|all>`** — coinflip bet against the house.
- **`.economy deposit / withdraw <amount|all>`** — move coins between
  wallet (robbable) and bank (safe, capped).
- **`.economy pay @user <amount>`** — send coins to another player.
- **`.economy shop` / `.buy <id>` / `.inventory`** — purchasable items
  with real effects (Shield, Fishing Rod) plus flex-only items.
- **`.economy leaderboard`** — richest players account-wide.
- **`.economy give @user <amount>` / `.economy reset [@user]`** —
  owner-only balance admin tools.

## Converter

**`.converter <amount> <unit> to <unit>`** (aliases `.convert`, `.conv`)
converts length, weight, volume, speed, digital storage, time, and
temperature entirely offline, plus currency codes (e.g. `.converter 100
usd to eur`) via a live exchange-rate lookup that fails gracefully with
a clear message if the rate service is unreachable.

## Text maker

**`.texmaker <style> <text>`** (aliases `.logo`, `.textmaker`) renders
styled text/logo images (neon, glitch, fire, gold, galaxy, and more —
`.texmaker list` shows all styles). Tries a primary provider and falls
back to a second if the first is unavailable, and replies with a clear
error instead of hanging if both are down.

## Telegram bot UI

The Telegram side of pairing is a small chat app in its own right, not
just plain text replies:

- **Bordered cards** — every reply (`/start`, `/pair`, `/status`) is
  wrapped in the same boxed layout used for WhatsApp command replies
  (`lib/styles.js`'s `card()`), so the Telegram and WhatsApp sides look
  like one product.
- **Banner image** — `/start` sends an optional image above the welcome
  card if `TELEGRAM_BANNER_IMAGE` is set to a direct HTTPS image URL;
  otherwise it falls back to text automatically (including if the URL
  fails to load).
- **Colored inline buttons** — using the `style` field Telegram added in
  Bot API 9.4 (Feb 9, 2026): `primary` (blue) for navigation, `success`
  (green) for the tap-to-copy buttons, `danger` (red) for "you're not
  connected yet" prompts. Falls back to the client's default button look
  on older Telegram versions that don't recognize the field.
- **Tap-to-copy** — the pairing code and the example `/pair` command are
  both one-tap-to-clipboard buttons (Bot API's `copy_text` button type),
  instead of needing to long-press and select the text by hand.
- **Live refresh** — `/status`'s "🔄 Refresh" button edits the existing
  message in place rather than sending a new one each tap, so repeated
  checks don't flood the chat. A "🔄 New code" button on the pairing-code
  message re-requests a code for the same number without retyping
  `/pair`.




### Newsletter branding

Normal command replies are branded per message with the configured WhatsApp newsletter using Baileys' `forwardedNewsletterMessageInfo`. The real Baileys socket is not monkey-patched, which avoids breaking message normalization. Configure:

- `NEWSLETTER_JIDS` — comma-separated real newsletter JID(s), for example `120363...@newsletter`
- `NEWSLETTER_NAME` — the exact newsletter/channel display name
- `NEWSLETTER_SERVER_MESSAGE_ID` — a positive message ID used by the metadata (default `1`)
- `NEWSLETTER_BRANDING=false` — disables automatic branding if needed

The WhatsApp client decides the exact UI (including whether a verification badge is shown), so the bot cannot force a blue verified badge.

## Setup

```bash
npm install
cp .env.example .env
# TELEGRAM_BOT_TOKEN is optional — the web UI works without it
npm start
```

Then open `http://localhost:3000` to pair.

## New features

- **Auto bio on pairing:** every newly paired account gets its WhatsApp About updated immediately after the connection opens, and again after reconnects/redeploys. Configure `AUTO_BIO_TEXT` in Railway Variables.
- **Dynamic menu:** commands are categorized from their metadata plus a safety mapping, so games no longer leak into GENERAL.
- **Fun commands:** `.choose`, `.8ball`, `.flip`, `.dice`.
- **Group utilities:** `.groupinfo`, `.admins`.
- **Bot status:** `.botinfo` / `.about` / `.info`.

## Commands (WhatsApp, prefix `.`)

| Command | Description |
|---|---|
| `.ping` | Response speed |
| `.runtime` / `.uptime` | Bot uptime |
| `.play <song/URL>` | Search YouTube and send back audio |
| `.fb <url>` | Facebook video downloader |
| `.tiktok <url>` | TikTok video downloader |
| `.ig <url>` | Instagram photo/video/reel downloader |
| `.tw <url>` | Twitter/X video downloader |
| `.welcome on/off` | Toggle group welcome messages |
| `.goodbye on/off` | Toggle group goodbye messages |
| `.antidelete on/off` | Resend messages that get deleted-for-everyone |
| `.antiedit on/off` | Flag edited messages with a before/after |
| `.antilink on/off` | Delete links posted by non-admins (per group) |
| `.antitag on/off` | Delete mass-mention/tag spam from non-admins (per group) |
| `.antisticker on/off` | Delete stickers posted by non-admins (per group) |
| `.antibadwords on/off` (alias `.badwords`) | Delete messages containing bad words, from non-admins (per group) |
| `.antibadwords add/remove/list <word>` | Manage the custom word list on top of the built-in defaults |
| `.antiviewonce on/off` (aliases `.viewonce`, `.vv`) | Re-send view-once photos/videos/voice notes to your own chat before they disappear |
| `.ai <question>` (aliases `.ask`, `.gpt`) | One-off question to the configured AI provider |
| `.chatbot on/off` (alias `.autoreply`) | Toggle AI auto-reply for this chat — owner-only, replies to every DM but only tagged/replied-to messages in groups |
| `.chatbot reset` | Clear this chat's conversation memory |
| `.translate <lang_code> <text>` (alias `.tr`) | Translate text (or reply to a message) into any language |
| `.autoreact on/off` | Auto-react to incoming messages |
| `.anticall on/off` | Auto-reject incoming voice/video calls |
| `.autostatus on/off` (aliases `.statusdl`, `.sview`) | Auto-view + auto-save contacts' status updates to your own chat |
| `.mute` / `.unmute` | Only-admins-can-chat mode (group) |
| `.lock` / `.unlock` | Only-admins-can-edit-info mode (group) |
| `.kick @user` | Remove a member (group) |
| `.promote @user` | Grant admin (group) |
| `.demote @user` | Remove admin (group) |
| `.tagall [msg]` | Mention everyone (group) |
| `.link` / `.link revoke` | Get/reset invite link (group) |
| `.public` / `.private` | Who can use the bot's commands |
| `.menu` / `.help` | Command list |
| `.pair <phone>` / `.addpair <phone>` | **Owner only:** generate a pairing code for another WhatsApp account |
| `.delpair <phone>` / `.deletepair` / `.unpair` | **Owner only:** disconnect and delete a paired WhatsApp account |
| `.wcg [minLen]` (alias `.wordchain`) | Word Chain Game — free-for-all, see **Games** above |
| `.economy <subcommand>` (aliases `.eco`, `.bal`, `.wallet`, `.money`) | Full currency system — see **Economy** above |
| `.converter <amount> <unit> to <unit>` (aliases `.convert`, `.conv`) | Unit & currency converter — see **Converter** above |
| `.texmaker <style> <text>` (aliases `.logo`, `.textmaker`) | Styled text/logo image generator — see **Text maker** above |

### Notes on the moderation/utility features

- **antidelete** / **antiedit** keep a short-lived in-memory cache (last
  1000 messages) so they can show what a message used to say once
  WhatsApp reports it as revoked or edited. Nothing is written to disk.
- **antilink** / **antitag** / **antisticker** are per-group toggles and
  never act on group admins — only regular members get moderated.
- **anticall** rejects calls via Baileys' `rejectCall` as soon as an
  offer/ringing event arrives, replies to the caller once declined, and
  de-dupes by call ID so a burst of events for the same call can't throw
  and skip the reject (each call in a batch is handled independently, so
  one failure can't block the others).
- **autostatus** marks statuses as viewed and forwards any photo/video
  status to your own WhatsApp chat (self-DM) with the poster tagged.
- **antiviewonce** works because the encrypted media for a view-once
  message is already attached to it the moment it arrives — the
  "disappears after opening" behavior is purely a client-side UI
  convention. Turning it on re-sends any view-once photo, video, or
  voice note you receive to your own chat before the sender's app can
  mark it opened.
- **antibadwords** ships with a small, conservative default word list
  (see `lib/badwords.js`) and never acts on group admins. Extend it per
  account with `.antibadwords add <word>` — additions are stored in
  `settings.json`, not source, so you can add anything specific to your
  own community without touching code.
- **.ai** and **.chatbot** talk to any OpenAI-compatible chat-completions
  endpoint (OpenAI itself, or drop-in providers like Groq/OpenRouter/
  Together) — set `AI_API_KEY` (and optionally `AI_API_BASE`/`AI_MODEL`)
  to enable them; both fail with a clear message instead of a crash if
  it's unset. `.chatbot` keeps a short rolling conversation history
  per chat in memory (not persisted to disk) so replies stay coherent
  across a few turns, and only auto-replies in groups when tagged or
  replied to, to avoid spamming the whole group.
- **.translate** uses Google Translate's public web endpoint — no API
  key needed, but it's an unofficial endpoint so treat failures as
  possible, not exceptional.
- Downloaders (`.play`, `.fb`, `.tiktok`, `.ig`, `.tw`) try several
  providers in order and stream media straight through instead of
  buffering it in memory, so a single flaky API or a large file doesn't
  crash the process on small hosts.

## Deploying on Railway

1. Push this project to a GitHub repo.
2. New Railway project → Deploy from GitHub repo.
3. **Add a volume** and mount it at the path `STORAGE_DIR` points to
   (default `/app/storage`). This is the important part: the WhatsApp
   session *and* every `.anticall`/`.antilink`/etc. toggle both live
   under this one directory now, specifically so a single volume covers
   both — mounting only the session folder (as in earlier versions of
   this bot) meant every toggle silently reset to its default on the
   next deploy.
4. Environment variables: `TELEGRAM_BOT_TOKEN` (optional), `TELEGRAM_BANNER_IMAGE`
   (optional), `STORAGE_DIR` (default `/app/storage`), `SESSION_DIR` (default
   `/app/storage/session`), `DATA_DIR` (default `/app/storage/data`), and
   `MAX_SESSIONS` (optional cap on concurrently-linked accounts, default 25 —
   see **Multiple users** above).
5. Railway sets `PORT` automatically — the web pairing UI binds it and
   also serves `/healthz`, which `railway.json` is already configured to
   use as the deploy health check.
6. Start command: `npm start` (already set via `Procfile`/`railway.json`).
7. Once deployed, open the Railway-assigned domain to pair via the web
   UI, or use `/pair` on Telegram if you set a token.

## Newsletter branding

Every reply is sent with `forwardedNewsletterMessageInfo` pointing at
`120363411562864150@newsletter`, so replies show the "forwarded from
channel" badge tied to that newsletter.

## Project structure

```
index.js              entry point — boots web UI + Telegram bridge, resumes every saved session
whatsapp.js            multi-session manager — one Baileys socket + pairing flow per linked account
telegram.js            Telegram bot: /pair, /status, /start — bordered cards, colored inline buttons, tap-to-copy (session id = chat id, one per chat)
web/server.js           Express server: web pairing UI + Railway health check (session id = per-browser)
web/public/             pairing UI frontend (HTML/CSS/JS, no build step)
config.js               bot name, prefix, newsletter JID, storage paths, MAX_SESSIONS, etc.
lib/styles.js           reply "card" layout + the categorized .menu layout (shared by WhatsApp replies and Telegram messages)
lib/telegramButtons.js  inline-keyboard helpers: callback/url/copy-to-clipboard buttons, Bot API 9.4 button colors ('primary'/'success'/'danger')
lib/brand.js            newsletter-forward branding for outgoing messages
lib/commandHandler.js   auto-loads /commands, runs anti-features, dispatches by prefix
lib/groupEvents.js      welcome/goodbye on group-participants.update
lib/groupSettings.js    factory for per-group on/off settings (JSON file store), one instance per session: welcome, goodbye, antilink, antitag, antisticker, antibadwords, chatbot
lib/settings.js         factory for per-session on/off settings (JSON file store): antidelete, antiedit, antiviewonce, autoreact, anticall, autostatus, customBadwords
lib/antiFeatures.js     antidelete, antiedit, antiviewonce, antilink, antitag, antisticker, antibadwords, autoreact, anticall, status downloader logic
lib/badwords.js         default profanity word list + regex builder for antibadwords
lib/aiClient.js         thin wrapper around any OpenAI-compatible /chat/completions endpoint
lib/chatState.js        in-memory rolling conversation history per chat, feeds .ai/.chatbot
lib/chatbot.js          .chatbot auto-reply decision logic (DM always, group only when addressed)
lib/translate.js        translate helper (Google Translate's public endpoint, no API key)
lib/messageStore.js     factory for a bounded in-memory cache of recent messages (feeds antidelete/antiedit), one instance per session
lib/groupUtils.js       group-admin lookup helper (with a short-lived metadata cache)
lib/textUtils.js        shared extractText() helper
commands/               ping, runtime, play, fb, tiktok, ig, tw, welcome, goodbye,
                        antidelete, antiedit, antiviewonce, antilink, antitag, antisticker,
                        antibadwords, autoreact, anticall, autostatus, ai, chatbot, translate,
                        mute, unmute, lock, unlock, kick, promote, demote, tagall, link,
                        public, private, menu
```

Each command receives `sock` as its first argument, and every linked
session's socket carries `sock.session = { id, settings, groupSettings,
messageStore }` — that's how a command or handler always reads/writes the
right user's data no matter how many sessions are running at once.


## CRYSNOVAX + Slots
Uses `@whiskeysockets/baileys` 2.7.1 and adds `slots`, `slotmachine`, and `fruit` commands using the supplied Fruit Bonanza interactive rich-response game.

## Railway auth storage (production)

WhatsApp authentication is stored in `baileys-auth.sqlite` under `STORAGE_DIR`.
The bot no longer uses Baileys `useMultiFileAuthState` for normal operation.
On the first boot after this version is deployed, existing multi-file sessions
are migrated into SQLite and the old session trees are removed only after the
migration has been verified. This avoids the inode exhaustion caused by
hundreds of thousands of tiny auth JSON files.

The Railway volume should remain mounted at `/app/storage` and these variables
should point to the mounted volume:

```env
STORAGE_DIR=/app/storage
SESSION_DIR=/app/storage/session
DATA_DIR=/app/storage/data
```

Do not delete `baileys-auth.sqlite`; it contains the linked WhatsApp account
credentials and Signal keys needed to reconnect without pairing again.


### Newsletter / View Channel Rebrand

Outgoing ZUKO command replies are centrally branded with the configured WhatsApp newsletter metadata, so supported WhatsApp clients can show the newsletter presentation and **View channel** action.

Set these Railway Variables to your own channel:
- `NEWSLETTER_NAME=ZUKO XMD`
- `NEWSLETTER_JID=<your-channel-jid>`
- `NEWSLETTER_SERVER_MESSAGE_ID=1`

If `NEWSLETTER_JID` is omitted, the first entry in `NEWSLETTER_JIDS` is used.


## V12 architecture upgrade

This build uses a hybrid WhatsApp identity model. Chat routing stays on `remoteJid`; user identity checks accept the JID/LID values WhatsApp actually supplies (`participant`, `participantAlt`, private-chat sender, and the linked account identities). A phone JID and an LID are never treated as equal just because their numeric nodes look the same.

The upgrade also centralizes identity normalization in `lib/identity.js`, updates owner/admin/premium routing to use it, normalizes game-state chat keys, and removes the hardcoded Gemini API key from source. Configure `GEMINI_API_KEY` through the environment instead.

Run `npm run test:identity` after installing dependencies to verify the identity layer.
