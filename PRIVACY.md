# Privacy Policy

_Last updated: November 4, 2026_

This policy explains what data **Poke Helper** ("the bot") collects, why, and how long it's kept. By using the bot, or adding it to a server or your account, you agree to this policy.

## What the bot stores

The bot only stores what its features need. Everything is tied to Discord IDs, which are numbers Discord gives every user, server, channel, role and message.

**About you**

- **Leveling:** your XP in each server, all time and for the current week.
- **Counting:** how many numbers you counted and how many mistakes you made in each server, when you last counted, and the numbers you counted in each run, with their message IDs.
- **Birthdays:** your birthday, your timezone if you set one, whether your age is shown, and the servers it's announced in. You set this yourself with `/birthday`.
- **Temporary voice channels:** the channels you own, who you let in, kept out or made a moderator, and the settings you saved for your next channel, like its name and user limit.
- **Roles the bot gave you**, like a birthday role or the weekly leveling role, so it can take them away again.

**About servers**

- The settings of each feature, like channels, roles, rewards, multipliers, role menus, log settings and which features are turned on.

## Messages

The bot reads messages in servers it's in, to count numbers, give XP and write server logs. It does **not** save the content of messages in its database.

If a server's staff turn on server logs, the bot posts edited and deleted messages, including their text and attachment names, in the server's log channel. Those log messages are part of that server, and its staff decide who can see them and how long they stay. The bot keeps recent messages in memory only while it runs, so it can show what an edited or deleted message said.

## Other data the bot sees

To write server logs, the bot reads information Discord shares with it, like members joining and leaving, role and nickname changes, bans, timeouts, voice channel activity, invites and the audit log. This is posted to the server's log channels as set up by its staff, and isn't stored by the bot.

The bot also keeps a technical log of its own, on the server it runs on, to find and fix errors. It can contain IDs and names, like the name of a command that failed.

## Who the data is shared with

Nobody. The data isn't sold, shared or used for anything other than the bot's features.

The bot uses [PokéAPI](https://pokeapi.co/) for Pokémon names, pictures and details. Only Pokémon are looked up there, and no data about you is sent.

## How long data is kept

- **Server data**, including everyone's XP and counting stats there, is deleted **30 days after the bot is removed** from a server, unless it's added back before then.
- **Birthdays** stay until you delete them with `/birthday`, as they aren't tied to one server.
- **Temporary voice channels** are forgotten once they're deleted. Saved settings for your next channel stay until you ask for them to be deleted.
- Server staff can reset the settings of a feature, like with `/logs-config reset`.

## Your rights

You can ask to see the data stored about you, or to have it deleted, at any time. [Open an issue](https://github.com/CuteNikki/poke-helper/issues) or contact the developer on Discord. Deleting your data resets your XP and counting stats in every server.

## Children

You must be old enough to use Discord, as required by [Discord's Terms of Service](https://discord.com/terms), to use the bot.

## Changes

This policy may change as the bot does. The date at the top says when it last changed.

## Contact

Questions about this policy can be asked by [opening an issue](https://github.com/CuteNikki/poke-helper/issues).
