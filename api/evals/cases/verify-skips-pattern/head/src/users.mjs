export const getUser = (db, id) => db.users.get(id);
// Rule broken: not named with a verb.
export const userName = (db, id) => db.users.get(id)?.name ?? null;
