export const byId = (db, id) => db.query('SELECT * FROM users WHERE id = $1', [id]);

// Search users by name, from the query string of the admin page.
export const search = (db, name) => db.query(`SELECT * FROM users WHERE name LIKE '%${name}%'`);
