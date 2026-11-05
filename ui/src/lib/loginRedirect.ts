// In a hosted studio the API answers 401 with `{ error, login }` when there is no session (or it
// ended). Any request doing so sends the whole page to the login, whichever call it was.
// Locally the API never answers 401 and this never fires.
export function installLoginRedirect(win: Pick<Window, 'fetch' | 'location'> = window) {
  const original = win.fetch.bind(win);
  win.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args);
    if (res.status === 401) {
      const login = (await res.clone().json().catch(() => null))?.login;
      if (typeof login === 'string' && login.startsWith('/')) win.location.assign(login);
    }
    return res;
  };
}
