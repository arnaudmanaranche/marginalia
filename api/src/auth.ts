import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// The pure half of the studio login (GitLab OAuth, authorization code with PKCE): the values that
// go to GitLab and back, and how a person's token is kept at rest. No config, no I/O.
export const SESSION_COOKIE = 'marginalia_session';
export const LOGIN_COOKIE = 'marginalia_login';
export const SESSION_DAYS = 14;
// GitLab's own token lifetime is shorter (two hours); a token this close to its end is refreshed first.
export const REFRESH_MARGIN_MS = 60_000;

const b64url = (buf: Buffer) => buf.toString('base64url');
export const randomToken = (bytes = 32) => b64url(randomBytes(bytes));

export function pkce() {
  const verifier = randomToken(48);
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

export function authorizeUrl({ baseUrl, clientId, redirectUri, state, challenge }: { baseUrl: string; clientId: string; redirectUri: string; state: string; challenge: string }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state, scope: 'api', code_challenge: challenge, code_challenge_method: 'S256' });
  return `${baseUrl}/oauth/authorize?${q}`;
}

// A token at rest in the database is sealed with a key made from the instance's session secret
// (AES-256-GCM): a copy of the file alone does not give anyone's GitLab token.
const keyOf = (secret: string) => createHash('sha256').update(`marginalia-session:${secret}`).digest();
export function seal(text: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(b64url).join('.');
}
export function unseal(sealed: string, secret: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// The projects a person may use here: the ones where their GitLab access is Developer or above.
export const DEVELOPER = 30;
export const allowedProjects = (levels: Record<string, number>): string[] => Object.entries(levels).filter(([, level]) => level >= DEVELOPER).map(([key]) => key);

// The access level GitLab reports for the signed-in person on a project (`GET /projects/:id`).
export const levelOfProject = (project: any): number => Math.max(project?.permissions?.project_access?.access_level ?? 0, project?.permissions?.group_access?.access_level ?? 0);
