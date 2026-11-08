import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import { Button } from 'classes/base/button';

import { enterGiveaway, getEntry, getGiveaway } from 'database/giveaways';

import { buttonIcon } from 'utility/emojis';
import { describeProblems, isRunning, participantOf } from 'utility/giveaways/entry';
import { GIVEAWAY_CUSTOM_ID } from 'utility/giveaways/post';
import { bonusRolesOf, checkRules, countEntries, rulesOf } from 'utility/giveaways/rules';
import { getTranslate, type Translate } from 'utility/i18next';
import { createResponse, type ResponsePayload } from 'utility/response';

/** That someone is in, with their entries, and a button to leave again. */
function inResponse(giveawayId: string, entries: number, key: 'giveaway.join.entered' | 'giveaway.join.already', t: Translate): ResponsePayload {
  const response = createResponse(t(key, { count: entries }), 'success');
  return {
    ...response,
    components: [
      ...(response.components ?? []),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${GIVEAWAY_CUSTOM_ID.leave}${giveawayId}`)
          .setLabel(t('giveaway.join.leave'))
          .setEmoji(buttonIcon('user-minus'))
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

/**
 * The Join button on a giveaway's post. Checks the rules and enters whoever pressed it, or tells them which rules they don't meet.
 * Answered privately, as only they need to know.
 */
export default new Button({
  customId: GIVEAWAY_CUSTOM_ID.join,
  includesCustomId: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    // Answered before anything is looked up, which can take a moment
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    // Role mentions in the answers mustn't ping anyone
    const reply = (payload: ResponsePayload) => interaction.editReply({ ...payload, allowedMentions: { parse: [] } });

    const giveaway = await getGiveaway(interaction.guildId, interaction.customId.slice(GIVEAWAY_CUSTOM_ID.join.length));
    if (!giveaway) return reply(createResponse(t('giveaway.join.gone'), 'error'));
    if (!isRunning(giveaway) || !giveaway.endsAt) return reply(createResponse(t('giveaway.join.ended'), 'error'));

    const entry = await getEntry(giveaway.id, interaction.user.id);
    if (entry) return reply(inResponse(giveaway.id, entry.entries, 'giveaway.join.already', t));

    const rules = rulesOf(giveaway, (roleId) => interaction.guild.roles.cache.has(roleId));
    const participant = await participantOf(interaction.member, !!rules.minLevel);
    const problems = checkRules(rules, participant, new Date());
    if (problems.length > 0) {
      const lines = describeProblems(problems, giveaway, giveaway.endsAt, t).map((line) => `- ${line}`);
      return reply(createResponse([t('giveaway.join.cantEnter'), ...lines].join('\n'), 'error'));
    }

    const entries = countEntries(participant.roleIds, bonusRolesOf(giveaway));
    // A double click enters them once, and the second says they're in already
    const added = await enterGiveaway(giveaway.id, interaction.user.id, entries);
    return reply(inResponse(giveaway.id, entries, added ? 'giveaway.join.entered' : 'giveaway.join.already', t));
  },
});
