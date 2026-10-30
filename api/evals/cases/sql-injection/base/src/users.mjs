export const byId = (db, id) => db.query('SELECT * FROM users WHERE id = $1', [id]);
