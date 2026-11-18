// Helpers for tests that call the studio app in-process.
export const OWN = { host: 'localhost:4477', 'content-type': 'application/json' };

// send(method, path, body): a JSON request as the studio's own page would make it.
export const sender = (app) => (method, path, body) =>
  app.request(path, { method, headers: OWN, body: body === undefined ? undefined : JSON.stringify(body) });

// The `error` text of a JSON error response.
export const errorOf = async (res) => (await res.json()).error;
