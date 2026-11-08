import {
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ChannelType,
  type PermissionsString,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

import {
  getGiveaway,
  type Giveaway,
  MAX_BONUS,
  MAX_CLAIM_MINUTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_HOST_LENGTH,
  MAX_PRIZE_LENGTH,
  MAX_RULE_ROLES,
  MAX_WINNERS,
  MIN_CLAIM_MINUTES,
  MIN_DURATION_MINUTES,
  MIN_WINNERS,
  setBonusRole,
  setGiveawayRoles,
  updateGiveaway,
} from 'database/giveaways';
import { getGuildLevelingConfiguration } from 'database/leveling';

import { buttonIcon } from 'utility/emojis';
import { formatNumber, MINUTE } from 'utility/duration';
import { refreshAllEntries } from 'utility/giveaways/end';
import { GIVEAWAY_CHANNEL_PERMISSIONS, manageId } from 'utility/giveaways/ids';
import { formatMinutes, minutesText, parseMinutes, parseWhole } from 'utility/giveaways/input';
import { buildGiveawayPost } from 'utility/giveaways/post';
import { rulesOf } from 'utility/giveaways/rules';
import { syncPost } from 'utility/giveaways/sync';
import type { Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createSettingsPanel, formatPermissions, missingBotPermissions, type SettingsPanel } from 'utility/settings';

/** Each giveaway has its own panel, with the giveaway's ID after this. */
export const GIVEAWAY_PANEL_PREFIX = 'giveaway-';
/** Custom IDs of the buttons under a draft, with the giveaway's ID after them. */
export const GIVEAWAY_DRAFT_CUSTOM_ID = {
  start: 'gwdraft:start:',
  discard: 'gwdraft:discard:',
} as const;

/** The longest someone can have to be on the server, or their account be old, which is as long as Discord has been around. */
const MAX_AGE_MINUTES = 20 * 365 * 24 * 60;
const MAX_LEVEL = 1000;

/** A giveaway as its panel sees it: with whether leveling is on, as only then a level can be asked for. */
type GiveawayConfig = Giveaway & { levelingEnabled: boolean };

const roleIdsOf = (giveaway: Giveaway, kind: 'required' | 'blocked') => giveaway.roles.filter((role) => role.kind === kind).map((role) => role.roleId);

/** What a draft says above its settings: where it goes, and what's missing for it to be posted there. */
function draftHeader(giveaway: Giveaway, guild: { channels: { cache: { has: (id: string) => boolean } } } | null, missing: PermissionsString[], t: Translate) {
  const lines = [t('giveaway.draft.header', { channel: channelMention(giveaway.channelId) })];
  if (guild && !guild.channels.cache.has(giveaway.channelId)) lines.push(t('settings.warning', { warning: t('giveaway.draft.missingChannel') }));
  else if (missing.length > 0) {
    lines.push(t('settings.warning', { warning: t('giveaway.draft.missingPermissions', { permissions: formatPermissions(missing, t) }) }));
  }
  return lines.join('\n');
}

/** A duration setting, typed like `7d`, which can be left empty for none. */
function ageSetting(key: 'memberAge' | 'accountAge', field: 'minMemberMinutes' | 'minAccountMinutes', giveawayId: string) {
  return {
    type: 'text' as const,
    key,
    category: 'rules',
    maxLength: 50,
    label: (t: Translate) => t(`giveaway.settings.${key}.label`),
    description: (t: Translate) => t(`giveaway.settings.${key}.description`),
    placeholder: (t: Translate) => t('giveaway.settings.durationPlaceholder'),
    // Shown as the duration it is, in the language of whoever looks at it
    get: (giveaway: GiveawayConfig) => (giveaway[field] ? minutesText(giveaway[field]) : null),
    formatValue: (value: string, t: Translate) => formatMinutes(parseMinutes(value, 0, Infinity) ?? 0, t),
    validate: (text: string, t: Translate) => (parseMinutes(text, 1, MAX_AGE_MINUTES) === null ? t('giveaway.settings.invalidDuration') : null),
    set: (_guildId: string, text: string | null) => updateGiveaway(giveawayId, { [field]: text ? parseMinutes(text, 1, MAX_AGE_MINUTES) : null }),
  };
}

/** Start and Throw away, under a draft. */
const draftButtons = (giveaway: Giveaway, t: Translate) => [
  new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_DRAFT_CUSTOM_ID.start}${giveaway.id}`)
    .setLabel(t('giveaway.draft.start'))
    .setEmoji(buttonIcon('send'))
    .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_DRAFT_CUSTOM_ID.discard}${giveaway.id}`)
    .setLabel(t('giveaway.draft.discard'))
    .setEmoji(buttonIcon('trash-2'))
    .setStyle(ButtonStyle.Danger),
];

const isDraft = (giveaway: Giveaway) => giveaway.status === 'draft';
/** Minutes left until a running giveaway ends, at least 1. */
const minutesLeft = (giveaway: Giveaway) => Math.max(1, Math.ceil(((giveaway.endsAt?.getTime() ?? Date.now()) - Date.now()) / MINUTE));

/**
 * The settings of a giveaway: a draft before it starts, with a preview of its post under them, and once it runs, what can still
 * change, which shows on its post right away. Every setting is saved right away, so a draft can be left and picked up again until
 * it's started or deleted.
 */
export function getGiveawaySettings(giveawayId: string): SettingsPanel {
  const panel = createSettingsPanel<GiveawayConfig>({
    id: `${GIVEAWAY_PANEL_PREFIX}${giveawayId}`,
    title: (t) => t('giveaway.draft.title'),
    permissions: ['ManageGuild'],
    categories: [
      { id: 'basics', label: (t) => t('giveaway.settings.categories.basics'), icon: 'gift' },
      { id: 'rules', label: (t) => t('giveaway.settings.categories.rules'), icon: 'shield' },
      { id: 'winners', label: (t) => t('giveaway.settings.categories.winners'), icon: 'trophy' },
    ],
    // The panel's custom IDs carry the giveaway's ID, so make sure it's one of this server that can still change
    load: async (guildId) => {
      const [giveaway, leveling] = await Promise.all([getGiveaway(guildId, giveawayId), getGuildLevelingConfiguration(guildId)]);
      if (giveaway?.status !== 'draft' && giveaway?.status !== 'active') return null;
      return { ...giveaway, levelingEnabled: leveling?.enabled ?? false };
    },
    notConfigured: (t) => t('giveaway.draft.gone'),
    header: (giveaway, { guild }, t) =>
      isDraft(giveaway)
        ? draftHeader(giveaway, guild, guild ? missingBotPermissions(guild, giveaway.channelId, GIVEAWAY_CHANNEL_PERMISSIONS) : [], t)
        : t('giveaway.edit.header'),
    footer: (giveaway, t) =>
      isDraft(giveaway)
        ? draftButtons(giveaway, t)
        : [new ButtonBuilder().setCustomId(manageId('view', giveaway.id)).setLabel(t('giveaway.manage.back')).setStyle(ButtonStyle.Secondary)],
    // A running giveaway's post shows the change right away. A draft has no post yet, which this then leaves alone
    onSaved: async ({ guild }) => {
      if (guild) await syncPost(guild, giveawayId);
    },
    tips: (t) => t('giveaway.settings.tips', { returnObjects: true }),
    settings: [
      {
        type: 'text',
        key: 'prize',
        category: 'basics',
        maxLength: MAX_PRIZE_LENGTH,
        required: true,
        label: (t) => t('giveaway.settings.prize.label'),
        description: (t) => t('giveaway.settings.prize.description'),
        get: (giveaway) => giveaway.prize,
        set: async (_guildId, prize) => {
          if (prize) await updateGiveaway(giveawayId, { prize });
        },
      },
      {
        type: 'text',
        key: 'description',
        category: 'basics',
        maxLength: MAX_DESCRIPTION_LENGTH,
        paragraph: true,
        label: (t) => t('giveaway.settings.description.label'),
        description: (t) => t('giveaway.settings.description.description'),
        get: (giveaway) => giveaway.description,
        set: (_guildId, description) => updateGiveaway(giveawayId, { description }),
      },
      {
        type: 'text',
        key: 'host',
        category: 'basics',
        maxLength: MAX_HOST_LENGTH,
        label: (t) => t('giveaway.settings.host.label'),
        description: (t) => t('giveaway.settings.host.description'),
        placeholder: (t) => t('giveaway.settings.host.placeholder'),
        get: (giveaway) => giveaway.host,
        set: (_guildId, host) => updateGiveaway(giveawayId, { host }),
      },
      {
        type: 'text',
        key: 'winners',
        category: 'basics',
        maxLength: 2,
        required: true,
        label: (t) => t('giveaway.settings.winners.label'),
        description: (t) => t('giveaway.settings.winners.description', { max: MAX_WINNERS }),
        get: (giveaway) => String(giveaway.winnerCount),
        formatValue: (value, t) => formatNumber(Number(value), t),
        validate: (text, t) => (parseWhole(text, MIN_WINNERS, MAX_WINNERS) === null ? t('giveaway.settings.winners.invalid', { max: MAX_WINNERS }) : null),
        set: async (_guildId, text) => {
          const winnerCount = text ? parseWhole(text, MIN_WINNERS, MAX_WINNERS) : null;
          if (winnerCount) await updateGiveaway(giveawayId, { winnerCount });
        },
      },
      {
        type: 'text',
        key: 'duration',
        category: 'basics',
        maxLength: 50,
        required: true,
        label: (t) => t('giveaway.settings.duration.label'),
        description: (t) => t('giveaway.settings.duration.description'),
        placeholder: (t) => t('giveaway.settings.durationPlaceholder'),
        // Once it runs, it's when it ends that can change, see below
        hidden: (giveaway) => !isDraft(giveaway),
        get: (giveaway) => minutesText(giveaway.durationMinutes),
        formatValue: (value, t) => formatMinutes(parseMinutes(value, 0, Infinity) ?? 0, t),
        validate: (text, t) =>
          parseMinutes(text, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES) === null
            ? t('giveaway.settings.duration.invalid', { max: formatMinutes(MAX_DURATION_MINUTES, t) })
            : null,
        set: async (_guildId, text) => {
          const durationMinutes = text ? parseMinutes(text, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES) : null;
          if (durationMinutes) await updateGiveaway(giveawayId, { durationMinutes });
        },
      },
      {
        type: 'text',
        key: 'endsIn',
        category: 'basics',
        maxLength: 50,
        required: true,
        label: (t) => t('giveaway.settings.endsIn.label'),
        description: (t) => t('giveaway.settings.endsIn.description'),
        placeholder: (t) => t('giveaway.settings.durationPlaceholder'),
        hidden: isDraft,
        get: (giveaway) => minutesText(minutesLeft(giveaway)),
        formatValue: (value, t) => formatMinutes(parseMinutes(value, 0, Infinity) ?? 0, t),
        validate: (text, t) =>
          parseMinutes(text, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES) === null
            ? t('giveaway.settings.duration.invalid', { max: formatMinutes(MAX_DURATION_MINUTES, t) })
            : null,
        // Counted from now, like the duration of a draft is counted from its start
        set: async (_guildId, text) => {
          const minutes = text ? parseMinutes(text, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES) : null;
          if (minutes) await updateGiveaway(giveawayId, { endsAt: new Date(Date.now() + minutes * MINUTE) });
        },
      },
      {
        type: 'channel',
        key: 'channel',
        category: 'basics',
        channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
        required: true,
        botPermissions: GIVEAWAY_CHANNEL_PERMISSIONS,
        // Its post can't move once it's posted
        hidden: (giveaway) => !isDraft(giveaway),
        label: (t) => t('giveaway.settings.channel.label'),
        description: (t) => t('giveaway.settings.channel.description'),
        get: (giveaway) => giveaway.channelId,
        set: async (_guildId, channelId) => {
          if (channelId) await updateGiveaway(giveawayId, { channelId });
        },
      },
      {
        type: 'role',
        key: 'ping',
        category: 'basics',
        label: (t) => t('giveaway.settings.ping.label'),
        description: (t) => t('giveaway.settings.ping.description'),
        // Only pinged when it starts
        hidden: (giveaway) => !isDraft(giveaway),
        get: (giveaway) => giveaway.pingRoleId,
        set: (_guildId, pingRoleId) => updateGiveaway(giveawayId, { pingRoleId }),
      },
      {
        type: 'roles',
        key: 'required',
        category: 'rules',
        max: MAX_RULE_ROLES,
        label: (t) => t('giveaway.settings.required.label'),
        description: (t) => t('giveaway.settings.required.description'),
        get: (giveaway) => roleIdsOf(giveaway, 'required'),
        set: (_guildId, roleIds) =>
          setGiveawayRoles(
            giveawayId,
            'required',
            roleIds.map((roleId) => ({ roleId })),
          ),
      },
      {
        type: 'choice',
        key: 'requireAll',
        category: 'rules',
        defaultValue: 'any',
        options: [
          { value: 'any', label: (t) => t('giveaway.settings.requireAll.any') },
          { value: 'all', label: (t) => t('giveaway.settings.requireAll.all') },
        ],
        label: (t) => t('giveaway.settings.requireAll.label'),
        description: (t) => t('giveaway.settings.requireAll.description'),
        // Only matters with more than one
        hidden: (giveaway) => roleIdsOf(giveaway, 'required').length < 2,
        get: (giveaway) => (giveaway.requireAllRoles ? 'all' : 'any'),
        set: (_guildId, value) => updateGiveaway(giveawayId, { requireAllRoles: value === 'all' }),
      },
      {
        type: 'roles',
        key: 'blocked',
        category: 'rules',
        max: MAX_RULE_ROLES,
        label: (t) => t('giveaway.settings.blocked.label'),
        description: (t) => t('giveaway.settings.blocked.description'),
        get: (giveaway) => roleIdsOf(giveaway, 'blocked'),
        set: (_guildId, roleIds) =>
          setGiveawayRoles(
            giveawayId,
            'blocked',
            roleIds.map((roleId) => ({ roleId })),
          ),
      },
      {
        type: 'text',
        key: 'level',
        category: 'rules',
        maxLength: 4,
        label: (t) => t('giveaway.settings.level.label'),
        description: (t) => t('giveaway.settings.level.description'),
        // Only with leveling on, as there are no levels to go by otherwise. Still shown when it's set, so it can be taken away
        hidden: (giveaway) => !giveaway.levelingEnabled && giveaway.minLevel === null,
        get: (giveaway) => (giveaway.minLevel ? String(giveaway.minLevel) : null),
        formatValue: (value, t) => formatNumber(Number(value), t),
        validate: (text, t) => (parseWhole(text, 1, MAX_LEVEL) === null ? t('giveaway.settings.level.invalid', { max: MAX_LEVEL }) : null),
        set: (_guildId, text) => updateGiveaway(giveawayId, { minLevel: text ? parseWhole(text, 1, MAX_LEVEL) : null }),
      },
      ageSetting('memberAge', 'minMemberMinutes', giveawayId),
      ageSetting('accountAge', 'minAccountMinutes', giveawayId),
      {
        type: 'entries',
        key: 'bonus',
        category: 'winners',
        target: 'role',
        max: MAX_RULE_ROLES,
        presets: [1, 2, 3, 5],
        defaultValue: 1,
        label: (t) => t('giveaway.settings.bonus.label'),
        description: (t) => t('giveaway.settings.bonus.description'),
        formatValue: (bonus: number, t: Translate) => t('giveaway.settings.bonus.value', { bonus: formatNumber(bonus, t) }),
        input: {
          label: (t) => t('giveaway.settings.bonus.input', { max: MAX_BONUS }),
          maxLength: 2,
          parse: (input) => parseWhole(input, 1, MAX_BONUS),
          invalid: (t) => t('giveaway.settings.bonus.invalid', { max: MAX_BONUS }),
        },
        get: (giveaway) => giveaway.roles.filter((role) => role.kind === 'bonus').map((role) => ({ targetId: role.roleId, value: role.bonus })),
        set: (_guildId, roleId, bonus) => setBonusRole(giveawayId, roleId, bonus),
        // Everyone in a running giveaway gets their entries worked out again. In the background, as it can take a while
        onSaved: (guild) => {
          void getGiveaway(guild.id, giveawayId)
            .then((giveaway) => (giveaway?.status === 'active' ? refreshAllEntries(guild, giveaway) : undefined))
            .catch((error: unknown) => logger.error(error, `Failed to update the entries of giveaway ${giveawayId}`));
        },
      },
      {
        type: 'text',
        key: 'claim',
        category: 'winners',
        maxLength: 50,
        label: (t) => t('giveaway.settings.claim.label'),
        description: (t) => t('giveaway.settings.claim.description'),
        placeholder: (t) => t('giveaway.settings.durationPlaceholder'),
        get: (giveaway) => (giveaway.claimMinutes ? minutesText(giveaway.claimMinutes) : null),
        formatValue: (value, t) => formatMinutes(parseMinutes(value, 0, Infinity) ?? 0, t),
        validate: (text, t) =>
          parseMinutes(text, MIN_CLAIM_MINUTES, MAX_CLAIM_MINUTES) === null
            ? t('giveaway.settings.claim.invalid', { max: formatMinutes(MAX_CLAIM_MINUTES, t) })
            : null,
        set: (_guildId, text) => updateGiveaway(giveawayId, { claimMinutes: text ? parseMinutes(text, MIN_CLAIM_MINUTES, MAX_CLAIM_MINUTES) : null }),
      },
      {
        type: 'role',
        key: 'winnerRole',
        category: 'winners',
        assignable: true,
        label: (t) => t('giveaway.settings.winnerRole.label'),
        description: (t) => t('giveaway.settings.winnerRole.description'),
        get: (giveaway) => giveaway.winnerRoleId,
        set: (_guildId, winnerRoleId) => updateGiveaway(giveawayId, { winnerRoleId }),
      },
      {
        type: 'boolean',
        key: 'dm',
        category: 'winners',
        defaultValue: true,
        label: (t) => t('giveaway.settings.dm.label'),
        description: (t) => t('giveaway.settings.dm.description'),
        get: (giveaway) => giveaway.dmWinners,
        set: (_guildId, dmWinners) => updateGiveaway(giveawayId, { dmWinners }),
      },
    ],
  });

  return {
    ...panel,
    // A preview of the post under the settings, so it's clear what starting it posts
    async render(context, t, page) {
      const payload = await panel.render(context, t, page);
      const guild = context.guild;
      const giveaway = guild ? await getGiveaway(guild.id, giveawayId) : null;
      if (!guild || giveaway?.status !== 'draft') return payload;
      const post = buildGiveawayPost(
        giveaway,
        rulesOf(giveaway, (roleId) => guild.roles.cache.has(roleId)),
        { participants: 0, winnerIds: [] },
        t,
      );
      return {
        ...payload,
        components: [
          ...(payload.components ?? []),
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
          new TextDisplayBuilder().setContent(t('giveaway.draft.preview')),
          ...(post.components ?? []),
        ],
        // The preview mentions the host and roles, which mustn't ping anyone
        allowedMentions: { parse: [] },
      };
    },
  };
}
