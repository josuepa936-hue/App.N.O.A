const { test, expect } = require('@playwright/test');
const { openGenerator } = require('./generator-fixtures.cjs');
const { fullExamState } = require('./exam-45-ui-fixtures.cjs');
const { questions } = require('./fixtures.cjs');

const subject = 'EXCOBA Secundaria · Ciencias sociales';
const removeButton = (page, id) => page.locator(`[data-remove-course="${id}"]`);

async function openBank(page) {
  await page.locator('#nav button[data-page="notes"]').click();
  await page.locator('#excobaStudySubject').selectOption(subject);
}

async function seedSources(page) {
  const [selected, retained, foreign] = await page.evaluate(({ subject, questions }) => {
    const engine = NOA_SOURCE_ENGINE;
    const selected = engine.addCourseSource(subject, 'Contenido de Prehistoria.', 'Apunte del curso');
    const retained = engine.addCourseSource(subject, 'Contenido de Geografía.', 'Apunte del curso');
    const foreign = engine.addCourseSource('EXCOBA Secundaria · Español', 'Contenido sobre sintaxis.', 'Otro apunte');
    db.questions = questions;
    db.topics[0].attempts = 2;
    db.topics[0].correct = 1;
    db.attempts = [{ id: 'historial-previo', score: 1, total: 2, pct: 50, at: '2026-01-01T12:00:00Z', evidenceKind: 'unknown' }];
    save();
    return [selected, retained, foreign];
  }, { subject, questions });
  await openBank(page);
  return { selected, retained, foreign };
}

test.beforeEach(async ({ page }) => {
  await openGenerator(page);
});

test('cancelar la confirmación conserva los apuntes y sus datos guardados', async ({ page }) => {
  const { selected } = await seedSources(page);
  const before = await fullExamState(page);
  const confirmation = page.waitForEvent('dialog').then(async dialog => {
    await dialog.dismiss();
    return { type: dialog.type(), message: dialog.message() };
  });
  await removeButton(page, selected.id).click();
  expect(await confirmation).toEqual({ type: 'confirm', message: expect.stringContaining('apunte') });
  await expect(removeButton(page, selected.id)).toBeVisible();
  expect(await fullExamState(page)).toEqual(before);
});

test('si falla localStorage se informa el error y el apunte permanece tras recargar', async ({ page }) => {
  const { selected } = await seedSources(page);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === KEY) throw new DOMException('Almacenamiento bloqueado', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  const before = await fullExamState(page);
  page.once('dialog', dialog => dialog.accept());
  await removeButton(page, selected.id).click();
  await expect(page.locator('#toast')).toHaveText('No se pudo eliminar el apunte.');
  await expect(page.locator('#toast')).toBeVisible();
  await expect(removeButton(page, selected.id)).toBeVisible();
  expect(await fullExamState(page)).toEqual(before);
  await page.reload();
  await openBank(page);
  await expect(removeButton(page, selected.id)).toBeVisible();
});

test.describe('eliminación con Service Worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('elimina offline solo el apunte elegido y conserva los datos académicos tras recargar', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const { selected, retained, foreign } = await seedSources(page);
    await context.setOffline(true);
    await page.reload();
    await openBank(page);
    const before = await fullExamState(page);
    page.once('dialog', dialog => dialog.accept());
    await removeButton(page, selected.id).click();
    await expect(page.locator('#toast')).toHaveText('Apunte eliminado.');
    await expect(page.locator('#toast')).toBeVisible();
    await expect(removeButton(page, selected.id)).toHaveCount(0);
    await expect(removeButton(page, retained.id)).toBeVisible();

    const expectedSources = [retained, foreign];
    const storageKey = await page.evaluate(() => KEY);
    const saved = JSON.parse(before.storage[storageKey]);
    expect(await fullExamState(page)).toEqual({
      ...before, db: { ...before.db, courseSources: expectedSources },
      storage: { ...before.storage, [storageKey]: JSON.stringify({ ...saved, courseSources: expectedSources }) }
    });
    for (const offline of [true, false]) {
      await context.setOffline(offline);
      await page.reload();
      await openBank(page);
      await expect(removeButton(page, selected.id)).toHaveCount(0);
      await expect(removeButton(page, retained.id)).toBeVisible();
      expect(await page.evaluate(() => db.courseSources)).toEqual(expectedSources);
      expect(await page.evaluate(() => db.attempts)).toEqual(before.db.attempts);
    }
    expect(errors).toEqual([]);
  });
});
