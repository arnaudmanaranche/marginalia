// The schema, as an ordered list of migrations: entry N takes the database from
// user_version N to N+1. Append, never edit one that has shipped.
export const MIGRATIONS = [
  `
  CREATE TABLE state_entry (
    project TEXT NOT NULL,
    kind    TEXT NOT NULL,  -- 'sha' (reviewed head), 'peer' (last comment triaged), 'below' (layer below at review)
    iid     TEXT NOT NULL,
    value   TEXT NOT NULL,  -- JSON: a string, or null for "review again"
    PRIMARY KEY (project, kind, iid)
  );
  CREATE TABLE posted (
    key  TEXT PRIMARY KEY,  -- <project>/<review slug>:<comment id>
    data TEXT NOT NULL      -- JSON
  );
  CREATE TABLE run (
    id      INTEGER PRIMARY KEY,
    at      TEXT NOT NULL,
    project TEXT,
    data    TEXT NOT NULL   -- JSON: iid, kind, command, cost, tokens, turns
  );
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  `
  CREATE TABLE mention (
    project TEXT NOT NULL,
    note_id INTEGER NOT NULL,
    at      TEXT NOT NULL,
    outcome TEXT NOT NULL,  -- 'ran', or why it did not: 'duplicate', 'not-a-member', 'daily-cap', 'refused'
    PRIMARY KEY (project, note_id)
  );
  `,
  `
  CREATE TABLE session (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    name       TEXT NOT NULL,
    projects   TEXT NOT NULL,  -- JSON: keys of the projects the person may use
    tokens     TEXT NOT NULL,  -- sealed JSON: GitLab access and refresh token, expiry
    expires_at INTEGER NOT NULL
  );
  `,
];
