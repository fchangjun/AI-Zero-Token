// Local development only. Deploy out/ as static files; this process is never deployed.
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatic } from './build-static.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

export function createStaticPreview(directory, { blockDataRequests = false } = {}) {
  const base = path.resolve(directory);
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (blockDataRequests) response.setHeader('Content-Security-Policy', "connect-src 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      let filename = path.resolve(base, `.${pathname}`);
      if (!filename.startsWith(`${base}${path.sep}`) && filename !== base) throw new Error('Outside static directory');
      if ((await stat(filename)).isDirectory()) {
        if (!pathname.endsWith('/')) { response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end(); return; }
        filename = path.join(filename, 'index.html');
      }
      const resolved = await realpath(filename);
      if (!resolved.startsWith(`${await realpath(base)}${path.sep}`)) throw new Error('Outside static directory');
      const bytes = await readFile(resolved);
      response.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream', 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      const fallback = await readFile(path.join(base, '404.html')).catch(() => 'Not found');
      response.end(request.method === 'HEAD' ? undefined : fallback);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildStatic(root);
  const portArg = process.argv.indexOf('--port');
  const port = portArg < 0 ? 4173 : Number(process.argv[portArg + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid preview port');
  const server = createStaticPreview(path.join(root, 'out'), { blockDataRequests: process.argv.includes('--offline-apis') });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/`));
  if (process.argv.includes('--watch')) {
    let queued = false, building = false, timer;
    const rebuild = async () => {
      queued = true;
      if (building) return;
      building = true;
      while (queued) {
        queued = false;
        try { await buildStatic(root); console.log('已重新构建，刷新浏览器查看。'); } catch (error) { console.error(error.message); }
      }
      building = false;
    };
    const changed = () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); };
    for (const dir of ['pages', 'public']) watch(path.join(root, dir), { recursive: true }, changed);
    watch(path.join(root, 'site.config.json'), changed);
  }
}
