import { beforeAll, describe, expect, test } from 'bun:test';
import { ChannelType, Collection, ComponentType, SelectMenuDefaultValueType, type APIContainerComponent, type Guild } from 'discord.js';

import { initI18Next } from 'utility/i18next';
import { createSettingsPanel, parseSettingsCustomId, type Entry, type SettingsInput, type SettingsModal } from 'utility/settings';

// The panel renders labels like On and Off through i18next
beforeAll(() => initI18Next());

interface Config {
  enabled: boolean;
  mode: string;
  channelId: string | null;
  roleId: string | null;
  ignoredChannels: string[];
  multipliers: Entry[];
  rewards: Entry[];
}

const baseConfig: Config = { enabled: false, mode: 'image', channelId: '123', roleId: null, ignoredChannels: [], multipliers: [], rewards: [] };

/** A panel over an in-memory configuration, with every setting type, split over two categories. */
function createTestPanel(initial: Config | null) {
  let config = initial;
  const patch = (changes: Partial<Config>) => {
    config = { ...config!, ...changes };
    return Promise.resolve();
  };
  const setEntry = (list: 'multipliers' | 'rewards', targetId: string, value: number | null) => {
    const others = config![list].filter((entry) => entry.targetId !== targetId);
    return patch({ [list]: value === null ? others : [...others, { targetId, value }] });
  };
  const parseNumber = (input: string) => (/^\d+(\.\d+)?$/.test(input) ? Number(input) : null);

  const panel = createSettingsPanel<Config>({
    id: 'test',
    title: () => 'Test settings',
    permissions: ['ManageGuild'],
    categories: [
      { id: 'general', label: () => 'General' },
      { id: 'lists', label: () => 'Lists' },
      { id: 'multipliers', label: () => 'Multipliers' },
    ],
    load: () => Promise.resolve(config),
    notConfigured: () => 'Not set up',
    settings: [
      {
        type: 'boolean',
        key: 'enabled',
        category: 'general',
        label: () => 'Enabled',
        description: () => '',
        get: (c) => c.enabled,
        set: (_, enabled) => patch({ enabled }),
      },
      {
        type: 'choice',
        key: 'mode',
        category: 'general',
        options: [
          { value: 'image', label: () => 'Image' },
          { value: 'text', label: () => 'Text' },
        ],
        label: () => 'Mode',
        description: () => '',
        get: (c) => c.mode,
        set: (_, mode) => patch({ mode }),
      },
      {
        type: 'channel',
        key: 'channel',
        category: 'general',
        channelTypes: [ChannelType.GuildText],
        required: true,
        botPermissions: ['ViewChannel', 'SendMessages'],
        label: () => 'Channel',
        description: () => '',
        get: (c) => c.channelId,
        set: (_, channelId) => patch({ channelId }),
      },
      {
        type: 'role',
        key: 'role',
        category: 'general',
        label: () => 'Role',
        description: () => '',
        get: (c) => c.roleId,
        set: (_, roleId) => patch({ roleId }),
      },
      {
        type: 'role',
        key: 'assignableRole',
        category: 'general',
        assignable: true,
        label: () => 'Assignable role',
        description: () => '',
        get: (c) => c.roleId,
        set: (_, roleId) => patch({ roleId }),
      },
      {
        type: 'channels',
        key: 'ignored',
        category: 'lists',
        channelTypes: [ChannelType.GuildText],
        max: 20,
        label: () => 'Ignored',
        description: () => '',
        get: (c) => c.ignoredChannels,
        set: (_, ignoredChannels) => patch({ ignoredChannels }),
      },
      {
        type: 'entries',
        key: 'multipliers',
        category: 'multipliers',
        target: 'role',
        max: 10,
        presets: [1.5, 2, 3],
        defaultValue: 2,
        formatValue: (value) => `${value}x`,
        input: { label: () => 'Multiplier', parse: parseNumber, invalid: () => 'Not a number' },
        label: () => 'Multipliers',
        description: () => '',
        get: (c) => c.multipliers,
        set: (_, targetId, value) => setEntry('multipliers', targetId, value),
      },
      {
        type: 'entries',
        key: 'rewards',
        category: 'lists',
        target: 'role',
        assignable: true,
        max: 20,
        formatValue: (value) => `Level ${value}`,
        input: { label: () => 'Level', parse: parseNumber, invalid: () => 'Not a level' },
        label: () => 'Rewards',
        description: () => '',
        get: (c) => c.rewards,
        set: (_, targetId, value) => setEntry('rewards', targetId, value),
      },
    ],
  });

  return { panel, getConfig: () => config! };
}

/**
 * Just enough of a guild for the panel to check which channels and roles exist, which permissions the bot has,
 * and which roles it can give. The bot's highest role is at position 10, and roles are at position 1 unless they're `highRoles`.
 */
const fakeGuild = ({ channelIds = [] as string[], roleIds = [] as string[], botMissing = [] as string[], highRoles = [] as string[] } = {}) => {
  const has = (permission: string) => !botMissing.includes(permission);
  return {
    id: 'guild',
    members: { me: { permissions: { has }, roles: { highest: { position: 10 } } } },
    channels: {
      cache: new Collection(channelIds.map((id) => [id, { name: `channel-${id}`, permissionsFor: () => ({ has }) }])),
    },
    roles: {
      cache: new Collection(roleIds.map((id) => [id, { id, name: `role-${id}`, managed: false, position: highRoles.includes(id) ? 20 : 1 }])),
    },
  } as unknown as Guild;
};

/** Render to JSON, which is where discord.js validates the components. */
async function renderJson(panel: ReturnType<typeof createTestPanel>['panel'], page?: string, guild = fakeGuild()) {
  const payload = await panel.render(guild, page);
  return (payload.components ?? []).map((component) => ('toJSON' in component ? component.toJSON() : component)) as APIContainerComponent[];
}

/** Use a component of the panel and save the change, like the settings handler does when it's clicked or selected. */
async function use(panel: ReturnType<typeof createTestPanel>['panel'], customId: string, input: SettingsInput = { type: 'button' }, guild = fakeGuild()) {
  const result = await panel.handle(guild, parseSettingsCustomId(customId)!, input);
  await result.save?.();
  return result;
}

/** Submit a popup, saving the value if it's valid. Returns the error, or null when it was saved. */
async function submit(modal: SettingsModal, input: string) {
  const result = modal.submit(input);
  if ('error' in result) return result.error;
  await result.save();
  return null;
}

/** Count every component, nested ones included, as Discord allows at most 40 per message. */
function countComponents(component: unknown): number {
  if (!component || typeof component !== 'object') return 0;
  const { components, accessory } = component as { components?: unknown[]; accessory?: unknown };
  return 1 + (components ?? []).reduce<number>((sum, child) => sum + countComponents(child), 0) + countComponents(accessory);
}

/** The default values of the select with the given custom ID. */
function defaultValuesOf(container: APIContainerComponent, id: string) {
  for (const component of container.components) {
    if (component.type !== ComponentType.ActionRow) continue;
    const select = component.components.find((child) => 'custom_id' in child && child.custom_id === id);
    if (select && 'default_values' in select) return select.default_values ?? [];
  }
  return [];
}

describe('settings panel', () => {
  test('renders valid components on every page', async () => {
    const { panel } = createTestPanel({
      ...baseConfig,
      ignoredChannels: ['1'],
      multipliers: [{ targetId: '5', value: 2 }],
      rewards: [{ targetId: '6', value: 10 }],
    });

    const [general] = await renderJson(panel, 'general');
    expect(general!.components.filter((component) => component.type === ComponentType.Section)).toHaveLength(2);

    const [lists] = await renderJson(panel, 'lists');
    expect(JSON.stringify(lists)).toContain('Level 10');
  });

  test('switching categories shows the chosen page, and unknown pages fall back to the first', async () => {
    const { panel } = createTestPanel(baseConfig);

    expect(await use(panel, 'settings:test:general:_page', { type: 'select', values: ['lists'] })).toEqual({ page: 'lists' });
    expect(JSON.stringify(await renderJson(panel, 'nope'))).toContain('settings:test:general:enabled');
  });

  test('a full page stays within the 40 components a message can have', async () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ targetId: String(i), value: 2 }));
    const rewards = Array.from({ length: 20 }, (_, i) => ({ targetId: String(100 + i), value: i }));
    const { panel } = createTestPanel({ ...baseConfig, ignoredChannels: ['1', '2'], multipliers: full, rewards });

    for (const page of ['general', 'lists', 'multipliers']) {
      const components = await renderJson(panel, page);
      expect(components.reduce((sum, component) => sum + countComponents(component), 0)).toBeLessThanOrEqual(40);
    }
  });

  test('preselects saved channels and roles that still exist, and warns about deleted ones', async () => {
    const { panel } = createTestPanel({ ...baseConfig, roleId: '456' });

    const [existing] = await renderJson(panel, 'general', fakeGuild({ channelIds: ['123'], roleIds: ['456'] }));
    expect(defaultValuesOf(existing!, 'settings:test:general:channel:-:-')).toEqual([{ id: '123', type: SelectMenuDefaultValueType.Channel }]);
    expect(defaultValuesOf(existing!, 'settings:test:general:role:-:-')).toEqual([{ id: '456', type: SelectMenuDefaultValueType.Role }]);

    const [deleted] = await renderJson(panel, 'general', fakeGuild());
    expect(defaultValuesOf(deleted!, 'settings:test:general:channel:-:-')).toEqual([]);
    expect(JSON.stringify(deleted)).toContain('The saved channel no longer exists');
  });

  test('shows a message instead when the feature is not set up', async () => {
    const { panel } = createTestPanel(null);
    expect(JSON.stringify(await renderJson(panel))).toContain('Not set up');
  });

  test('buttons toggle booleans and cycle choices', async () => {
    const { panel, getConfig } = createTestPanel(baseConfig);

    await use(panel, 'settings:test:general:enabled:-:0');
    expect(getConfig().enabled).toBe(true);
    await use(panel, 'settings:test:general:mode:-:image');
    expect(getConfig().mode).toBe('text');
  });

  test('selects set channels and roles, and only optional ones can be cleared', async () => {
    const { panel, getConfig } = createTestPanel({ ...baseConfig, roleId: '456' });

    await use(panel, 'settings:test:general:channel', { type: 'select', values: [] });
    expect(getConfig().channelId).toBe('123');
    await use(panel, 'settings:test:general:role', { type: 'select', values: [] });
    expect(getConfig().roleId).toBeNull();
  });

  test('multi selects save every selected channel', async () => {
    const { panel, getConfig } = createTestPanel(baseConfig);

    await use(panel, 'settings:test:lists:ignored', { type: 'select', values: ['1', '2'] });
    expect(getConfig().ignoredChannels).toEqual(['1', '2']);
  });

  describe('entries with presets', () => {
    test('adding starts at the default value, and adding again changes nothing', async () => {
      const { panel, getConfig } = createTestPanel(baseConfig);

      await use(panel, 'settings:test:multipliers:multipliers:add', { type: 'select', values: ['5'] });
      expect(getConfig().multipliers).toEqual([{ targetId: '5', value: 2 }]);
      await use(panel, 'settings:test:multipliers:multipliers:add', { type: 'select', values: ['5'] });
      expect(getConfig().multipliers).toHaveLength(1);
    });

    test('the button cycles the presets, then asks for a custom value', async () => {
      const { panel, getConfig } = createTestPanel({ ...baseConfig, multipliers: [{ targetId: '5', value: 2 }] });

      expect((await use(panel, 'settings:test:multipliers:multipliers:5:2')).modal).toBeUndefined();
      expect(getConfig().multipliers[0]!.value).toBe(3);

      const { modal } = await use(panel, 'settings:test:multipliers:multipliers:5:3');
      expect(modal?.value).toBe('3');
      expect(await submit(modal!, 'abc')).toBe('Not a number');
      expect(await submit(modal!, '1.25')).toBeNull();
      expect(getConfig().multipliers[0]!.value).toBe(1.25);

      // A custom value starts over at the first preset
      await use(panel, 'settings:test:multipliers:multipliers:5:1.25');
      expect(getConfig().multipliers[0]!.value).toBe(1.5);
    });

    test('removing takes the entry out', async () => {
      const { panel, getConfig } = createTestPanel({ ...baseConfig, multipliers: [{ targetId: '5', value: 2 }] });

      await use(panel, 'settings:test:multipliers:multipliers:remove', { type: 'select', values: ['5'] });
      expect(getConfig().multipliers).toEqual([]);
    });

    test('no more can be added once the list is full', async () => {
      const full = Array.from({ length: 10 }, (_, i) => ({ targetId: String(i), value: 2 }));
      const { panel, getConfig } = createTestPanel({ ...baseConfig, multipliers: full });

      await use(panel, 'settings:test:multipliers:multipliers:add', { type: 'select', values: ['99'] });
      expect(getConfig().multipliers).toHaveLength(10);
      expect(JSON.stringify(await renderJson(panel, 'multipliers'))).not.toContain('settings:test:multipliers:multipliers:add');
    });
  });

  describe('entries without presets', () => {
    test('adding asks for the value, and picking an existing entry changes it', async () => {
      const { panel, getConfig } = createTestPanel(baseConfig);

      const { modal } = await use(panel, 'settings:test:lists:rewards:add', { type: 'select', values: ['6'] });
      expect(modal?.value).toBeUndefined();
      await submit(modal!, '10');
      expect(getConfig().rewards).toEqual([{ targetId: '6', value: 10 }]);

      const edit = await use(panel, 'settings:test:lists:rewards:add', { type: 'select', values: ['6'] });
      expect(edit.modal?.value).toBe('10');
      await submit(edit.modal!, '15');
      expect(getConfig().rewards).toEqual([{ targetId: '6', value: 15 }]);
    });
  });

  test('custom IDs round trip', () => {
    expect(parseSettingsCustomId('settings:counting:_:allowMath:-:1')).toEqual({
      panelId: 'counting',
      page: '_',
      key: 'allowMath',
      argument: undefined,
      shown: '1',
    });
    expect(parseSettingsCustomId('settings:leveling:lists:multipliers:123:1.5')).toEqual({
      panelId: 'leveling',
      page: 'lists',
      key: 'multipliers',
      argument: '123',
      shown: '1.5',
    });
    expect(parseSettingsCustomId('lb_next')).toBeNull();
    expect(parseSettingsCustomId('settings:counting:_')).toBeNull();
  });
});

describe('panels left open', () => {
  test('a button that showed an outdated value changes nothing', async () => {
    const { panel, getConfig } = createTestPanel({ ...baseConfig, enabled: true });

    // The panel showed Off, but someone else turned it on since
    const result = await use(panel, 'settings:test:general:enabled:-:0');
    expect(result.outdated).toBe(true);
    expect(getConfig().enabled).toBe(true);
  });

  test('the same goes for choices and entries', async () => {
    const { panel, getConfig } = createTestPanel({ ...baseConfig, mode: 'text', multipliers: [{ targetId: '5', value: 3 }] });

    expect((await use(panel, 'settings:test:general:mode:-:image')).outdated).toBe(true);
    expect(getConfig().mode).toBe('text');
    expect((await use(panel, 'settings:test:multipliers:multipliers:5:2')).outdated).toBe(true);
    expect(getConfig().multipliers[0]!.value).toBe(3);
  });

  test('an entry that was removed meanwhile changes nothing', async () => {
    const { panel } = createTestPanel(baseConfig);
    expect((await use(panel, 'settings:test:multipliers:multipliers:5:2')).outdated).toBe(true);
  });
});

describe('bot permissions in channels', () => {
  test('a channel where the bot is missing permissions is refused and not saved', async () => {
    const { panel, getConfig } = createTestPanel(baseConfig);
    const guild = fakeGuild({ channelIds: ['999'], botMissing: ['SendMessages'] });

    const result = await use(panel, 'settings:test:general:channel:-:-', { type: 'select', values: ['999'] }, guild);
    expect(result.error).toContain('Send Messages');
    expect(getConfig().channelId).toBe('123');
  });

  test('a channel where the bot has the permissions is saved', async () => {
    const { panel, getConfig } = createTestPanel(baseConfig);
    const guild = fakeGuild({ channelIds: ['999'] });

    const result = await use(panel, 'settings:test:general:channel:-:-', { type: 'select', values: ['999'] }, guild);
    expect(result.error).toBeUndefined();
    expect(getConfig().channelId).toBe('999');
  });

  test('a saved channel that lost permissions gets a warning', async () => {
    const { panel } = createTestPanel(baseConfig);
    const [container] = await renderJson(panel, 'general', fakeGuild({ channelIds: ['123'], botMissing: ['ViewChannel'] }));

    expect(JSON.stringify(container)).toContain("I'm missing permissions in this channel: View Channel");
  });
});

describe('roles the bot has to give', () => {
  test('roles the bot cannot give are refused, for role settings and entries', async () => {
    const { panel, getConfig } = createTestPanel(baseConfig);
    const guild = fakeGuild({ roleIds: ['50'], highRoles: ['50'] });

    const role = await use(panel, 'settings:test:general:assignableRole:-:-', { type: 'select', values: ['50'] }, guild);
    expect(role.error).toContain('not below my highest role');
    expect(getConfig().roleId).toBeNull();

    const reward = await use(panel, 'settings:test:lists:rewards:add:-', { type: 'select', values: ['50'] }, guild);
    expect(reward.error).toContain('not below my highest role');
    expect(reward.modal).toBeUndefined();
  });

  test('@everyone and roles without Manage Roles are refused too', async () => {
    const { panel } = createTestPanel(baseConfig);

    const everyone = await use(panel, 'settings:test:general:assignableRole:-:-', { type: 'select', values: ['guild'] }, fakeGuild({ roleIds: ['guild'] }));
    expect(everyone.error).toContain('@everyone');

    const noPermission = await use(
      panel,
      'settings:test:general:assignableRole:-:-',
      { type: 'select', values: ['7'] },
      fakeGuild({ roleIds: ['7'], botMissing: ['ManageRoles'] }),
    );
    expect(noPermission.error).toContain('Manage Roles');
  });

  test('a role the bot can give is saved', async () => {
    const { panel, getConfig } = createTestPanel(baseConfig);
    await use(panel, 'settings:test:general:assignableRole:-:-', { type: 'select', values: ['7'] }, fakeGuild({ roleIds: ['7'] }));
    expect(getConfig().roleId).toBe('7');
  });

  test('a saved role the bot can no longer give gets a warning', async () => {
    const { panel } = createTestPanel({ ...baseConfig, roleId: '50', rewards: [{ targetId: '50', value: 5 }] });

    expect(JSON.stringify(await renderJson(panel, 'general', fakeGuild({ roleIds: ['50'], highRoles: ['50'] })))).toContain("I can't give this role");
    expect(JSON.stringify(await renderJson(panel, 'lists', fakeGuild({ roleIds: ['50'], highRoles: ['50'] })))).toContain('not below my highest role');
  });
});
