import {
  ActionRowBuilder,
  type ButtonBuilder,
  type ButtonInteraction,
  type ContainerBuilder,
  MessageFlags,
  type StringSelectMenuInteraction,
} from 'discord.js';

import { getTranslate, resolveLanguage, type Translate } from 'utility/i18next';
import { answerPokeApiError } from 'utility/pokedex/api';
import { buildWhereToFind } from 'utility/pokedex/encounters';
import { buildPokedexEntry } from 'utility/pokedex/entry';
import { buildLearnset } from 'utility/pokedex/learnset';
import { buildMatchupsPage } from 'utility/pokedex/matchups';
import { buildAbility } from 'utility/pokedex/lookups/ability';
import { buildBerry } from 'utility/pokedex/lookups/berry';
import { buildItem } from 'utility/pokedex/lookups/item';
import { buildLocation } from 'utility/pokedex/lookups/location';
import { buildMove } from 'utility/pokedex/lookups/move';
import { buildNature, buildNatureList } from 'utility/pokedex/lookups/nature';
import { findBySlug, loadPokedexData, matchName, nameOf } from 'utility/pokedex/names';
import { backButton, type DexPage, type PageContext, pokemonPage, pokemonView } from 'utility/pokedex/pages';
import { moveTrail, type PageMove, setTrail, trailOf } from 'utility/pokedex/pageTrail';
import { prefersTextView, rememberTextView } from 'utility/pokedex/viewPreference';
import { buildTeam } from 'utility/pokedex/team';
import { buildTypeChart, buildTypePage } from 'utility/pokedex/typeChart';
import { type ResponsePayload, sendError, sendResponse } from 'utility/response';

/** A page's name, like a Pokémon's or a move's, for the Back button to it. */
export function pageName(page: DexPage, language: string, t: Translate): string {
  const pokemon = () => {
    const match = findBySlug(page.slug);
    return match ? matchName(match, language) : page.slug;
  };
  switch (page.kind) {
    case 'pokemon':
      return pokemon();
    case 'move':
      return nameOf('moves', page.slug, language);
    case 'item':
      return nameOf('items', page.slug, language);
    case 'berry':
      return nameOf('items', page.slug, language);
    case 'ability':
      return nameOf('abilities', page.slug, language);
    case 'nature':
      return nameOf('natures', page.slug, language);
    case 'natures':
      return t('pages.allNatures');
    case 'location':
      return nameOf('locations', page.slug, language);
    case 'where':
      return t('pages.where', { name: pokemon() });
    case 'learnset':
      return t('pages.learnset', { name: pokemon() });
    case 'matchups':
      return t('pages.matchups', { name: pokemon() });
    case 'type':
      return nameOf('types', page.slug, language);
    case 'types':
      return t('types.chart.button');
    case 'team':
      return t('pages.team');
  }
}

/**
 * A page of the Pokédex, with a button back to the one it was opened from.
 * @throws {PokeApiError} When PokéAPI can't be reached.
 * @returns The page, or null when PokéAPI doesn't know what it's about.
 */
export async function renderPage(context: PageContext, language: string, t: Translate): Promise<ResponsePayload | null> {
  const { page, back } = context;
  let answer: ResponsePayload | null;
  switch (page.kind) {
    case 'pokemon': {
      const match = findBySlug(page.slug);
      answer = match ? await buildPokedexEntry(match, pokemonView(page), language, t) : null;
      break;
    }
    case 'move':
      answer = await buildMove(page.slug, language, t, context);
      break;
    case 'item':
      answer = await buildItem(page.slug, language, t, context);
      break;
    case 'berry':
      answer = await buildBerry(page.slug, language, t, context);
      break;
    case 'ability':
      answer = await buildAbility(page.slug, language, t, context);
      break;
    case 'nature':
      answer = await buildNature(page.slug, language, t, context);
      break;
    case 'natures':
      answer = await buildNatureList(language, t, context);
      break;
    case 'location':
      answer = await buildLocation(page.slug, language, t, context);
      break;
    case 'where':
      answer = await buildWhereToFind(page.slug, language, t, context);
      break;
    case 'learnset':
      answer = await buildLearnset(page.slug, language, t, context);
      break;
    case 'matchups':
      answer = await buildMatchupsPage(page.slug, language, t, context);
      break;
    case 'type':
      answer = await buildTypePage(page.slug, language, t, context);
      break;
    case 'types':
      answer = await buildTypeChart(language, t, context);
      break;
    case 'team':
      answer = await buildTeam(page.slug, language, t, context);
      break;
  }
  if (!answer) return null;
  if (back) {
    // At the bottom of the page's container, below everything else on it
    const container = answer.components?.[0] as ContainerBuilder | undefined;
    container?.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(back, pageName(back, language, t), t)));
  }
  return answer;
}

/**
 * A page shown how someone last looked at entries, for a Pokémon that's opened without saying, like from a link, and the chart of
 * all types. Remembers it for those that say, like Back to an entry that was text.
 */
export function withPreferredView(context: PageContext, userId: string): PageContext {
  const { page } = context;
  if (page.kind === 'types') {
    if (page.slug !== 'image' && page.slug !== 'text') return { ...context, page: { ...page, slug: prefersTextView(userId) ? 'text' : 'image' } };
    rememberTextView(userId, page.slug === 'text');
    return context;
  }
  // The matchups like the entry, which says `t` or `i`
  if (page.kind === 'matchups') {
    if (page.game !== 't' && page.game !== 'i') return { ...context, page: { ...page, game: prefersTextView(userId) ? 't' : 'i' } };
    rememberTextView(userId, page.game === 't');
    return context;
  }
  if (page.kind !== 'pokemon') return context;
  if (page.game) {
    rememberTextView(userId, pokemonView(page).text);
    return context;
  }
  return { ...context, page: pokemonPage(page.slug, { shiny: false, text: prefersTextView(userId) }) };
}

/**
 * Open a page from a button or select on another. Whoever the message is for goes there on the message itself, anyone else gets the
 * page as an answer only they see, so the message stays as it is for everyone. Either keeps the pages it went through, for Back.
 * @param move How it's opened: on from the page shown, which is `context.back`, back to the one before, or the same page another way.
 */
export async function openPage(interaction: ButtonInteraction | StringSelectMenuInteraction, context: PageContext, move: PageMove): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const { message } = interaction;
  const owner = message.interactionMetadata?.user.id;
  const own = message.flags.has(MessageFlags.Ephemeral) || !owner || owner === interaction.user.id;

  if (own) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  try {
    await loadPokedexData();
    // An answer only they see goes on from the message it was opened on, so it can go back as far
    const { trail, back } = moveTrail(trailOf(message.id), move, context.back);
    const answer = await renderPage(withPreferredView({ page: context.page, back }, interaction.user.id), resolveLanguage(interaction.locale), t);
    if (!answer) return sendError(interaction, t('system.outdated'));
    if (own) {
      setTrail(message.id, trail);
      // The pictures of the page before, like the Pokédex card, are replaced by this one's, or none
      return interaction.editReply({ ...answer, files: answer.files ?? [], attachments: [] });
    }
    const reply = await sendResponse(interaction, answer);
    setTrail((await interaction.fetchReply()).id, trail);
    return reply;
  } catch (error) {
    return answerPokeApiError(interaction, error, t);
  }
}
