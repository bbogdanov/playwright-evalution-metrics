/**
 * Static file server for the built Angular app.
 *
 * Deliberately not `ng serve`: the dev server ships an unoptimised bundle, runs
 * change detection twice per tick in development mode, and injects HMR plumbing.
 * All three inflate render time and add variance, which would contaminate every
 * measurement in this study. Scenarios always run against a production build.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.env.BM_APP_DIST ?? 'app/dist/app/browser');
const PORT = Number(process.env.BM_PORT ?? 4300);
const HOST = process.env.BM_HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(ROOT)) {
  console.error(`[static-server] build output not found at ${ROOT}\nRun: npm run app:build`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  let filePath = join(ROOT, normalize(decodeURIComponent(url.pathname)));

  // Guard against traversal out of the build output.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback: every unknown path is an Angular route.
    filePath = join(ROOT, 'index.html');
  }

  const ext = extname(filePath);
  const isHashed = /-[A-Z0-9]{8}\.(js|css)$/.test(filePath);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[static-server] ${ROOT} -> http://${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
