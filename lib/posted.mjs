// @ts-check
import { getDb } from './store.mjs';
import { deletePosted, readPosted, upsertPosted } from './db-store.mjs';
import { postedKey } from './state-shape.mjs';

// What was sent to GitLab from the studio, so a comment is never sent twice: one entry per comment,
// { at, iid, state: 'draft' | 'published', draftId, body, url, ... }. A comment is a draft note
// until its review is submitted, then published. The key format is private to this module, and
// each operation writes its own row only. `dbOf` gives the database (tests pass an in-memory one).
/** @param {() => import('node:sqlite').DatabaseSync} [dbOf] */
export function postedRecord(dbOf = getDb) {
  const entries = () => Object.entries(readPosted(dbOf())).map(([key, info]) => ({ key, projectKey: key.split('/')[0], info }));
  const draftWith = (projectKey, draftId, iid) => entries().find((e) => e.projectKey === projectKey && e.info.state === 'draft' && e.info.draftId === draftId && e.info.iid === iid);

  return {
    // Every entry, by key (what the studio list sends to the page).
    all: () => readPosted(dbOf()),
    entries,

    find: (projectKey, slug, commentId) => readPosted(dbOf())[postedKey(projectKey, slug, commentId)],

    // Records a comment as a draft note. Returns the entry.
    recordDraft(projectKey, slug, commentId, info) {
      const entry = { at: new Date().toISOString(), state: 'draft', ...info };
      upsertPosted(dbOf(), postedKey(projectKey, slug, commentId), entry);
      return entry;
    },

    // The pending drafts of one review: [{ key, info }].
    draftsOf: (projectKey, slug) => entries().filter((e) => e.key.startsWith(`${postedKey(projectKey, slug, '')}`) && e.info.state === 'draft'),

    // A draft that went out with its review, or that GitLab shows as published; `url` is its deep link, `at` when it did.
    publish(key, url, at = new Date().toISOString()) {
      const { draftId, ...rest } = readPosted(dbOf())[key];
      upsertPosted(dbOf(), key, { ...rest, state: 'published', at, url });
    },

    // Keeps the record in step with a draft edited or deleted on GitLab: false when it was not recorded.
    editDraft(projectKey, draftId, iid, body) {
      const found = draftWith(projectKey, draftId, iid);
      if (found) upsertPosted(dbOf(), found.key, { ...found.info, body });
      return Boolean(found);
    },
    forgetDraft(projectKey, draftId, iid) {
      const found = draftWith(projectKey, draftId, iid);
      if (found) deletePosted(dbOf(), found.key);
      return Boolean(found);
    },

    // A comment deleted on GitLab can be posted again.
    forget: (key) => deletePosted(dbOf(), key),
  };
}

export const posted = postedRecord();
