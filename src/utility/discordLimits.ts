/** Limits Discord sets on messages and interactions, which the bot keeps to so they aren't refused. */
export const DiscordLimits = {
  /** Choices an autocomplete can suggest. */
  autocompleteChoices: 25,
  /** Options in a select, and how many can be picked in one. */
  selectOptions: 25,
  /** Characters in the name of a select option or autocomplete choice, and in an option's description. */
  optionLabelLength: 100,
  /** Characters in a button's label. */
  buttonLabelLength: 80,
  /** Characters in the text a select shows before something is picked. */
  selectPlaceholderLength: 150,
  /** Buttons in one row. */
  buttonsPerRow: 5,
  /** Characters in a popup field's label. */
  modalLabelLength: 45,
  /** Characters in a popup's title. */
  modalTitleLength: 45,
  /** Characters in the custom ID of a button, select or popup. */
  customIdLength: 100,
  /** Characters of text in all of a Components V2 message's text displays together. */
  messageTextLength: 4000,
  /** Characters in an image's description, which screen readers read out. */
  mediaDescriptionLength: 1024,
} as const;
