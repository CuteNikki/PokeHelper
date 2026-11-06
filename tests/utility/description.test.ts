import { expect, test } from 'bun:test';

import { MAX_DESCRIPTION_LENGTH, readDescription } from 'utility/description';

test('the description fits what Discord takes', async () => {
  const description = await readDescription();
  expect(description).not.toBe('');
  expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
});
