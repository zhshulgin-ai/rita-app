// server.js — the whole HTTP layer. No framework: plain node:http, a tiny router, static
// file serving, and JSON body parsing. Delegates to api.js for /api/* logic.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getUserFromToken, parseCookies } = requireAuthHelpers();
const { handlers, ApiError } = require('./api');

function requireAuthHelpers() {
  const auth = require('./auth');
  return { getUserFromToken: auth.currentUser, parseCookies: auth.parseCookies };
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Must match the DATA_DIR logic in db.js/api.js — this is where uploaded photos actually
// live (a persistent Railway volume in production), not just a folder next to the code.
const DATA_ROOT = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// --- tiny router with :param support -------------------------------------------------
const routeTable = Object.keys(handlers).map((key) => {
  const [method, routePath] = key.split(' ');
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      routePath
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            paramNames.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  return { method, regex, paramNames, handler: handlers[key] };
});

function matchRoute(method, pathname) {
  for (const route of routeTable) {
    if (route.method !== method) continue;
    const match = route.regex.exec(pathname);
    if (!match) continue;
    const params = {};
    route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
    return { handler: route.handler, params };
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new ApiError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ApiError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  if (!resolved.startsWith(base)) return null; // path traversal guard
  return resolved;
}

function serveStatic(req, res, pathname) {
  const dir = pathname.startsWith('/uploads/') ? UPLOADS_DIR : PUBLIC_DIR;
  const rel = pathname.startsWith('/uploads/') ? pathname.slice('/uploads'.length) : pathname;
  let filePath = safeJoin(dir, rel === '/' ? '/index.html' : rel);
  if (!filePath) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      if (dir === PUBLIC_DIR) {
        // SPA fallback: unknown non-API GET routes serve the app shell.
        filePath = path.join(PUBLIC_DIR, 'index.html');
      } else {
        res.writeHead(404);
        return res.end('Not found');
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET') {
      res.writeHead(405);
      return res.end('Method not allowed');
    }
    return serveStatic(req, res, pathname);
  }

  const match = matchRoute(req.method, pathname);
  if (!match) return sendJson(res, 404, { error: 'Not found' });

  try {
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const cookies = parseCookies(req);
    const user = getUserFromToken(req);
    const result = await match.handler(req, res, user, body, cookies, match.params);
    sendJson(res, result.status, result.body);
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: 'Something went wrong' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Rita is running at http://localhost:${PORT}`);
});
