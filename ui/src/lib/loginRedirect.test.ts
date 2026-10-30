import { describe, expect, it, vi } from 'vitest';
import { installLoginRedirect } from './loginRedirect';

const withResponse = (res: Response) => {
  const win = { fetch: vi.fn(async (_url: string) => res), location: { assign: vi.fn() } };
  installLoginRedirect(win as unknown as Window);
  return win;
};

describe('installLoginRedirect', () => {
  it('sends the page to the login when the API says login is required', async () => {
    const win = withResponse(new Response(JSON.stringify({ error: 'login required', login: '/auth/login' }), { status: 401 }));
    await win.fetch('/api/reviews');
    expect(win.location.assign).toHaveBeenCalledWith('/auth/login');
  });

  it('leaves other answers alone, a 401 that names no login included', async () => {
    const ok = withResponse(new Response('{}', { status: 200 }));
    await ok.fetch('/api/reviews');
    const other = withResponse(new Response(JSON.stringify({ error: 'nope' }), { status: 401 }));
    await other.fetch('/x');
    const external = withResponse(new Response(JSON.stringify({ login: 'https://evil.example' }), { status: 401 }));
    await external.fetch('/x');
    expect(ok.location.assign).not.toHaveBeenCalled();
    expect(other.location.assign).not.toHaveBeenCalled();
    expect(external.location.assign).not.toHaveBeenCalled();
  });
});
