import type { ExtendedClient } from 'classes/base/client';

import { loadComponents } from 'loading/components';

export const loadButtons = (client: ExtendedClient) => loadComponents('src/handlers/buttons', client.buttons, 'system.button.invalid');
