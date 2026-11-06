import { expect, test } from 'bun:test';

import { MAX_DESCRIPTION_LENGTH, readDescription } from 'utility/description';

/** The most characters Discord takes for the summary in the App Directory, which is pasted in the developer portal by hand. */
const MAX_SUMMARY_LENGTH = 200;

test('the description fits what Discord takes', async () => {
  const description = await readDescription();
  expect(description).not.toBe('');
  expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
});

test("the App Directory's summary fits what Discord takes", async () => {
  const summary = (await Bun.file('listing/summary.txt').text()).trim();
  expect(summary).not.toBe('');
  expect(summary.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
});
