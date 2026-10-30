# Host it for a team

The studio behind HTTPS and GitLab login, on a server, for people who do not run anything on their laptop (ADR 0004). The container, the volumes and `claude login` are as in [container.md](container.md); this page is what changes.

## What you get

- Everyone signs in with GitLab. They see the projects the bot watches where they are **Developer or above** in GitLab, and only those: the reviews, the live status and the MR pages are filtered the same way. Below Developer on all of them, the login is refused.
- **Click-to-post is the person's own.** A comment, a reply or a submitted review goes up under the signed-in person's GitLab token (OAuth, scope `api`), not the bot's. The bot account posts only to answer a mention.
- Settings of the bot (poll interval, ...) are not editable from the studio: the operator sets them.
- Mentions work by polling, or by the webhook below.

## Set it up

1. **A GitLab application** (Admin area, or the group's *Applications*): redirect URI `https://<domain>/auth/callback`, scope `api`, *Confidential* on. Note the application ID and secret.
2. **The bot account**: a GitLab user that is a Developer on each watched project (it reads, clones and answers mentions). Its personal access token (`api`) is `GITLAB_TOKEN`, as in V1; `GITLAB_USERNAME` is its username, which is what people mention.
3. **`.env`** next to `compose.yaml`:

   ```
   MARGINALIA_DOMAIN=marginalia.example.com
   GITLAB_OAUTH_CLIENT_ID=...
   GITLAB_OAUTH_CLIENT_SECRET=...
   SESSION_SECRET=<openssl rand -hex 32>
   WEBHOOK_SECRET=<openssl rand -hex 32>     # optional, turns on the webhook
   ```

4. **Start**: `docker compose -f compose.yaml -f compose.hosted.yaml up -d`. Caddy gets the certificate; DNS for the domain must point at the server and ports 80 and 443 must be open.
5. **Webhook (optional)**: in each watched project, *Settings > Webhooks*: URL `https://<domain>/webhooks/gitlab`, secret token = `WEBHOOK_SECRET`, trigger *Comments* only. Without it, polling answers mentions at the next poll.

The studio refuses to start if `GITLAB_OAUTH_CLIENT_ID` is set and the secret, `STUDIO_PUBLIC_URL` or a `SESSION_SECRET` of at least 32 characters is missing: it never runs half protected.

## Good to know

- Sessions last 14 days and live in the SQLite database; the GitLab tokens in them are sealed with `SESSION_SECRET` (AES-256-GCM), so a copy of the file alone gives nobody's token. **Changing `SESSION_SECRET` signs everyone out.**
- Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` on an `https://` URL; writes also check `Host` and `Origin` against the public URL.
- One instance, one SQLite file on the `data` volume. Back up the volume.
- Anyone who can trigger a run can make the agent read the MR's code in the container; keep it as isolated as in [container.md](container.md) (non-root, no capabilities, limited egress).
