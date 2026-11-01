import { beforeAll, describe, expect, test } from 'bun:test';
import { ChannelType, Collection, ComponentType, SelectMenuDefaultValueType, type APIContainerComponent, type Guild } from 'discord.js';

import { initI18Next } from 'utility/i18next';
import { createSettingsPanel, parseSettingsCustomId } from 'utility/settings';

// The panel renders labels like On and Off through i18next
beforeAll(() => initI18Next());

interface Config {
  enabled: boolean;
  mode: string;
  channelId: string | null;
  roleId: string | null;
}

/** A panel over an in-memory configuration, with every setting type. */
function createTestPanel(initial: Config | null) {
  let config = initial;
  const set = (patch: Partial<Config>) => {
    config = { ...config!, ...patch };
    return Promise.resolve();
  };

  const panel = createSettingsPanel<Config>({
    id: 'test',
    title: () => 'Test settings',
    permissions: ['ManageGuild'],
    load: () => Promise.resolve(config),
    notConfigured: () => 'Not set up',
    settings: [
      {
        type: 'boolean',
        key: 'enabled',
        defaultValue: false,
        label: () => 'Enabled',
        description: () => 'On or off',
        get: (c) => c.enabled,
        set: (_, enabled) => set({ enabled }),
      },
      {
        type: 'choice',
        key: 'mode',
        options: [
          { value: 'image', label: () => 'Image' },
          { value: 'text', label: () => 'Text' },
        ],
        label: () => 'Mode',
        description: () => 'How it looks',
        get: (c) => c.mode,
        set: (_, mode) => set({ mode }),
      },
      {
        type: 'channel',
        key: 'channel',
        channelTypes: [ChannelType.GuildText],
        required: true,
        label: () => 'Channel',
        description: () => 'Where',
        get: (c) => c.channelId,
        set: (_, channelId) => set({ channelId }),
      },
      { type: 'role', key: 'role', label: () => 'Role', description: () => 'Who', get: (c) => c.roleId, set: (_, roleId) => set({ roleId }) },
    ],
  });

  return { panel, getConfig: () => config };
}

/** Just enough of a guild for the panel to check which channels and roles exist. */
const fakeGuild = ({ channelIds = [] as string[], roleIds = [] as string[] } = {}) =>
  ({
    id: 'guild',
    channels: { cache: new Collection(channelIds.map((id) => [id, {}])) },
    roles: { cache: new Collection(roleIds.map((id) => [id, {}])) },
  }) as unknown as Guild;

/** Render to JSON, which is where discord.js validates the components. */
async function renderJson(panel: ReturnType<typeof createTestPanel>['panel'], guild = fakeGuild()) {
  const payload = await panel.render(guild);
  return (payload.components ?? []).map((component) => ('toJSON' in component ? component.toJSON() : component)) as APIContainerComponent[];
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
  test('renders valid components for every setting type', async () => {
    const { panel } = createTestPanel({ enabled: true, mode: 'image', channelId: '123', roleId: null });
    const [container] = await renderJson(panel);

    expect(container?.type).toBe(ComponentType.Container);
    const types = container!.components.map((component) => component.type);
    expect(types.filter((type) => type === ComponentType.Section)).toHaveLength(2);
    expect(types.filter((type) => type === ComponentType.ActionRow)).toHaveLength(2);
  });

  test('preselects saved channels and roles that still exist', async () => {
    const { panel } = createTestPanel({ enabled: true, mode: 'image', channelId: '123', roleId: '456' });
    const [container] = await renderJson(panel, fakeGuild({ channelIds: ['123'], roleIds: ['456'] }));

    expect(defaultValuesOf(container!, 'settings:test:channel')).toEqual([{ id: '123', type: SelectMenuDefaultValueType.Channel }]);
    expect(defaultValuesOf(container!, 'settings:test:role')).toEqual([{ id: '456', type: SelectMenuDefaultValueType.Role }]);
    expect(JSON.stringify(container)).not.toContain('⚠️');
  });

  test('does not preselect deleted channels and roles, and warns about them instead', async () => {
    const { panel } = createTestPanel({ enabled: true, mode: 'image', channelId: '123', roleId: '456' });
    const [container] = await renderJson(panel, fakeGuild());

    expect(defaultValuesOf(container!, 'settings:test:channel')).toEqual([]);
    expect(defaultValuesOf(container!, 'settings:test:role')).toEqual([]);
    const text = JSON.stringify(container);
    expect(text).toContain('The saved channel no longer exists');
    expect(text).toContain('The saved role no longer exists');
  });

  test('shows a message instead when the feature is not set up', async () => {
    const { panel } = createTestPanel(null);
    const [container] = await renderJson(panel);

    expect(JSON.stringify(container)).toContain('Not set up');
  });

  test('pressing toggles booleans and cycles choices', async () => {
    const { panel, getConfig } = createTestPanel({ enabled: false, mode: 'image', channelId: '123', roleId: null });

    await panel.press('guild', 'enabled');
    expect(getConfig()?.enabled).toBe(true);
    await panel.press('guild', 'enabled');
    expect(getConfig()?.enabled).toBe(false);

    await panel.press('guild', 'mode');
    expect(getConfig()?.mode).toBe('text');
    await panel.press('guild', 'mode');
    expect(getConfig()?.mode).toBe('image');
  });

  test('selecting sets channels and roles, and only optional ones can be cleared', async () => {
    const { panel, getConfig } = createTestPanel({ enabled: false, mode: 'image', channelId: '123', roleId: '456' });

    await panel.select('guild', 'channel', ['789']);
    expect(getConfig()?.channelId).toBe('789');
    await panel.select('guild', 'channel', []);
    expect(getConfig()?.channelId).toBe('789');

    await panel.select('guild', 'role', []);
    expect(getConfig()?.roleId).toBeNull();
  });

  test('custom IDs round trip', () => {
    expect(parseSettingsCustomId('settings:counting:allowMath')).toEqual({ panelId: 'counting', key: 'allowMath' });
    expect(parseSettingsCustomId('lb_next')).toBeNull();
    expect(parseSettingsCustomId('settings:counting')).toBeNull();
  });
});
