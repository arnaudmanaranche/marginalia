import { describe, expect, it, vi } from 'vitest';
import { meOf, signOut } from './session';

describe('meOf', () => {
  it('reads the signed-in person, naming them by username when GitLab gave no name', () => {
    expect(meOf({ username: 'bob', name: 'Bob', projects: ['a'] })).toEqual({ username: 'bob', name: 'Bob' });
    expect(meOf({ username: 'bob' })).toEqual({ username: 'bob', name: 'bob' });
  });
  it('is nobody in a local studio', () => {
    expect(meOf({})).toBeNull();
    expect(meOf(null)).toBeNull();
    expect(meOf('<html>')).toBeNull();
  });
});

describe('signOut', () => {
  it('ends the session then goes to the login, even when the request fails', async () => {
    const ok = { fetch: vi.fn(async (_url: string, _init: object) => new Response('{}')), location: { assign: vi.fn() } };
    await signOut(ok as unknown as Window);
    expect(ok.fetch).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }));
    expect(ok.location.assign).toHaveBeenCalledWith('/auth/login');
    const down = { fetch: vi.fn(async () => { throw new Error('offline'); }), location: { assign: vi.fn() } };
    await signOut(down as unknown as Window);
    expect(down.location.assign).toHaveBeenCalledWith('/auth/login');
  });
});
