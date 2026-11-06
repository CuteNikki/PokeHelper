import { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { DiscordLimits } from 'utility/discordLimits';

/** A popup asking for one text, like a page to go to or a Pokémon to look up. */
export function buildTextModal(options: {
  customId: string;
  title: string;
  label: string;
  /** The custom ID of the field, to read what was typed. */
  inputId: string;
  maxLength: number;
  minLength?: number;
  placeholder?: string;
  value?: string;
  /** Whether it can be sent empty, like to clear a setting. */
  optional?: boolean;
  /** A field of several lines, for longer texts. */
  paragraph?: boolean;
}): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(options.inputId)
    .setStyle(options.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(options.maxLength)
    .setRequired(!options.optional);
  if (options.minLength !== undefined) input.setMinLength(options.minLength);
  if (options.placeholder) input.setPlaceholder(options.placeholder);
  if (options.value) input.setValue(options.value);

  return new ModalBuilder()
    .setCustomId(options.customId)
    .setTitle(options.title.slice(0, DiscordLimits.modalTitleLength))
    .addLabelComponents(new LabelBuilder().setLabel(options.label.slice(0, DiscordLimits.modalLabelLength)).setTextInputComponent(input));
}
