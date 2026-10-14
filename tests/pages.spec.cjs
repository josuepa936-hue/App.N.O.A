const { test, expect } = require('@playwright/test');
const { openApp, snapshot } = require('./fixtures.cjs');

test('cinco preguntas manuales desde UI generan y completan un simulacro sin datos adaptativos inventados', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openApp(page);
  await page.locator('#nav button[data-page="subjects"]').click();
  await page.getByRole('button', { name: '+ Nueva materia', exact: true }).click();
  await page.locator('#subjectName').fill('Materia manual sintética');
  await page.locator('#subjectModal').getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.locator('#subjectsWrap > .card').filter({ hasText: 'Materia manual sintética' })
    .getByRole('button', { name: '+ Tema', exact: true }).click();
  await page.locator('#topicName').fill('Sumas sintéticas');
  await page.locator('#topicModal').getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.locator('#nav button[data-page="exam"]').click();
  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: '+ Añadir pregunta', exact: true }).click();
    await page.locator('#qTopic').selectOption(await page.locator('#qTopic option').filter({ hasText: 'Sumas sintéticas' }).getAttribute('value'));
    await page.locator('#qText').fill(`¿Cuánto es ${i} + 1?`);
    for (const [selector, value] of [['#qA', String(i + 1)], ['#qB', '0'], ['#qC', '100'], ['#qD', '200']]) {
      await page.locator(selector).fill(value);
    }
    await page.locator('#qExplain').fill(`${i}+1=${i + 1}`);
    await page.locator('#questionModal').getByRole('button', { name: 'Guardar', exact: true }).click();
  }
  await page.locator('#examSubject').selectOption(await page.locator('#examSubject option')
    .filter({ hasText: 'Materia manual sintética' }).getAttribute('value'));
  await page.locator('#examCount').selectOption('10');
  await page.getByRole('button', { name: 'Generar simulacro', exact: true }).click();
  expect(await page.evaluate(() => examQueue.length)).toBe(0);
  await expect(page.locator('#toast')).toContainText('5');
  await page.locator('#examCount').selectOption('5');
  await page.getByRole('button', { name: 'Generar simulacro', exact: true }).click();
  const queue = await page.evaluate(() => examQueue);
  expect(queue).toHaveLength(5);
  const topicId = await page.evaluate(() => db.topics.find(topic => topic.name === 'Sumas sintéticas').id);
  expect(queue.every(q => q.topicId === topicId)).toBe(true);
  for (let index = 0; index < 5; index++) {
    await page.locator('#examBox button[onclick="answerExam(0)"]').click();
    await page.locator('#examBox button[onclick="nextExam()"]').click();
  }
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 5 / 5');
  const completed = await snapshot(page);
  expect(completed.attempts).toHaveLength(1);
  expect(completed.calibration.sample).toBe(0);
  expect(completed.answers.every(answer => !answer.blueprint)).toBe(true);
  expect(errors).toEqual([]);
  await testInfo.attach('manual-completado', { body: JSON.stringify(completed, null, 2), contentType: 'application/json' });
});

test('subruta de Pages carga sin errores de consola, favicon ni texto residual', async ({ page, context }, testInfo) => {
  const errors = [], failedResponses = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.responseReceived', event => {
    if (event.response.status >= 400) failedResponses.push({ status: event.response.status, url: event.response.url });
  });
  await openApp(page);
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveCount(1);
  const iconUrl = await icon.evaluate(el => el.href);
  expect(new URL(iconUrl).pathname).toMatch(/^\/App\.N\.O\.A\//);
  expect((await context.request.get(iconUrl)).status()).toBe(200);
  expect(await page.locator('body').innerText()).not.toMatch(/\}\)\(\);\s*$/);
  await page.waitForTimeout(200);
  expect(failedResponses).toEqual([]);
  expect(errors).toEqual([]);
  await testInfo.attach('consola-red', { body: JSON.stringify({ errors, failedResponses, iconUrl }, null, 2), contentType: 'application/json' });
});

test.describe('service worker real', () => {
  test.use({ serviceWorkers: 'allow' });

  test('elimina solo caché obsoleta propia; conserva otras aplicaciones y permite recargar offline', async ({ page, context }, testInfo) => {
    await page.goto('/');
    const seeded = await page.evaluate(async () => {
      const scope = location.origin + '/App.N.O.A/';
      const ownOld = `noa-mobile:${encodeURIComponent(scope)}:v6-60`;
      const otherScoped = `noa-mobile:${encodeURIComponent(location.origin + '/OtherProject/')}:v6-60`;
      const names = [ownOld, otherScoped, 'other-project-v1', 'noa-mobile-v6-61'];
      for (const name of names) {
        await (await caches.open(name)).put('/OtherProject/offline.html', new Response('Contenido sintético ajeno: ' + name));
      }
      return { ownOld, otherScoped, names };
    });
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const after = await page.evaluate(async () => ({
      names: await caches.keys(),
      scope: (await navigator.serviceWorker.getRegistration()).scope,
      script: navigator.serviceWorker.controller.scriptURL
    }));
    expect(after.names).not.toContain(seeded.ownOld);
    for (const name of seeded.names.filter(name => name !== seeded.ownOld)) {
      expect(after.names).toContain(name);
      expect(await page.evaluate(async name => (await (await caches.open(name)).match('/OtherProject/offline.html')).text(), name))
        .toBe('Contenido sintético ajeno: ' + name);
    }
    const currentScopeCaches = after.names.filter(name => name.startsWith(`noa-mobile:${encodeURIComponent(after.scope)}:`));
    expect(currentScopeCaches).toHaveLength(1);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!window.NOA_RESULTS_ENGINE);
    await expect(page.locator('#nav')).toBeVisible();
    const reloadState = await page.evaluate(() => ({ script: navigator.serviceWorker.controller.scriptURL, title: document.title }));
    expect(reloadState.script).toBe(after.script);
    expect(reloadState.title).toContain('NOA');
    await testInfo.attach('caches-offline', { body: JSON.stringify({ seeded, after, reloadState }, null, 2), contentType: 'application/json' });
  });
});
