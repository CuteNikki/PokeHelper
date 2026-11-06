import {
  ApplicationIntegrationType,
  AttachmentBuilder,
  ChatInputCommandInteraction,
  ContainerBuilder,
  InteractionContextType,
  MediaGalleryBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';
import { t } from 'i18next';

import type { ExtendedClient } from 'classes/base/client';
import { Command } from 'classes/base/command';

import { scheduleLines } from 'art/calendar';
import { THEMES } from 'art/themes';

import { getBotProfile, updateBotProfile } from 'database/botProfile';
import { prisma } from 'database/index';

import { registerCommands } from 'utility/commandRegistration';
import { logger } from 'utility/logger';
import { changedSinceStart, reload, RELOAD_TARGETS, type ReloadTarget } from 'utility/reload';
import { logTranslate } from 'utility/logs/send';
import { sendPreview } from 'utility/logs/preview';
import { isThemeName, madeOn, profileThemesEnabled, syncProfileTheme, themeOverview, wantedTheme } from 'utility/profileTheme';
import { createResponse } from 'utility/response';

export default new Command({
  devOnly: true,
  cooldown: 0,
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    // Hidden from everyone but administrators in the developer server, on top of the developer check
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setName('dev')
    .setDescription('Tools for the bot developers')
    .addSubcommand((cmd) =>
      cmd
        .setName('reload')
        .setDescription('Reload commands, buttons, selects, events and text without restarting')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('What to reload. Defaults to everything')
            .addChoices({ name: 'everything', value: 'all' }, ...RELOAD_TARGETS.map((target) => ({ name: target, value: target }))),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('register').setDescription('Reload the commands and register them with Discord'))
    .addSubcommand((cmd) => cmd.setName('restart').setDescription('Restart the bot, for changes a reload does not pick up'))
    .addSubcommand((cmd) => cmd.setName('log-preview').setDescription('Post sample log entries here, to see how logs look'))
    .addSubcommand((cmd) =>
      cmd
        .setName('profile-theme')
        .setDescription("Put a theme on the bot's profile now, even if it's worn already, or go back to the calendar")
        .addStringOption((option) =>
          option
            .setName('theme')
            .setDescription('The theme, or auto for the one of the day')
            .setRequired(true)
            .addChoices({ name: 'auto', value: 'auto' }, ...Object.keys(THEMES).map((name) => ({ name, value: name }))),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('theme-calendar').setDescription('Which theme the bot wears when, over the next twelve months'))
    .addSubcommand((cmd) => cmd.setName('theme-preview').setDescription('Post every theme of the avatar and banner in one GIF here')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'reload':
        return handleReload(interaction);
      case 'register':
        return handleRegister(interaction);
      case 'restart':
        return handleRestart(interaction);
      case 'log-preview':
        return handleLogPreview(interaction);
      case 'profile-theme':
        return handleProfileTheme(interaction);
      case 'theme-calendar':
        return handleThemeCalendar(interaction);
      case 'theme-preview':
        return handleThemePreview(interaction);
    }
  },
});

async function handleReload(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const target = interaction.options.getString('target') ?? 'all';
  const targets = target === 'all' ? RELOAD_TARGETS : [target as ReloadTarget];
  const results = await reload(interaction.client as ExtendedClient, targets);
  const changed = await changedSinceStart();

  const lines = [
    t('dev.reload.title'),
    ...results.map((result) =>
      result.count === null
        ? t('dev.reload.locales', { duration: result.duration.toFixed(2) })
        : t('dev.reload.line', { target: result.target, count: result.count, duration: result.duration.toFixed(2) }),
    ),
    ...(changed.length > 0 ? ['', t('dev.reload.needsRestart', { files: changed.map((file) => `- \`${file}\``).join('\n') })] : []),
    t('dev.reload.registerHint'),
  ];
  return interaction.editReply(createResponse(lines.join('\n'), changed.length > 0 ? 'warning' : 'success'));
}

async function handleRegister(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Reload first, so the latest command definitions are the ones registered
  const client = interaction.client as ExtendedClient;
  await reload(client, ['commands']);
  const result = await registerCommands(interaction.client.rest, interaction.client.application.id, [...client.commands.values()], process.env.DEV_GUILD_ID);

  const lines = [
    t('dev.register.success', { count: result.global }),
    result.dev === null ? t('dev.register.devSkipped') : t('dev.register.dev', { count: result.dev }),
  ];
  return interaction.editReply(createResponse(lines.join('\n'), 'success'));
}

/**
 * Restart the bot, for changes to shared code that a reload doesn't pick up.
 * The bot shuts down cleanly and relies on something starting it again, like Docker with `restart: unless-stopped`.
 * Whatever happens while it's away is caught up on, like counting and scheduled jobs.
 */
async function handleRestart(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.reply({ ...createResponse(t('dev.restart.message'), 'warning'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
  logger.info(`Restarting, as asked by ${interaction.user.tag} (${interaction.user.id})`);

  await interaction.client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

/** Post sample log entries in this channel, in the server's language like real ones, to see how they look. */
async function handleLogPreview(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  if (!interaction.channel?.isSendable()) return interaction.editReply(createResponse("I can't post in this channel.", 'error'));
  await sendPreview(interaction.channel, interaction.member, logTranslate(interaction.guild));
  return interaction.editReply(createResponse('Posted the sample log entries.', 'success'));
}

/** What happened to the avatar or banner, for the answer. */
const SYNC_TEXT = { changed: 'changed', unchanged: 'already wearing it', tooSoon: 'changed too recently, tried again within 15 minutes' } as const;

/** Put a theme on the profile right away, or go back to the calendar. It stays until changed again, also across restarts. */
async function handleProfileTheme(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const choice = interaction.options.getString('theme', true);
  await updateBotProfile({ override: isThemeName(choice) ? choice : null });
  // Always uploaded again, so changed artwork can be put on without waiting for the next theme
  const result = await syncProfileTheme(interaction.client, true);
  const lines = [
    `Wearing the **${result.theme}** theme${isThemeName(choice) ? ' until set back to auto' : ', the one of the day'}.`,
    `Avatar: ${SYNC_TEXT[result.avatar]}. Banner: ${SYNC_TEXT[result.banner]}. Status: ${result.status}`,
    profileThemesEnabled() ? null : subtext('PROFILE_THEMES is off here, so it only changes when you use this command.'),
  ];
  return interaction.editReply(createResponse(lines.filter(Boolean).join('\n'), 'success'));
}

/** Which theme the bot wears now, and when it wears which over the next twelve months, in a code block. */
async function handleThemeCalendar(interaction: ChatInputCommandInteraction<'cached'>) {
  const profile = await getBotProfile();
  const override = isThemeName(profile?.override) ? profile.override : null;
  const lines = [
    override
      ? `Wearing **${override}**, picked by hand. \`/dev profile-theme auto\` goes back to the calendar below.`
      : `Wearing **${wantedTheme(interaction.client, null)}**, the theme of the day.`,
    profileThemesEnabled() ? null : "-# PROFILE_THEMES is off here, so the bot doesn't change by itself.",
    ['```', ...scheduleLines(madeOn(interaction.client)), '```'].join('\n'),
  ];
  return interaction.reply({ ...createResponse(lines.filter(Boolean).join('\n'), 'info'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
}

/** Every theme in one GIF, posted for everyone in the channel to see, like to show them off. */
async function handleThemePreview(interaction: ChatInputCommandInteraction<'cached'>) {
  // Drawing it the first time takes a few seconds
  await interaction.deferReply();
  const gif = await themeOverview();
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### Poke Helper's Looks 🎨\n-# Every theme the avatar, banner and status wear through the year"),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems((item) =>
        item.setURL('attachment://themes.gif').setDescription('Every theme of the bot, each with its animated banner and avatar'),
      ),
    );
  return interaction.editReply({
    components: [container],
    files: [new AttachmentBuilder(Buffer.from(gif), { name: 'themes.gif' })],
    flags: [MessageFlags.IsComponentsV2],
  });
}
