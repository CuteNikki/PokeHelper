# Privacy Policy

_Last updated: November 9, 2026_

This policy explains what data the Discord bot **Poke Helper** ("the bot") processes, why, on what legal basis, and how long it's kept, as required by the General Data Protection Regulation (GDPR).

## Who is responsible

Nikki Sophie Berthold\
Email: [contact@niso.moe](mailto:contact@niso.moe)

The full address is in the [imprint](https://niso.moe/imprint).

## What the bot stores

The bot only stores what its features need. Everything is tied to Discord IDs, which are numbers Discord gives every user, server, channel, role and message.

**About you**

- **Leveling:** your XP in each server, all time and for the current week and month.
- **Counting:** how many numbers you counted and how many mistakes you made in each server, when you last counted, and the numbers you counted in each run, with their message IDs.
- **Birthdays:** your birthday, your timezone if you set one, whether your age is shown, and the servers it's announced in. You set this yourself with `/birthday`.
- **Friend codes:** the codes you add for the Nintendo Switch and Pokémon games. You add them yourself with `/friendcode set`, and anyone using the bot can look them up.
- **Reminders:** what you want to be reminded of, when, how often, where it goes and where you set it, and the timezone you picked for them. You set them yourself with `/remind`, and they're deleted once they went off for the last time or you delete them.
- **Temporary voice channels:** the channels you own, who you let in, kept out or made a moderator, and the settings you saved for your next channel, like its name and user limit.
- **Starboard:** which messages you starred, by reacting or with the button, and which of your messages others starred, so the posts can be updated and show who starred. What the messages say is in the posts on Discord, not in the database.
- **Moderation cases:** the warns, timeouts, kicks and bans you got in a server, with who gave them, why, when and until when, so its moderators can see your history there with `/cases`. Your download has them all, but not who gave them, as that's about the moderator. They're made by the bot's moderation commands, and by bans, kicks and timeouts done through Discord itself, which the bot sees in the audit log. If you're a moderator, which cases you made.
- **Giveaways:** the giveaways you entered and how many entries your roles gave you, the ones you won, with what you won, until when you had to claim your prize and when you did, and the giveaways you set up. Anyone in the server can see who entered a giveaway with its Participants button.
- **Roles the bot gave you**, like a birthday role or the weekly or monthly leveling role, so it can take them away again.

**About servers**

- The settings of each feature, like channels, roles, rewards, multipliers, role menus, log settings, the starboard, sticky messages and which features are turned on.
- Its giveaways: what's given away, who can enter, how long they run and their posts.

**Legal basis:** providing the features you and your server use (Art. 6(1)(b) GDPR). Your birthday and friend codes are only stored because you entered them yourself, to have your birthday announced and to share your codes. Moderation cases are kept for the legitimate interest of a server's staff in moderating their server (Art. 6(1)(f) GDPR).

## Messages

The bot reads messages in servers it's in, to count numbers, give XP, keep sticky messages at the bottom and write server logs. It does **not** save the content of messages in its database. It keeps recent messages in memory while it runs, so it can show what an edited or deleted message said. They're gone when the bot restarts.

If a server's staff turn on server logs, the bot posts edited and deleted messages, including their text and attachment names, in the server's log channel. Those log messages are part of that server, and its staff decide who can see them and how long they stay.

**Legal basis:** providing the features (Art. 6(1)(b) GDPR). For server logs, the legitimate interest of the server's staff in moderating their server (Art. 6(1)(f) GDPR).

## Other data the bot sees

To write server logs, the bot reads information Discord shares with it, like members joining and leaving, role and nickname changes, bans, timeouts, voice channel activity, invites and the audit log. This is posted to the server's log channels as set up by its staff, and isn't stored by the bot, except for bans, kicks and timeouts, which become moderation cases.

**Legal basis:** the legitimate interest of the server's staff in moderating their server (Art. 6(1)(f) GDPR).

## The bot's own log

The bot keeps a technical log of its own, to find and fix errors. It can contain IDs and names, like the server a command failed in. It's kept for **14 days** and then deleted automatically.

**Legal basis:** the legitimate interest in keeping the bot secure and working (Art. 6(1)(f) GDPR).

## Hosting

The bot and its database run on a server rented from LUME Solutions (Mario Kurz) in **Frankfurt am Main, Germany**. The data stays in the European Union. The provider only stores it for the bot and doesn't use it for anything else.

## Who the data is shared with

The data isn't sold, and isn't shared or used for anything other than the bot's features.

- **Discord:** the bot works through Discord, so everything it shows passes through Discord. Discord processes this data under its own [privacy policy](https://discord.com/privacy).
- **PokéAPI:** the bot uses [PokéAPI](https://pokeapi.co/) for Pokémon names, pictures and details, and for moves, items, abilities, berries, natures and places. Only these are looked up there, and no data about you is sent.

## How long data is kept

- **Server data**, including everyone's XP, counting stats and moderation cases there, is deleted **30 days after the bot is removed** from a server, unless it's added back before then.
- **Birthdays and friend codes** stay until you delete them with `/birthday`, `/friendcode set` or `/privacy`, as they aren't tied to one server.
- **Moderation cases** stay until the server's moderators delete them with `/cases`, or until the server's data is deleted. They're in your download, but deleting your data with `/privacy` keeps them, as they're the server's records, and otherwise anyone could wipe their own history. To object to a case, ask the server's moderators or email [contact@niso.moe](mailto:contact@niso.moe).
- **Giveaways** stay until the server's managers delete them in `/giveaway list`, or until the server's data is deleted. Drafts that weren't started are deleted after a day. Deleting your data with `/privacy` takes you out of the giveaways you entered and removes your name from the ones you won, but keeps the giveaways you started, as they're the server's.
- **Temporary voice channels** are forgotten once they're deleted. Saved settings for your next channel stay until you delete them with `/privacy`.
- **The bot's own log** is kept for 14 days.
- Server managers can reset the settings of a feature, like with `/logs-config reset`, or delete all of the server's data with `/privacy`.

## Your rights

Under the GDPR, you have the right to:

- **access** the data stored about you (Art. 15)
- have wrong data **corrected** (Art. 16)
- have your data **deleted** (Art. 17)
- have its processing **restricted** (Art. 18)
- get your data in a common, machine-readable format, to **take it elsewhere** (Art. 20)
- **object** to processing based on legitimate interest (Art. 21)

Use `/privacy` to download everything stored about you as a file, or to delete it, at any time. Server managers can download and delete their server's data there too. For anything else, email [contact@niso.moe](mailto:contact@niso.moe). Requests are answered within one month.

You also have the right to complain to a data protection authority. The one responsible for the bot is the [Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen](https://www.ldi.nrw.de/), but you can also turn to the one where you live.

## Children

You must be old enough to use Discord, as required by [Discord's Terms of Service](https://discord.com/terms), to use the bot.

## Changes

This policy may change as the bot does. The date at the top says when it last changed.
