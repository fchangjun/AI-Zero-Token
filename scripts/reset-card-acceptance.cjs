// Isolated Electron lifecycle fixture; no live gateway or user account state.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'azt-card-acceptance-')));
app.on('window-all-closed', () => {});
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(check(), 'window transition finished');
}
app.whenReady().then(async () => {
  const { ResetNotificationCards } = await import(pathToFileURL(path.resolve(__dirname, '../dist/desktop/reset-notification-card.js')));
  const { resetNotificationContent } = await import(pathToFileURL(path.resolve(__dirname, '../dist/core/reset-notification-content.js')));
  let opens = 0;
  const errors = [];
  const cards = new ResetNotificationCards({ onOpen: () => { opens += 1; }, onError: (error) => errors.push(error) });
  const event = { ...resetNotificationContent('scheduled'), kind: 'test', eventId: 'fixture' };
  assert.equal(await cards.notify(event), true);
  const first = BrowserWindow.getAllWindows()[0];
  assert.ok(first.isVisible());
  assert.equal(first.isFocused(), false, 'a reminder must not take input focus');
  const layout = await first.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.card').getBoundingClientRect();
    const footer = document.querySelector('.footer').getBoundingClientRect();
    const body = document.querySelector('p');
    return { bottomFits: footer.bottom <= card.bottom - 8, bodyFits: body.scrollHeight <= body.clientHeight };
  })()`);
  assert.ok(layout.bottomFits && layout.bodyFits, 'copy and controls fit inside the card');
  assert.deepEqual(await Promise.all([cards.notify(event), cards.notify(event), cards.notify(event)]), [true, true, true]);
  assert.ok(first.isDestroyed(), 'oldest card is removed at the cap');
  const windows = BrowserWindow.getAllWindows().sort((a, b) => a.getBounds().y - b.getBounds().y);
  assert.equal(windows.length, 3);
  for (let i = 1; i < windows.length; i += 1) {
    const previous = windows[i - 1].getBounds();
    assert.ok(windows[i].getBounds().y + 16 >= previous.y + previous.height - 16, 'card surfaces do not overlap');
  }
  let prevented = false;
  windows[0].webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, 'https://example.invalid');
  assert.equal(prevented, true);
  assert.equal(opens, 0, 'untrusted navigation cannot open the calendar or a browser');
  windows[0].webContents.emit('will-navigate', { preventDefault() {} }, 'azt-card://open');
  assert.equal(opens, 1);
  await until(() => windows[0].isDestroyed());
  assert.ok(windows[0].isDestroyed());
  windows[1].webContents.emit('will-navigate', { preventDefault() {} }, 'azt-card://dismiss');
  assert.equal(opens, 1, 'dismiss does not navigate');
  await until(() => windows[1].isDestroyed());
  assert.ok(windows[1].isDestroyed());
  cards.dispose();
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  assert.equal(await cards.notify(event), false, 'shutdown rejects later deliveries');
  assert.equal(errors.length, 0);
  const failed = new ResetNotificationCards({ onOpen() {}, onError: (error) => errors.push(error) });
  const loadURL = BrowserWindow.prototype.loadURL;
  BrowserWindow.prototype.loadURL = async () => { throw new Error('Synthetic load failure'); };
  try { assert.equal(await failed.notify(event), false); }
  finally { BrowserWindow.prototype.loadURL = loadURL; failed.dispose(); }
  assert.equal(BrowserWindow.getAllWindows().length, 0, 'failed delivery leaves no hidden window');
  assert.equal(errors.length, 1);
  const { ResetCalendarNavigator } = await import(pathToFileURL(path.resolve(__dirname, '../dist/desktop/reset-calendar-navigation.js')));
  let mainWindow = null;
  // Match the real management page's loopback origin. Chromium blocks hash
  // navigation on top-level data: documents, so data: is not a valid route fixture.
  const server = require('node:http').createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<h1>Calendar fixture</h1><script>window.revealed=false;addEventListener("azt:open-reset-calendar",()=>window.revealed=true)</script>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const page = `http://127.0.0.1:${server.address().port}/`;
  const navigationErrors = [];
  const navigator = new ResetCalendarNavigator({
    getWindow: () => mainWindow,
    focusWindow() {
      if (mainWindow) return;
      const created = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      mainWindow = created;
      created.once('closed', () => { if (mainWindow === created) mainWindow = null; });
      created.webContents.on('did-finish-load', () => navigator.consume());
      created.webContents.on('did-stop-loading', () => navigator.consume());
      void created.loadURL(page).then(() => navigator.consume());
    },
    isAllowedUrl: (url) => url.startsWith(page),
    isQuitting: () => false,
    onError: (error) => navigationErrors.push(error),
  });
  const navigationCards = new ResetNotificationCards({ onOpen: () => navigator.request(), onError: (error) => navigationErrors.push(error) });
  for (const recreate of [false, true]) {
    if (recreate) { mainWindow.destroy(); await until(() => mainWindow === null); }
    await navigationCards.notify(event);
    const card = BrowserWindow.getAllWindows().find((window) => window !== mainWindow);
    card.webContents.emit('will-navigate', { preventDefault() {} }, 'azt-card://open');
    try { await until(() => mainWindow !== null && !mainWindow.webContents.isLoading() && mainWindow.webContents.getURL().endsWith('#reset-calendar')); }
    catch (error) { console.error({ recreate, url: mainWindow?.webContents.getURL(), loading: mainWindow?.webContents.isLoading(), pageState: await mainWindow?.webContents.executeJavaScript('({ hash: location.hash, revealed: window.revealed, ready: document.readyState })'), navigationErrors }); throw error; }
    assert.equal(await mainWindow.webContents.executeJavaScript('window.revealed'), true, 'calendar reveal event reaches the new document');
  }
  // Existing calendar document: a card click must reveal the page beneath settings too.
  await mainWindow.webContents.executeJavaScript('window.revealed=false');
  navigator.request();
  assert.equal(await mainWindow.webContents.executeJavaScript('window.revealed'), true);
  navigationCards.dispose();
  mainWindow.destroy();
  await new Promise((resolve) => server.close(resolve));
  assert.deepEqual(navigationErrors, []);
  console.log('PASS: visible card, focus preservation, text fit, concurrent cap/stack, safe actions, navigation/dismiss, shutdown, failure cleanup, real-window calendar navigation/recreation');
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
