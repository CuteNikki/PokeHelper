import { beforeAll, describe, expect, test } from 'bun:test';

import { CASE_TYPES } from 'database/moderation';

import { getTranslate, initI18Next } from 'utility/i18next';
import { buildActionModal, parsePanelId } from 'utility/moderation/panel';

const userId = '123456789012345678';

beforeAll(() => initI18Next());

describe('moderation panel', () => {
  test('its buttons and popups carry what to do and to whom', () => {
    expect(parsePanelId(`modpanel:timeout:${userId}`)).toEqual({ action: 'timeout', userId });
    expect(parsePanelId(`modpanel:cases:${userId}`)).toEqual({ action: 'cases', userId });
    expect(parsePanelId(`modpanel:explode:${userId}`)).toBeNull();
    expect(parsePanelId('modpanel:warn:someone')).toBeNull();
  });

  test.each(['en', 'de'])('every popup is one Discord takes, in %s', (locale) => {
    const t = getTranslate(locale);
    for (const type of CASE_TYPES) {
      const modal = buildActionModal(type, userId, 'a'.repeat(32), t).toJSON();
      expect(modal.title.length).toBeLessThanOrEqual(45);
      expect(modal.components.length).toBeLessThanOrEqual(5);
    }
  });

  test('only a timeout needs a duration, only a warning a reason, and an unban has no DM', () => {
    const t = getTranslate('en');
    const ids = (type: (typeof CASE_TYPES)[number]) =>
      buildActionModal(type, userId, 'someone', t)
        .toJSON()
        .components.map((label) =>
          'component' in label ? `${label.component.custom_id}${'required' in label.component && label.component.required ? '!' : ''}` : '',
        );
    expect(ids('warn')).toEqual(['reason!', 'dm']);
    expect(ids('timeout')).toEqual(['duration!', 'reason', 'dm']);
    expect(ids('ban')).toEqual(['reason', 'duration', 'delete', 'dm']);
    expect(ids('unban')).toEqual(['reason']);
  });
});
