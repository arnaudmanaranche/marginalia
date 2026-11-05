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
  `
  CREATE TABLE dismissed (
    key TEXT PRIMARY KEY,  -- <project>/<review slug>:<finding id>, as posted
    at  TEXT NOT NULL,
    by  TEXT NOT NULL      -- the person who decided it is not worth saying
  );
  `,
  `
  CREATE TABLE fixed_before (
    key TEXT PRIMARY KEY,  -- <project>/<review slug>:<finding id>, as posted
    at  TEXT NOT NULL,
    sha TEXT NOT NULL      -- the commit whose push changed the code the finding pointed at
  );
  `,
  `
  CREATE TABLE task (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,  -- 'poll', 'mention', 'understand', 'rerun'
    project     TEXT,           -- null for a task about every project (a poll)
    label       TEXT NOT NULL,
    priority    TEXT NOT NULL,  -- 'high' (a person asked), 'normal' (a poll)
    status      TEXT NOT NULL,  -- 'queued', 'running', 'done', 'failed'
    payload     TEXT NOT NULL,  -- JSON: what the handler of the kind needs
    dedupe      TEXT,           -- a request with the same key joins the waiting task
    enqueued_at TEXT NOT NULL,
    started_at  TEXT,
    ended_at    TEXT,
    attempt     INTEGER NOT NULL,
    error       TEXT
  );
  CREATE INDEX task_status ON task (status, ended_at);
  `,
];
