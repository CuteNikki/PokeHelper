# Poke Helper

_A Pokémon themed Discord bot_

**Poke Helper** is a Discord bot made for a Pokémon community server. It runs the server's counting game, levels, birthdays, role menus, temporary voice channels, starboard, sticky messages, moderation and server logs, and has a Pokédex, a guessing game and a place for everyone's friend codes.

## ✨ Features

### 🔢 Counting

- Count up together in a channel, one number per person in a row
- Optional math, so `6*7` counts as 42
- Lives: set how many wrong numbers a run survives, and optionally get lives back at milestones
- Milestone reactions, records, recent runs and a leaderboard of who counted the most
- Catches up after downtime: numbers sent while the bot was offline still count
- Deleted numbers are reposted, so nobody can quietly break the count

### 📈 Leveling

- XP for chatting and for time in voice (not alone or deafened), with rank cards and a leaderboard as images, or as text for screen readers, which both switch between with a button, and all-time, weekly or monthly
- Level ups announced in their own channel, where the member chats or talks, or not at all
- Weekly and monthly leaderboards, switched between with a button, with a role for each winner and announcements in their own channel that can be turned off
- Level-up rewards, given out retroactively to members who already reached the level
- XP multipliers for roles and channels
- Ignore or allow only specific channels and roles

### 🎂 Birthdays

- Members set their birthday in their own panel, also in DMs, with their timezone and the servers it gets announced in
- Announcements and a birthday role for the day
- February 29 birthdays are celebrated on February 28 in other years
- Birthdays missed while the bot was offline are announced once it's back

### 🎭 Role Menus

- Menus where members pick their own roles with a button, one or as many as they like
- Your own title and description, and roles members need to use a menu
- Every change shows up in the posted menu right away, and deleted roles are taken out by themselves

### 📖 Pokédex

- Look up any Pokémon by name or number, with suggestions while typing
- An image with its picture, types, stats, breeding details and evolutions with how each one evolves, or a text version for screen readers, switched between with a button
- Shiny pictures, and buttons to go to the previous, next or another Pokémon without running the command again
- A Matchups button with what a Pokémon is weak to, with Pokémon and moves to use against it, and what it resists and can't be hurt by, as an image or text like the entry, for whoever presses it
- A Where to find button with the places it's met in the wild, game by game, with levels, how and the chance
- A Moves button with the moves it learns in each game, by leveling up, TM, egg and tutor
- Every page links to the ones it's about, like an ability to its Pokémon or a place to the Pokémon there, with a Back button
- `/dex` searches everything at once, Pokémon, moves, items and the rest, in any language
- `/type` shows what a type is strong and weak against, or the chart of all types as an image or text
- `/team` shows which types up to six Pokémon are weak to together
- `/move`, `/item`, `/ability`, `/berry`, `/nature` and `/location` look up the rest, with suggestions in every language too
- Names, pictures and details come from [PokéAPI](https://pokeapi.co/), so nothing has to be downloaded first
- `/guess`: guess a Pokémon from its silhouette, in any language, with up to three hints

### 🤝 Friend Codes

- Save your friend codes for the Nintendo Switch, Pokémon GO, Pokémon Sleep and Pokémon TCG Pocket once, and they work in every server
- Codes can be typed any way they're written, with or without dashes, spaces or `SW-`, and are shown the way each game does
- `/friendcode view` shares your codes in the chat, or shows someone else's, and so does right-clicking a member, under Apps
- A Copy button with the codes to paste into the games, as text can't be selected on phones
- Anyone who sees someone's codes can add their own right from there

### ⏰ Reminders

- `/remind` in a few minutes, hours or days, or at a date and time, like `2h 30m`, `tomorrow 9am`, `friday 6pm` or `24.12. 18:00`, in English or German
- Once, or every day, week, month or year, keeping the time on the clock over summer time
- By DM, or in the channel it was set in, each falling back to the other
- Times in your own timezone, picked once just for reminders
- A list to see and delete them, and a button to stop repeating ones where they show up
- Reminders missed while the bot was offline still go off once it's back

### 🔊 Temporary Voice Channels

- Join a channel to get a voice channel of your own, deleted once everyone left
- Several join channels per server, each with its own category and name
- Owners lock, hide, rename and limit their channel, let people in, keep them out or kick them, all from a panel in the channel
- Moderators chosen by the owner can let people in, keep them out, kick them and change the limit, but not rename the channel
- Owners can hand their channel over, and it passes to someone still there when the owner leaves

### ⭐ Starboard

- Messages with enough reactions are posted in a starboard channel, with who wrote them, their text and pictures, and a button to the message
- Your own emoji, also one of the server's, and how many reactions it takes
- Star by reacting to the message or with the star button on the post, and see who starred it
- The count on the post follows the stars, and the post goes when the message is deleted or falls below again
- The author's own star and bots' don't count, and channels can be left out
- Age-restricted messages only go on a starboard that's age-restricted too
- A post deleted by hand isn't posted again

### 📌 Sticky Messages

- A message that stays at the bottom of a channel or thread, like its rules or what it's for
- Posted again below once the chat is quiet for a moment, so a conversation doesn't move it with every message
- The post before is deleted, without it showing up in the server logs, and nobody is pinged by it
- Written and changed in a popup, emptied to remove it, and a list of where the server has them to change them from
- All turned off at once from that list, which takes them out of the channels but keeps them for later

### 🔨 Moderation

- `/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban` and `/unban`, with a reason and a DM telling the member why, which can be skipped
- Bans for good or for a while, lifted by themselves once they run out, also when the bot was offline meanwhile
- Bans also for people who aren't on the server, by their ID, and their messages deleted from up to 7 days back
- Every action is a numbered case, also when it's done through Discord itself, like from the menu on someone's name
- `/cases` shows someone's history: how many of each type, every case with its reason, who did it and until when, sorted newest or oldest first or by type
- The Moderation menu on a name has all of it in one place: whether they're timed out or banned, their cases, and buttons to warn, time out, kick or ban them, which ask the details in a popup
- Each case can be opened, its reason changed, or deleted after confirming, and shows its related cases, like the timeout a removed timeout ended, with a button to open them
- A running timeout or ban can end at another time: `3d` from now, `+1d` or `-2h` to move it, a date like `24.12. 18:00`, `never` to make a ban one for good, or `0` to end it right away, with a reason, as a case of its own
- Nobody can act on the server's owner, themselves, or someone whose highest role isn't below theirs
- `/purge` deletes up to 100 of a channel's latest messages, or only someone's

### 📜 Server Logs

- Messages, members, moderation, roles, channels, the server, emojis, threads, invites and voice
- A log channel for each group, or one default channel for all of them, and every event turned on or off on its own
- Who did it, from the audit log, with the reason they gave, and the case of bans, kicks and timeouts
- Edits with what changed crossed out and underlined, and long messages and bulk deletes as a file to read right in Discord
- A Copy IDs button with every ID of an entry, as text can't be selected on phones
- Channels and roles to leave out, like staff channels

### ⚙️ And more

- Interactive settings panels instead of a long list of config commands
- Every feature can be turned off in its settings, without losing them
- An animated mascot as avatar and banner, and a custom status to match, which change with the seasons and holidays, like a witch hat and "Happy Halloween! 🎃" in October
- `/help` lists the commands by category, and only the ones of features that are turned on
- English and German, following each member's Discord language
- `/privacy` to download or delete your own data, and server managers their server's
- Data of a server is deleted 30 days after the bot leaves it

### 🎨 Seasonal Looks

With `PROFILE_THEMES=on`, the bot changes its animated avatar, banner and custom status by itself. Holidays come before the season they fall in, and between the seasons it wears its standard look:

| When                                 | Theme           |
| ------------------------------------ | --------------- |
| The day the bot was made, every year | Birthday        |
| December 31 and January 1            | New Year        |
| February 13 to 15                    | Valentine's Day |
| Palm Sunday to Easter Monday         | Easter          |
| June                                 | Pride           |
| October                              | Halloween       |
| December                             | Christmas       |
| January 2 to 15                      | Standard        |
| January 16 to February 28            | Winter          |
| March 1 to 15                        | Standard        |
| March 16 to May 31                   | Spring          |
| July 2 to 15                         | Standard        |
| July 16 to August 31                 | Summer          |
| September 1 to 15                    | Standard        |
| September 16 to 30, and November     | Autumn          |

Days change at midnight UTC, and the bot puts the new look on within 15 minutes. `bun run themes` and `/dev theme-calendar` list the exact dates of the next twelve months, `/dev theme-preview` posts every look, with what its status says, in one GIF, and `/dev profile-theme` puts on any look right away.

![Every seasonal theme the bot wears](art/themes.gif)

## 💬 Commands

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `/counting`         | Current run, records, leaderboard, user stats and runs            |
| `/rank`             | Your rank card or someone else's, also in the menu of their name  |
| `/leaderboard`      | The server's level leaderboard, all time, weekly or monthly       |
| `/birthday`         | Your birthday, timezone and where it gets announced               |
| `/pokedex`          | Look up a Pokémon                                                 |
| `/guess`            | Guess a Pokémon from its silhouette                               |
| `/dex`              | Search everything: Pokémon, moves, items, abilities and places    |
| `/type`             | A type's strengths and weaknesses, or the chart of all types      |
| `/team`             | Which types your team is weak to                                  |
| `/move`             | Look up a move: type, power, accuracy, PP, effect and contests    |
| `/item`             | Look up an item: picture, effect and who holds it                 |
| `/ability`          | Look up an ability and which Pokémon have it                      |
| `/berry`            | Look up a berry: flavors, growth and Natural Gift                 |
| `/nature`           | Look up a nature, or see them all with their stats                |
| `/location`         | Look up a place and the wild Pokémon met there                    |
| `/friendcode`       | Add your friend codes, or show yours or someone else's            |
| `/remind`           | Set a reminder, once or repeating, and see and delete yours       |
| `/voice`            | The control panel of your temporary voice channel                 |
| `/help`             | All commands, by category                                         |
| `/privacy`          | Download or delete your data, or the server's                     |
| `/botinfo`          | Bot status, host stats and versions                               |
| `/counting-config`  | Set up the counting game and change its settings                  |
| `/leveling-config`  | Change leveling settings, rewards and multipliers                 |
| `/birthday-config`  | Set the birthday channel and role                                 |
| `/role-menu-config` | Create role menus and change them                                 |
| `/voice-config`     | Set up join channels for temporary voice channels                 |
| `/starboard-config` | Set up the starboard and change its settings                      |
| `/logs-config`      | Set up the log channels and which events are logged               |
| `/sticky`           | Keep a message at the bottom of a channel, change or remove it    |
| `/warn`             | Warn a member, which goes in their case history                   |
| `/timeout`          | Time out a member for as long as you say, up to 28 days           |
| `/untimeout`        | Take a member's timeout away before it runs out, with why         |
| `/kick`             | Kick a member from the server                                     |
| `/ban`              | Ban someone, for good or for a while, also when they're not there |
| `/unban`            | Lift a ban                                                        |
| `/cases`            | Someone's case history, also in the menu of their name            |
| `/purge`            | Delete a channel's latest messages, or only someone's             |
| `/dev`              | Reload, restart, log previews and the bot's look, dev server only |

The config commands need the **Manage Server** permission, `/counting-config` and `/voice-config` need **Manage Channels**, and `/sticky` needs **Manage Messages**. The moderation commands need what they do on Discord: **Moderate Members** for `/warn`, `/timeout`, `/untimeout` and `/cases`, **Kick Members** for `/kick`, **Ban Members** for `/ban` and `/unban`, and **Manage Messages** for `/purge`.

## 🛠️ Tech Stack

- [Bun](https://bun.sh): fast all-in-one JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/): type safety and modern JS features
- [discord.js](https://discord.js.org/): Discord API integration
- [Prisma](https://www.prisma.io/) with [PostgreSQL](https://www.postgresql.org/): type-safe database access
- [i18next](https://www.i18next.com/): translations
- [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas): rank cards, the leaderboard, the Pokédex and its matchups, and the mascot
- [gifenc](https://github.com/mattdesl/gifenc): the animated avatar and banner

## 🚀 Getting Started

### 1. Create the bot

[Create a Discord application](https://discord.com/developers/applications) and enable the privileged **Message Content** and **Server Members** intents. Server Members is needed for the member logs, like joins, leaves and role changes.

When inviting the bot, give it these permissions: View Channels, Send Messages, Attach Files, Add Reactions, Read Message History and Manage Roles. For role rewards, the bot's role has to be above the roles it gives out.

For temporary voice channels it also needs Manage Channels, Connect and Move Members, for server logs View Audit Log, to say who did what, and for moderation Moderate Members, Kick Members, Ban Members and Manage Messages, plus View Audit Log so actions done through Discord itself become cases too.

### 2. Install dependencies

```bash
bun install
```

### 3. Set up the database

```sql
CREATE DATABASE "mydb";
CREATE USER "myuser" WITH ENCRYPTED PASSWORD 'mypass';
GRANT ALL PRIVILEGES ON DATABASE "mydb" TO "myuser";
```

<details>
<summary>Still getting permission errors?</summary>

```sql
\c "mydb"
GRANT USAGE ON SCHEMA public TO "myuser";
GRANT CREATE ON SCHEMA public TO "myuser";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "myuser";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "myuser";
```

</details>

### 4. Fill in the environment

Copy `.env.example` to `.env` and fill it in:

| Variable         | Description                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DISCORD_TOKEN`  | The bot token                                                                                                            |
| `DISCORD_ID`     | The application ID                                                                                                       |
| `DEV_GUILD_ID`   | Server where `/dev` is registered, only visible there                                                                    |
| `DATABASE_URL`   | Like `postgresql://myuser:mypass@localhost:5432/mydb` for a local server                                                 |
| `PROFILE_THEMES` | `on` to change the avatar, banner and custom status with the seasons and holidays by itself. Only on one copy of the bot |

### 5. Create the tables

```bash
bunx prisma migrate deploy
bunx prisma generate
```

When changing `prisma/schema.prisma` yourself, use `bunx prisma migrate dev` instead to create a new migration.

### 6. Register the commands and start

```bash
bun run register
bun run dev
```

After that, `/dev reload` and `/dev register` pick up changes without restarting, and `/dev restart` restarts the bot for everything else.

### 🐳 Docker

The `docker-compose.yml` expects PostgreSQL in an external Docker network called `postgres_default`. With `.env` filled in:

```bash
docker compose up -d --build
docker compose exec pokehelper bunx prisma migrate deploy
```

## 🧑‍💻 Development

| Script             | What it does                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`      | Start the bot                                                                                                                                                                    |
| `bun run register` | Register slash commands                                                                                                                                                          |
| `bun test`         | Run the tests                                                                                                                                                                    |
| `bun run lint`     | Lint with ESLint                                                                                                                                                                 |
| `bun run format`   | Format with Prettier                                                                                                                                                             |
| `bun run art`      | Render the avatar and banner, with stills of both, in every theme or the ones named, like `bun run art halloween`. `--readme` also updates the `art/themes.gif` the README shows |
| `bun run profile`  | Upload them to the bot: `--avatar art/out/standard/avatar.gif --banner art/out/standard/banner.gif`                                                                              |
| `bun run themes`   | Which seasonal look the bot wears when, over the next twelve months                                                                                                              |

Translations live in `src/locales/<language>/`: `messages.json` for the texts, `commands.json` for the command names and descriptions, and `time.json` for the words reminders understand, like units, weekdays and "tomorrow". English is the source; missing German texts fall back to it. A new language only needs its folder, and reminders understand the words of every language at once.

What the bot says about itself lives in `listing/`, to keep it up to date with the features:

- `description.txt`: the description on its profile, up to 400 characters. It's put on the bot when it starts, so change it here, as a change in the developer portal is replaced with the next start.
- `summary.txt` and `directory.md`: the summary, up to 200 characters, and the description of its App Directory page. Discord has no API for those, so they're pasted into the developer portal's Discovery settings by hand.

## 🤝 Contributing

Contributions, issues and feature requests are welcome. Feel free to [open an issue](https://github.com/CuteNikki/PokeHelper/issues) or a [pull request](https://github.com/CuteNikki/PokeHelper/pulls).

## ⭐ Show your Support

Please star this repository if this project helped you!

## 📄 License

This project is licensed under the [MIT License](LICENSE). Using the bot is covered by its [Terms of Service](TERMS.md) and [Privacy Policy](PRIVACY.md).
