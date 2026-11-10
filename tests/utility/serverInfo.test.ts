import { describe, expect, test } from 'bun:test';

import { parseServerInfoId } from 'utility/serverInfo';

describe('server info custom IDs', () => {
  test('carry the view and page', () => {
    expect(parseServerInfoId('serverinfo:overview:0')).toEqual({ view: 'overview', page: 0, goto: false });
    expect(parseServerInfoId('serverinfo:roles:3')).toEqual({ view: 'roles', page: 3, goto: false });
    expect(parseServerInfoId('serverinfo:emojis:0:last')).toEqual({ view: 'emojis', page: 0, goto: false });
    expect(parseServerInfoId('serverinfo:emojis:2:goto')).toEqual({ view: 'emojis', page: 2, goto: true });
  });

  test("aren't anything else", () => {
    expect(parseServerInfoId('serverinfo:stickers:0')).toBeNull();
    expect(parseServerInfoId('serverinfo:roles:x')).toBeNull();
    expect(parseServerInfoId('serverinfo:roles:0:sideways')).toBeNull();
    expect(parseServerInfoId('serverinfo:roles:0:goto:extra')).toBeNull();
  });
});
