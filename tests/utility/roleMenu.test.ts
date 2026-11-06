import { beforeAll, describe, expect, test } from 'bun:test';
import { ComponentType, type APIButtonComponentWithCustomId, type APIContainerComponent } from 'discord.js';

import type { RoleMenu } from 'database/roleMenu';

import { getTranslate, initI18Next } from 'utility/i18next';
import { parseEmoji } from 'utility/emoji';
import { buildRoleMenuMessage, ROLE_BUTTON_PREFIX } from 'utility/roleMenu';

beforeAll(() => initI18Next());

describe('parseEmoji', () => {
  const emojis = [
    { id: '111111111111111111', name: 'valor', animated: false },
    { id: '222222222222222222', name: 'Mystic', animated: true },
  ];

  test('takes normal emoji as they are, also with skin tones, joined emoji, flags and keycaps', () => {
    for (const emoji of ['🔴', '❤️', '👍🏽', '👩‍🚀', '🏳️‍🌈', '🇩🇪', '1️⃣']) expect(parseEmoji(emoji, emojis)).toBe(emoji);
  });

  test("finds the server's emoji by name, with or without colons, and ignores the case if needed", () => {
    expect(parseEmoji(':valor:', emojis)).toBe('<:valor:111111111111111111>');
    expect(parseEmoji('valor', emojis)).toBe('<:valor:111111111111111111>');
    expect(parseEmoji(':mystic:', emojis)).toBe('<a:Mystic:222222222222222222>');
  });

  test("takes the server's emoji typed in full, but not ones of other servers", () => {
    expect(parseEmoji('<:valor:111111111111111111>', emojis)).toBe('<:valor:111111111111111111>');
    expect(parseEmoji('<:other:333333333333333333>', emojis)).toBeNull();
  });

  test('refuses text, several emoji and unknown names', () => {
    for (const input of ['', 'hello', '🔴🔵', ':instinct:', 'a🔴']) expect(parseEmoji(input, emojis)).toBeNull();
  });
});

describe('buildRoleMenuMessage', () => {
  const menu = (changes: Partial<RoleMenu> = {}) =>
    ({
      id: 'menu',
      guildId: 'guild',
      channelId: 'channel',
      messageId: null,
      title: null,
      description: null,
      enabled: true,
      singleChoice: false,
      requiredRoleIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: Array.from({ length: 7 }, (_, i) => ({
        id: String(i),
        menuId: 'menu',
        roleId: `role${i}`,
        emoji: '🔴',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      ...changes,
    }) as RoleMenu;

  const render = (roleMenu: RoleMenu) =>
    (buildRoleMenuMessage(roleMenu, getTranslate('en')).components ?? []).map((component) =>
      'toJSON' in component ? component.toJSON() : component,
    ) as APIContainerComponent[];

  const buttons = (container: APIContainerComponent) =>
    container.components.flatMap((component) => (component.type === ComponentType.ActionRow ? component.components : [])) as APIButtonComponentWithCustomId[];

  test('lists the roles with their emoji, and has a button for each, at most 5 in a row', () => {
    const [container] = render(menu());
    const text = JSON.stringify(container);
    expect(text).toContain('Pick your roles');
    expect(text).toContain('🔴 <@&role0>');
    expect(container!.components.filter((component) => component.type === ComponentType.ActionRow)).toHaveLength(2);
    expect(buttons(container!).map((button) => button.custom_id)).toEqual(Array.from({ length: 7 }, (_, i) => `${ROLE_BUTTON_PREFIX}role${i}`));
  });

  test('uses the custom title and description', () => {
    const text = JSON.stringify(render(menu({ title: 'Teams', description: 'Pick **one**' })));
    expect(text).toContain('### Teams');
    expect(text).toContain('Pick **one**');
    expect(text).not.toContain('Pick your roles');
  });

  test("a menu that's off says so and disables its buttons", () => {
    const [container] = render(menu({ enabled: false }));
    expect(JSON.stringify(container)).toContain('turned off');
    expect(buttons(container!).every((button) => button.disabled)).toBe(true);
  });
});
