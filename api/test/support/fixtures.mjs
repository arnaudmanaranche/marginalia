// GitLab-shaped payloads for tests: the base shape, and `over` replaces any field.
export const glMr = (iid, over = {}) => ({
  iid, sha: `sha${iid}`, title: `MR ${iid}`, source_branch: `b${iid}`, target_branch: 'main', author: { username: 'alice' }, ...over,
});

export const glNote = (id, body, over = {}) => ({
  id, body, system: false, created_at: `2026-10-30T10:0${id}:00Z`, author: { username: 'bob' }, ...over,
});

export const glThread = (id, notes = []) => ({ id, notes });
