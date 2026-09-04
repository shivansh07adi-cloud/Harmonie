<div align="center">

<img src="assets/brand/Mylogo.png" width="220" style="border-radius:16px;" alt="Harmonie" />

**A full-featured, self-hosted WhatsApp community bot — built on [Baileys](https://github.com/WhiskeySockets/Baileys), no paid APIs required.**

Built by [Shivansh Kumar](https://github.com/shivansh07adi-cloud) · [LinkedIn](https://www.linkedin.com/in/shivansh-kumar-adi) · [Portfolio](https://shivanshonline.in/)

</div>

---

## What is this?

Harmonie is a multi-feature WhatsApp bot that connects the same way WhatsApp Web does — no Meta Business API, no per-message fees, no approval process. It runs on your own server, links to a WhatsApp number via QR code once, and then handles everything from there: **47 commands**, an AI assistant, a full XP/badge/achievement system, daily quizzes, automated group analytics, moderation, and more.

Everything is designed to actually work end-to-end with **zero paid dependencies** except one optional free-tier Gemini API key (needed only for AI search, group analytics, and the @-mention assistant — every other feature works without it).

---

## Table of Contents

- [Features](#features)
  - [Automatic Systems](#-automatic-systems-no-command-needed)
  - [Command Reference](#-command-reference)
  - [Badge & XP System](#-badge--achievement-system)
  - [Quiz System](#-quiz-system)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Deploying to a Server (OCI / any VPS)](#deploying-to-a-server-oci--any-vps)
- [How It's Built](#how-its-built)
- [Notes on the Free APIs Used](#notes-on-the-free-apis-used)
- [Adding a New Command](#adding-a-new-command)

---

## Features

### 🤖 Automatic Systems (no command needed)

| System | What it does |
|---|---|
| **AI Assistant** | @-mention the bot in a group, or DM it directly, and it answers using Gemini with live web grounding — short, conversational replies. |
| **👋 Welcome System** | Fires automatically when someone joins. Personalized message with real group name, member count, and the new member's profile picture (if public), followed by their auto-awarded 🌱 Newcomer badge. Fully customizable per group. |
| **Sticker-Spam Protection** | When enabled, any sticker from a non-admin gets a 30-second grace period to self-delete, or the bot auto-warns them — feeding into the same 3-strike warning system as manual moderation. |
| **📅 Daily Quiz** | Auto-posts a quiz question once a day (default 10:00 IST) to any group that's opted in. |
| **📊 Daily Analytics** | Auto-posts the full AI-generated group analytics report once a day (default 23:00 IST) to any group that's opted in. |

### 📋 Command Reference

**General**
| Command | Aliases | Description |
|---|---|---|
| `!help` | `!menu` `!h` `!commands` | Full command list, or `!help <command>` for details |
| `!alive` | `!ping` `!a` `!latency` `!speed` | Neofetch-style system report — real CPU, memory, uptime, latency, live queue depth |
| `!dev` | `!developer` `!src` `!source` | Developer info card with photo |
| `!donate` | `!donation` | Your donation link |
| `!calc` | `!calculate` | Safe math expression evaluator |

**Stickers**
| Command | Aliases | Description |
|---|---|---|
| `!sticker` | `!s` | Image/video → sticker |
| `!steal` | `!stealn` | Re-pack any sticker/image/video with your own pack/author metadata |
| `!sets` | `!stealtext` | Save your default pack/author text |
| `!tts` | `!attp` | Text → animated colour-cycling sticker |

**Media**
| Command | Aliases | Description |
|---|---|---|
| `!save` | `!dl` `!download` `!insta` `!tw` `!tt` `!fb` | Universal downloader — Instagram, Twitter/X, TikTok, Facebook. Sends the actual media, not a link |
| `!epicgames` | `!epic` `!freegames` | Current free games on Epic Games Store |
| `!reddit <link>` | | Pulls image/video from a Reddit post |
| `!idp` | `!dp` | Instagram profile picture |

**Info**
| Command | Aliases | Description |
|---|---|---|
| `!weather <city>` | | Live weather |
| `!wiki <query>` | | Wikipedia summary |
| `!search` | `!gs` | Google-style search via Gemini with live web grounding |
| `!tr <lang> <text>` | | Translate |
| `!say <text>` | `!say hin <text>` | Text-to-speech voice note (English/Hindi) |

**Group**
| Command | Aliases | Description |
|---|---|---|
| `!rank` | `!level` `!xp` | Per-group XP/level from message activity |
| `!delete` | `!d` `!dd` | Delete a message (reply to it) |

**Group Admin**
| Command | Aliases | Description |
|---|---|---|
| `!warn @user [reason]` | `!warning` `!w` | Warn a member — 3 strikes = auto-removal. **Admins are exempt from being warned, in both directions.** |
| `!unwarn @user [all]` | `!clearwarn` `!removewarn` | Remove latest warning, or all |
| `!check-warn [@user]` | `!warnings` `!warns` | See warning count + reasons |
| `!spam on\|off` | `!antispam` | Toggle sticker-spam protection |
| `!welcome on\|off` | | Toggle the Welcome System (on by default) |
| `!setwelcome <msg>` | | Customize welcome template — `{user}` `{group}` `{count}` `{prefix}` placeholders |
| `!quizzes on\|off` | `!dailyquiz` | Toggle the daily auto-quiz |
| `!dailyanalytics on\|off` | | Toggle the daily auto-analytics report |

**Utility**
| Command | Description |
|---|---|
| `!remind <10m\|2h\|1:30PM> <message> [repeat daily\|weekly]` | Set a reminder; `!remind list` / `!remind cancel <id>` |

**Badges**
| Command | Aliases | Description |
|---|---|---|
| `!badges [@user]` | | Earned badges + progress on locked ones |
| `!profile [@user]` | | XP, badge count, streak, community rank |
| `!leaderboard` | `!lb` | Top 10 by community-wide XP |
| `!thanks` | `!thankyou` | Reply to a helpful message to credit them (+10 XP) |
| `!share <link/text>` | | Log a resource share (+5 XP) |
| `!challenge <name>` | | Mark a challenge completed (+15 XP, once/day) |
| `!bugreport <desc>` | `!reportbug` | Log a bug for admin validation |

**Badge Admin**
| Command | Description |
|---|---|
| `!awardbadge @user <key>` / `!removebadge` | Manually manage badges |
| `!addxp @user <amount>` / `!removexp` | Manually adjust XP |
| `!validatebug <id>` | Confirm a bug report, award reporter +20 XP |
| `!memberstats @user` | Full stat breakdown |
| `!badgestats` | Every badge with holder count |

**Quiz**
| Command | Aliases | Description |
|---|---|---|
| `!quiz [coding\|tech\|general]` | | Post a question on demand |
| `!answer <A\|B\|C\|D>` | `!ans` | First correct answer wins +15 XP |
| `!quizleaderboard` | `!quizlb` | Top members by correct answers |

### 🏅 Badge & Achievement System

15 badges across 4 categories (**Contribution, Activity, Technical, Community**) and 4 rarity tiers (⚪ Common, 🔵 Rare, 🟣 Epic, 🟡 Legendary), backed by a real XP economy:

| Action | XP | Anti-abuse |
|---|---|---|
| First message of the day | +2 | Once/day, also builds your streak |
| Positive reaction received | +5 | 30s cooldown, no self-reactions |
| `!thanks` credit | +10 | Can't thank yourself or the same message twice |
| `!share` a resource | +5 | 5 min cooldown |
| `!challenge` completed | +15 | Once per challenge name per day |
| Admin `!validatebug` | +20 | Admin-gated |
| `!answer` a quiz correctly | +15 | One winner per question |

All XP is hard-capped at **200/day/user**, with duplicate-message spam detection on top. Badge conditions live in exactly one file (`src/badges/badgeDefinitions.js`) — nothing else in the codebase hardcodes a threshold.

### 🧠 Quiz System

- **Coding** questions come from a 25-question curated local bank — zero external dependency, always available.
- **Tech/General** pull live from the free [Open Trivia DB](https://opentdb.com/) API, with automatic fallback to the local bank if that API is ever unreachable.
- Per-group repeat-avoidance, a dedicated leaderboard, and a daily auto-post option.

---

## Project Structure

```
Harmonie/
├── assets/
│   ├── dev/
│   │   └── dev-photo.png          Used in the !dev command card and this README
│   └── fonts/
│       └── DejaVuSans-Bold.ttf    Bundled font for !tts animated stickers
├── src/
│   ├── index.js                   Baileys connection, QR pairing, message dispatch,
│   │                               all event listeners, all daily schedulers
│   ├── context.js                 Builds a clean per-message ctx (reply, media
│   │                               download, admin checks, delete, etc.)
│   ├── config.js                  Reads .env into a single config object
│   ├── db.js                      SQLite — every table + prepared-statement helper
│   ├── commandRegistry.js         Loads every command module, indexes by alias
│   │
│   ├── commands/                  One file per feature area
│   │   ├── general.js             help, ping, dev, donate, calc
│   │   ├── stickers.js            sticker, steal, sets, tts
│   │   ├── media.js               epicgames, reddit, idp
│   │   ├── socialDownload.js      save (Instagram/Twitter/TikTok/Facebook)
│   │   ├── info.js                weather, wiki, search, translate, say
│   │   ├── group.js               rank, delete, warn, unwarn, check-warn,
│   │   │                           welcome, setwelcome, quizzes toggle
│   │   ├── system.js              analytics, dailyanalytics, spam
│   │   ├── reminder.js            remind
│   │   ├── badges.js              badges, profile, leaderboard, thanks,
│   │   │                           share, challenge, bugreport
│   │   ├── badgeAdmin.js          awardbadge, removebadge, addxp, removexp,
│   │   │                           validatebug, memberstats, badgestats
│   │   └── quiz.js                quiz, answer, quizleaderboard
│   │
│   ├── services/                  Business logic shared across commands + scheduler
│   │   ├── xpService.js           XP awarding, cooldowns, daily cap, spam detection
│   │   ├── badgeService.js        Badge condition evaluation, unlock notifications
│   │   ├── analyticsService.js    Shared analytics generator (manual + scheduled)
│   │   └── commandQueue.js        Tracks concurrent command execution for !ping
│   │
│   ├── badges/
│   │   └── badgeDefinitions.js    Single source of truth for all 15 badges
│   │
│   ├── quiz/
│   │   ├── codingQuestions.json   25 curated coding questions
│   │   ├── openTrivia.js          Open Trivia DB integration
│   │   └── quizService.js         Question selection + repeat-avoidance
│   │
│   └── utils/                     Pure logic — sticker making, TTS, translate,
│                                    weather, reminders, Gemini, social downloads, etc.
│
├── .env.example                   Every configurable value, documented inline
├── .gitignore                     Excludes .env, store/, node_modules/
├── package.json
└── README.md                      This file
```

---

## Setup

### 1. Requirements

```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg
node -v   # 18+ required
```

`ffmpeg` is mandatory — sticker creation and voice notes will error without it.

### 2. Get the code

```bash
git clone https://github.com/shivansh07adi-cloud/Harmonie.git
cd Harmonie
npm install
```

### 3. Configure

```bash
cp .env.example .env
nano .env
```

Your name, GitHub, LinkedIn, repo link, and dev photo are already pre-filled. Add a free Gemini key from **https://aistudio.google.com/apikey** to unlock `!search`, `!analytics`, and the AI assistant — everything else works without it.

### 4. First run — link WhatsApp

```bash
npm start
```

A QR code prints in the terminal. On the WhatsApp account you want the bot to run as: **Settings → Linked Devices → Link a Device** → scan it. The session is saved to `store/session/` — you won't need to re-scan on future restarts.

### 5. Keep it running permanently

```bash
sudo npm install -g pm2
pm2 start src/index.js --name harmonie
pm2 save
pm2 startup   # follow the printed instructions
```

```bash
pm2 logs harmonie      # live logs
pm2 restart harmonie   # after any code/env change
```

---

## Environment Variables

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `PREFIX` | No | `!` | Command prefix |
| `BOT_NAME` | No | `Harmonie` | Shown in `!help`, `!dev`, `!ping` |
| `DEV_NAME` / `DEV_CONTACT` / `DEV_LINKEDIN` / `DEV_GITHUB` / `REPO_LINK` | No | pre-filled | Shown in `!dev` |
| `DEV_PHOTO_PATH` | No | `./assets/dev/dev-photo.png` | Image attached to `!dev` |
| `DONATE_LINK` | No | — | Shown in `!donate` |
| `GEMINI_API_KEY` | **Only for AI features** | — | Powers `!search`, `!analytics`, the @-mention assistant |
| `OWNER_NUMBERS` | No | — | Comma-separated numbers; available as `ctx.isOwner` for any command you want to gate |
| `SESSION_DIR` | No | `./store/session` | WhatsApp login session storage |
| `DB_PATH` | No | `./store/bot.db` | SQLite database file |
| `DAILY_QUIZ_TIME` | No | `10:00` | 24h IST time the daily quiz posts |
| `DAILY_ANALYTICS_TIME` | No | `23:00` | 24h IST time the daily analytics report posts |

No external database (MongoDB, Postgres, etc.) is required — SQLite is a single local file, created automatically on first run.

---

## Deploying to a Server (OCI / any VPS)

There's no "connect and auto-deploy" button for a raw VM — the workflow is simply:

```bash
git clone https://github.com/shivansh07adi-cloud/Harmonie.git
cd Harmonie
npm install
cp .env.example .env && nano .env
pm2 start src/index.js --name harmonie
pm2 save && pm2 startup
```

For future updates:
```bash
git pull
npm install       # only if package.json changed
pm2 restart harmonie
```

No inbound ports need to be opened — Baileys connects *out* to WhatsApp's servers, the same way WhatsApp Web does in a browser.

---

## How It's Built

- **Connection**: [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) — multi-device WhatsApp Web protocol, no Business API required
- **Database**: `better-sqlite3` — synchronous, zero-config, single-file
- **AI**: `@google/genai` (Gemini 2.5 Flash, with Google Search grounding for factual accuracy)
- **Media processing**: `sharp` (images), `ffmpeg` via `child_process` (video/audio/animated stickers), `node-webpmux` (sticker pack/author metadata)
- **Everything else**: plain Node.js — no framework, no ORM, no build step

Design principles followed throughout:
- One file per command group, registered centrally — adding a feature never means touching unrelated files
- All badge/XP/quiz thresholds live in single config files, never scattered through logic
- Every database migration is additive and idempotent — safe to pull new code onto an existing running bot without data loss
- Anti-abuse (cooldowns, daily caps, duplicate-message detection, admin exemptions) is real and tested, not decorative

---

## Notes on the Free APIs Used

Everything here works with **no paid API key** except Gemini (generous free tier). A few integrations are unofficial/public endpoints rather than documented APIs — they can change without notice, but each has a sensible fallback:

| Feature | Source | Notes |
|---|---|---|
| Weather | [Open-Meteo](https://open-meteo.com/) | Official, documented, free |
| Wikipedia | Wikipedia REST API | Official, free |
| Epic Games free games | Epic's own public JSON endpoint | Same one their website uses |
| Reddit | Public `.json` suffix on post URLs | No auth needed for public posts |
| Instagram (profile pic / downloads) | Unofficial web endpoints + meta-tag scraping | May break if Instagram changes their site |
| Twitter/X downloads | `vxtwitter.com` mirror API | Same technique most free Twitter-embed bots use |
| TikTok downloads | `tikwm.com` API | Free, keyless |
| Facebook downloads | Public preview meta-tag scraping | Public posts only — nothing behind a login wall |
| Translate / TTS (`!say`) | Unofficial Google Translate endpoints | Reliable in practice, undocumented |
| Search / Analytics / AI Assistant | Gemini (official, real API) | Requires `GEMINI_API_KEY` |
| Snapchat | **Not supported** | No reliable free/keyless method exists — left out rather than shipped broken |

---

## Adding a New Command

1. Create (or open) a file in `src/commands/` exporting a `commands` array:
   ```js
   export const commands = [
     {
       names: ['mycommand', 'mc'],
       description: 'What it does',
       usage: 'mycommand <arg>',
       category: 'General',
       async run(ctx) {
         return ctx.reply('Hello!');
       }
     }
   ];
   ```
2. Register the module in `src/commandRegistry.js` if it's a new file.
3. That's it — `!help` picks it up automatically.

`ctx` gives you: `reply()`, `replyImage()`, `replySticker()`, `replyVoiceNote()`, `downloadMedia()`, `isGroup`, `isSenderAdmin`, `isBotAdmin`, `mentionedJids`, `args`, `fullTextAfterCommand`, and more — see `src/context.js` for the full shape.
