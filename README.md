# Poke Helper

_A Pokémon themed Discord bot_

**Poke Helper** is a Discord bot made for a Pokémon community server. It runs the server's counting game, levels, birthdays and reaction roles, in English and German.

## ✨ Features

### 🔢 Counting

- Count up together in a channel, one number per person in a row
- Optional math, so `6*7` counts as 42
- Lives: set how many wrong numbers a run survives, and optionally get lives back at milestones
- Milestone reactions, records, recent runs and a leaderboard of who counted the most
- Catches up after downtime: numbers sent while the bot was offline still count
- Deleted numbers are reposted, so nobody can quietly break the count

### 📈 Leveling

- XP for chatting, with rank cards and a leaderboard as images, or as text for screen readers
- A weekly leaderboard, with a role for the weekly winner
- Level-up rewards, given out retroactively to members who already reached the level
- XP multipliers for roles and channels
- Ignore or allow only specific channels and roles

### 🎂 Birthdays

- Members set their birthday once, with their own timezone, and pick the servers it gets announced in
- Announcements and a birthday role for the day
- February 29 birthdays are celebrated on February 28 in other years
- Birthdays missed while the bot was offline are announced once it's back

### 🎭 Role Menus

- Menus where members pick their own roles with a button, one or as many as they like
- Your own title and description, and roles members need to use a menu
- Every change shows up in the posted menu right away, and deleted roles are taken out by themselves

### ⚙️ And more

- Interactive settings panels instead of a long list of config commands
- English and German, following each member's Discord language
- Data of a server is deleted 30 days after the bot leaves it

## 💬 Commands

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `/counting`         | Current run, records, leaderboard, user stats and runs |
| `/rank`             | Your rank card or someone else's                       |
| `/leaderboard`      | The server's level leaderboard, all time or weekly     |
| `/birthday`         | Set, edit, show or remove your birthday                |
| `/botinfo`          | Bot status, host stats and versions                    |
| `/counting-config`  | Set up the counting game and change its settings       |
| `/leveling-config`  | Change leveling settings, rewards and multipliers      |
| `/birthday-config`  | Set the birthday channel and role                      |
| `/role-menu-config` | Create role menus and change them                      |
| `/dev`              | Reload and register commands, only in the dev server   |

The config commands need the **Manage Server** permission.

## 🛠️ Tech Stack

- [Bun](https://bun.sh): fast all-in-one JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/): type safety and modern JS features
- [discord.js](https://discord.js.org/): Discord API integration
- [Prisma](https://www.prisma.io/) with [PostgreSQL](https://www.postgresql.org/): type-safe database access
- [i18next](https://www.i18next.com/): translations
- [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas): rank card and leaderboard images

## 🚀 Getting Started

### 1. Create the bot

[Create a Discord application](https://discord.com/developers/applications) and enable the privileged **Message Content** intent.

When inviting the bot, give it these permissions: View Channels, Send Messages, Attach Files, Add Reactions, Read Message History and Manage Roles. For role rewards, the bot's role has to be above the roles it gives out.

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

| Variable        | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `DISCORD_TOKEN` | The bot token                                                            |
| `DISCORD_ID`    | The application ID                                                       |
| `DEV_GUILD_ID`  | Server where `/dev` is registered, only visible there                    |
| `DATABASE_URL`  | Like `postgresql://myuser:mypass@localhost:5432/mydb` for a local server |

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

After that, `/dev reload` and `/dev register` pick up changes without restarting.

### 🐳 Docker

The `docker-compose.yml` expects PostgreSQL in an external Docker network called `postgres_default`. With `.env` filled in:

```bash
docker compose up -d --build
docker compose exec pokehelper bunx prisma migrate deploy
```

## 🧑‍💻 Development

| Script             | What it does            |
| ------------------ | ----------------------- |
| `bun run dev`      | Start the bot           |
| `bun run register` | Register slash commands |
| `bun test`         | Run the tests           |
| `bun run lint`     | Lint with ESLint        |
| `bun run format`   | Format with Prettier    |

Translations live in `src/locales/<language>/messages.json`. English is the source; missing German texts fall back to it.

## 🤝 Contributing

Contributions, issues and feature requests are welcome. Feel free to [open an issue](https://github.com/CuteNikki/poke-helper/issues) or a [pull request](https://github.com/CuteNikki/poke-helper/pulls).

## ⭐ Show your Support

Please star this repository if this project helped you!

## 📄 License

This project is licensed under the [MIT License](LICENSE).
