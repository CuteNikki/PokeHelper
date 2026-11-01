import { describe, expect, test } from 'bun:test';
import { ComponentType, type APIButtonComponentWithCustomId, type APIContainerComponent } from 'discord.js';

import { buildConfirmation, parseConfirmation } from 'utility/confirm';

describe('confirmations', () => {
  test('the buttons carry the action and the answer, which parse back', () => {
    const [container] = (buildConfirmation('leveling-reset', { question: 'Sure?', confirm: 'Yes', cancel: 'No' }).components ?? []).map((component) =>
      'toJSON' in component ? component.toJSON() : component,
    ) as APIContainerComponent[];
    const buttons = container!.components.flatMap((component) =>
      component.type === ComponentType.ActionRow ? component.components : [],
    ) as APIButtonComponentWithCustomId[];

    expect(buttons.map((button) => parseConfirmation(button.custom_id))).toEqual([
      { action: 'leveling-reset', confirmed: true },
      { action: 'leveling-reset', confirmed: false },
    ]);
  });

  test('other custom IDs are not confirmations', () => {
    for (const id of ['settings:counting:_:x:-:-', 'confirm:', 'confirm:reset', 'confirm:reset:maybe', 'rolemenu:confirm-delete:1']) {
      expect(parseConfirmation(id)).toBeNull();
    }
  });
});
