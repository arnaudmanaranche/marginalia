import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./src/index.html', import.meta.url));
createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') { res.setHeader('content-type', 'text/html'); res.end(page); } else { res.statusCode = 404; res.end('not found'); }
}).listen(8123, '127.0.0.1');
