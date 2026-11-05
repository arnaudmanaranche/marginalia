// The hosted studio's login settings, read from the environment. Pure: `env` is passed in.
// Login is on when GITLAB_OAUTH_CLIENT_ID is set; then the rest must be set too, or the studio
// refuses to start rather than run half protected.
export interface AuthConfig { baseUrl: string; clientId: string; clientSecret: string; publicUrl: string; sessionSecret: string; redirectUri: string; secureCookie: boolean }

export function readAuthConfig(env: Record<string, string | undefined>, gitlabBaseUrl: string): { ok: true; config: AuthConfig | null } | { ok: false; error: string } {
  if (!env.GITLAB_OAUTH_CLIENT_ID) return { ok: true, config: null };
  const missing = ['GITLAB_OAUTH_CLIENT_SECRET', 'STUDIO_PUBLIC_URL', 'SESSION_SECRET'].filter((k) => !env[k]);
  if (missing.length) return { ok: false, error: `GITLAB_OAUTH_CLIENT_ID is set, so ${missing.join(', ')} must be too.` };
  if ((env.SESSION_SECRET as string).length < 32) return { ok: false, error: 'SESSION_SECRET must be at least 32 characters (try `openssl rand -hex 32`).' };
  const publicUrl = (env.STUDIO_PUBLIC_URL as string).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(publicUrl)) return { ok: false, error: 'STUDIO_PUBLIC_URL must start with https:// (http:// only for local tests).' };
  return { ok: true, config: {
    baseUrl: gitlabBaseUrl, clientId: env.GITLAB_OAUTH_CLIENT_ID, clientSecret: env.GITLAB_OAUTH_CLIENT_SECRET as string,
    publicUrl, sessionSecret: env.SESSION_SECRET as string, redirectUri: `${publicUrl}/auth/callback`, secureCookie: publicUrl.startsWith('https://'),
  } };
}
