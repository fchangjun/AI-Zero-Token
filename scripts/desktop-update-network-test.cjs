// Real Electron transport tests, with disposable profiles and local HTTP fixtures.
// --live additionally downloads and verifies the official current DMG; never installs it.
const { app, session } = require('electron');
const fs = require('node:fs/promises');
const { mkdtempSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = mkdtempSync(path.join(os.tmpdir(), 'azt-update-network-'));
app.setPath('userData', path.join(root, 'profile'));
const bytes = Buffer.alloc(3 * 1024 * 1024 + 7, 31);
const seen = [];
let closedSlow = 0;
const server = http.createServer((req, res) => {
  seen.push({ path: req.url, auth: req.headers.authorization, cookie: req.headers.cookie, accept: req.headers.accept });
  if (req.url === '/redirect' || req.url === '/api') { res.writeHead(302, { location: 'https://release-assets.githubusercontent.com/bytes' }); res.end(); }
  else if (req.url === '/unsafe') { res.writeHead(302, { location: 'http://127.0.0.1/private' }); res.end(); }
  else if (req.url === '/delay') { req.on('close', () => { closedSlow++; }); }
  else if (req.url === '/slow') {
    res.writeHead(200); res.write('first');
    const timer = setInterval(() => res.write(Buffer.alloc(4096)), 10);
    res.on('close', () => {clearInterval(timer);closedSlow++;});
  } else if (req.url === '/truncated') {
    res.writeHead(200, { 'content-length': bytes.length }); res.write('partial');
    setTimeout(() => res.destroy(), 50);
  } else { res.writeHead(200, { 'content-length': bytes.length }); res.end(bytes); }
});
async function main() {
  await app.whenReady();
  const repo = path.resolve(__dirname, '..');
  const { fetchDesktopUpdate } = await import(pathToFileURL(path.join(repo, 'dist/desktop/update-fetch.js')));
  const { downloadRelease, fetchReleaseAsset, fetchMacRelease } = await import(pathToFileURL(path.join(repo, 'dist/desktop/update-release.js')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const signal = () => AbortSignal.timeout(10000);
  const result = await fetchDesktopUpdate(base + '/redirect', { redirect: 'manual', signal: signal() });
  assert.equal(result.status, 302); assert.equal(result.headers.get('location'), 'https://release-assets.githubusercontent.com/bytes');
  assert.equal(seen.filter(r=>r.path==='/bytes').length, 0, 'redirect must wait for validation');
  await assert.rejects(fetchDesktopUpdate(base + '/redirect', {redirect:'error',signal:signal()}), /metadata redirect/);
  await session.defaultSession.cookies.set({url:base,name:'private-cookie',value:'do-not-send'});
  const noCredentials = await fetchDesktopUpdate(base + '/bytes', {redirect:'manual',signal:signal(),headers:{authorization:'Bearer private',cookie:'private=secret'}});
  await noCredentials.arrayBuffer();
  assert.equal(seen.at(-1).auth,undefined);assert.equal(seen.at(-1).cookie,undefined);
  const visited = [];
  const fetcher = (url, init) => {
    visited.push(url);
    const target = new URL(url);
    return fetchDesktopUpdate(base + (target.hostname==='api.github.com'?'/api':target.pathname), init);
  };
  const release = {version:'9.0.0',downloadUrl:'https://github.com/redirect',assetApiUrl:'https://api.github.com/repos/fchangjun/AI-Zero-Token/releases/assets/1',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const destination = path.join(root,'update.dmg');
  await downloadRelease({release,destination,fetcher,signal:signal(),onProgress(){}});
  assert.deepEqual(await fs.readFile(destination), bytes);await fs.unlink(destination);
  assert.ok(visited.includes('https://release-assets.githubusercontent.com/bytes'));
  const before = visited.length;
  await assert.rejects(fetchReleaseAsset(fetcher,'https://github.com/unsafe',signal()),/Untrusted/);
  assert.equal(visited.length,before+1);
  await downloadRelease({release,destination,fetcher:(url,init)=>url.startsWith('https://github.com/')?Promise.reject(new Error('fixture reset')):fetcher(url,init),signal:signal(),onProgress(){}});
  assert.equal(seen.find(r=>r.path==='/api').accept,'application/octet-stream');
  assert.deepEqual(await fs.readFile(destination), bytes);await fs.unlink(destination);
  await assert.rejects(downloadRelease({release:{...release,downloadUrl:'https://github.com/truncated',assetApiUrl:undefined},destination,fetcher,signal:signal(),onProgress(){}}),{code:'download-network'});
  assert.equal(await fs.stat(destination).catch(()=>null),null);
  for (const route of ['/delay','/slow']) {
    const controller = new AbortController();
    const operation = (async () => {const response=await fetchDesktopUpdate(base+route,{redirect:'manual',signal:controller.signal});await response.arrayBuffer();})();
    const failure = assert.rejects(operation);
    setTimeout(()=>controller.abort(),100);
    await failure;
  }
  const response = await fetchDesktopUpdate(base+'/slow',{redirect:'manual',signal:signal()});
  await response.body.cancel();
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(closedSlow,3,'abort and body cancellation close their connections');
  console.log(JSON.stringify({result:'PASS',checks:['real Electron 302','metadata redirect rejection','no automatic untrusted follow','no cookies or authorization','streamed SHA-256 download','official API fallback','interrupted stream cleanup','abort before/after headers','consumer cancellation']}));
  if (process.argv.includes('--live')) {
    const real = await fetchMacRelease(fetchDesktopUpdate,'0.0.0',process.arch,AbortSignal.timeout(20000));
    assert.ok(real?.sha256);
    let progress=-1;
    await downloadRelease({release:real,destination,fetcher:fetchDesktopUpdate,signal:AbortSignal.timeout(5*60*1000),onProgress(value){const step=Math.floor(value/25)*25;if(step!==progress){progress=step;console.log(`Official DMG download: ${step}%`);}}});
    console.log(JSON.stringify({live:'PASS',version:real.version,arch:process.arch,size:(await fs.stat(destination)).size,sha256:real.sha256,installed:false}));
  }
}
main().then(()=>finish(0),error=>{console.error(error);void finish(1);});
async function finish(code) {
  server.closeAllConnections();server.close();
  try {await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
  finally {app.exit(code);}
}
