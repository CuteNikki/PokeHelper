import { beforeAll, describe, expect, test } from 'bun:test';

import { getTranslate, initI18Next } from 'utility/i18next';
import { copyIdsButton, parseCopyIds } from 'utility/logs/copyIds';

beforeAll(() => initI18Next());

const ids = (button: ReturnType<typeof copyIdsButton>) => parseCopyIds((button?.toJSON() as { custom_id: string }).custom_id);

describe('copyIdsButton', () => {
  test('keeps who it is about, who did it and the roles, in that order', () => {
    const button = copyIdsButton({ role: ['111111111111111111', '222222222222222222'], user: '333333333333333333', by: '444444444444444444' }, getTranslate('en'));
    expect(ids(button)).toEqual([
      ['user', '333333333333333333'],
      ['by', '444444444444444444'],
      ['role', '111111111111111111'],
      ['role', '222222222222222222'],
    ]);
  });

  test('leaves out what no longer fits a custom ID, keeping the first ones', () => {
    const roles = ['1', '2', '3', '4', '5'].map((digit) => digit.repeat(19));
    const kept = ids(copyIdsButton({ user: '9'.repeat(19), role: roles }, getTranslate('en')));
    expect(kept[0]).toEqual(['user', '9'.repeat(19)]);
    expect(kept.length).toBeLessThan(6);
    expect(kept.length).toBeGreaterThan(2);
  });

  test('has no button without IDs', () => {
    expect(copyIdsButton({}, getTranslate('en'))).toBeNull();
  });
});
