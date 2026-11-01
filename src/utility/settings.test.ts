import { beforeAll, describe, expect, test } from 'bun:test';
import { ChannelType, ComponentType, type APIContainerComponent } from 'discord.js';

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

/** Render to JSON, which is where discord.js validates the components. */
async function renderJson(panel: ReturnType<typeof createTestPanel>['panel']) {
  const payload = await panel.render('guild');
  return (payload.components ?? []).map((component) => ('toJSON' in component ? component.toJSON() : component)) as APIContainerComponent[];
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
