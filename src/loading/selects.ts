import type { ExtendedClient } from 'classes/base/client';

import { loadComponents } from 'loading/components';

export const loadSelectMenus = (client: ExtendedClient) => loadComponents('src/handlers/selects', client.selectMenus, 'system.selectMenu.invalid');
