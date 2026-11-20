const { test, expect } = require('@playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');

const basePath = '/App.N.O.A/';
const addon = 'excoba_addon_course_only.js';
const subject = 'EXCOBA Secundaria · Ciencias sociales';
const root = resolve(__dirname, '..');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

test.use({ serviceWorkers: 'allow' });

async function waitForControl(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

function cacheState(page) {
  return page.evaluate(async addon => {
    const scope = (await navigator.serviceWorker.getRegistration()).scope;
    const prefix = 'noa-mobile:' + encodeURIComponent(scope) + ':';
    const names = (await caches.keys()).filter(name => name.startsWith(prefix));
    const assets = await Promise.all(names.map(async name => Boolean(await (await caches.open(name)).match(new URL(addon, scope).href))));
    return { versions: names.map(name => name.slice(prefix.length)), precached: assets.some(Boolean) };
  }, addon);
}

async function seedHistory(page) {
  return page.evaluate(subject => {
    const source = NOA_SOURCE_ENGINE.addCourseSource(subject, 'Paleolítico: caza y recolección.', 'Historia 1A');
    source.analysisStatus = 'ready';
    source.analysis = { overall_classification: 'related', syllabus_links: [{ code: '2.4.2.1' }] };
    save();
    return source;
  }, subject);
}

async function openHistory(page, source) {
  await page.locator('#nav button[data-page="notes"]').click();
  await page.locator('#excobaStudySubject').selectOption(subject);
  return page.locator(`[data-noa-course-only-toggle="${source.id}"]`);
}

test('instalación limpia precachea el complemento y permite cambiar la protección offline', async ({ page, context }) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await waitForControl(page);
  const source = await seedHistory(page);
  expect(await cacheState(page)).toEqual({ versions: ['v6-101'], precached: true });
  await context.setOffline(true);
  await page.reload();
  const button = await openHistory(page, source);
  await button.click();
  await expect(button).toHaveText('Quitar protección complementaria');
  await page.reload();
  await openHistory(page, source);
  await expect(button).toHaveText('Quitar protección complementaria');
  expect(await page.evaluate(subject => NOA_COURSE_ONLY_ADDON_V1.preview(subject), subject))
    .toEqual([expect.objectContaining({ effectiveClassification: 'course_only', syllabusCodes: [] })]);
  expect(await page.evaluate(() => db.courseSources)).toEqual([source]);
  expect(errors).toEqual([]);
});

test('actualización de v6-100 precachea el complemento para la siguiente recarga offline', async ({ page, context }) => {
  const currentWorker = readFileSync(resolve(root, 'sw.js'), 'utf8');
  const previousWorker = currentWorker.replace("'v6-101'", "'v6-100'")
    .replace("\n  './excoba_addon_course_only.js',\n", '')
    .replace(/cache\.addAll\(ASSETS\.map\(asset =>[\s\S]*?\)\)\)/, 'cache.addAll(ASSETS))');
  const currentShell = readFileSync(resolve(root, 'index.html'), 'utf8');
  const previousShell = currentShell.replace(`  <script src="./${addon}"></script>\n`, '');
  const oldAddon = 'window.oldCourseAddonFixture = true;';
  let upgraded = false;
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (!pathname.startsWith(basePath)) return response.writeHead(404).end();
    const relative = pathname.slice(basePath.length) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) return response.writeHead(404).end();
    const headers = { 'Content-Type': types[extname(relative)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' };
    if (relative === 'sw.js') return response.writeHead(200, { ...headers, 'Cache-Control': 'no-store' }).end(upgraded ? currentWorker : previousWorker);
    if (relative === 'index.html') return response.writeHead(200, headers).end(upgraded ? currentShell : previousShell);
    if (relative === addon && !upgraded) return response.writeHead(200, headers).end(oldAddon);
    readFile(file, (error, content) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, headers).end(content);
    });
  });
  await new Promise((done, reject) => server.once('error', reject).listen(0, '127.0.0.1', done));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}${basePath}`);
    await waitForControl(page);
    expect(await cacheState(page)).toEqual({ versions: ['v6-100'], precached: false });
    expect(await page.evaluate(() => Boolean(window.NOA_COURSE_ONLY_ADDON_V1))).toBe(false);
    expect(await page.evaluate(async addon => (await fetch(new URL(addon, document.baseURI))).text(), addon)).toBe(oldAddon);
    const source = await seedHistory(page);
    await page.evaluate(id => localStorage.setItem('NOA_COURSE_ONLY_ADDON_V1:/App.N.O.A/', JSON.stringify([id])), source.id);
    await page.evaluate(() => caches.open('unrelated-project-cache'));
    upgraded = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => cacheState(page)).toEqual({ versions: ['v6-101'], precached: true });
    await context.setOffline(true);
    await page.reload();
    const button = await openHistory(page, source);
    await expect(button).toHaveText('Quitar protección complementaria');
    expect(await page.evaluate(() => Boolean(window.oldCourseAddonFixture))).toBe(false);
    expect(await page.evaluate(() => db.courseSources)).toEqual([source]);
    expect(await page.evaluate(() => caches.keys())).toContain('unrelated-project-cache');
    expect(errors).toEqual([]);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
