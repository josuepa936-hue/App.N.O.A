const { test, expect } = require('@playwright/test');
const { openGenerator, mockBatch, examState } = require('./generator-fixtures.cjs');
const { questions, answer } = require('./fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.auditErrors = [];
  page.on('pageerror', error => page.auditErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.auditErrors.push(message.text()); });
  await openGenerator(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('v24-ux-estado', {
    body: JSON.stringify(await page.evaluate(errors => ({
      errors, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      phase: document.querySelector('#noaGeneratorPhase').textContent,
      details: document.querySelector('#noaGeneratorDetails').textContent,
      buttonDisabled: document.querySelector('#noaGeneratorGenerate').disabled
    }), page.auditErrors), null, 2), contentType: 'application/json'
  });
  expect(page.auditErrors).toEqual([]);
});

for (const width of [320, 390, 768, 1365]) {
  test(`v24 y Simulacros no desbordan horizontalmente a ${width} px con nueve materias`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const longest = await page.evaluate(() => NOA_EXCOBA_V4.subjects.reduce((result, subject) =>
      subject.label.length > result.label.length ? subject : result).value);
    await page.locator('#noaGeneratorSubject').selectOption(longest);
    await expect(page.locator('#noaGeneratorSubject option')).toHaveCount(9);

    async function assertReadable() {
      const state = await page.evaluate(() => {
        const card = document.querySelector('#noaGeneratorCard').getBoundingClientRect();
        return {
          viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
          card: { left: card.left, right: card.right },
          controls: ['noaGeneratorSubject', 'noaGeneratorCount', 'noaGeneratorGenerate', 'noaGeneratorStatus', 'noaGeneratorDetails']
            .map(id => {
              const element = document.getElementById(id), rect = element.getBoundingClientRect();
              return { id, left: rect.left, right: rect.right, height: rect.height,
                scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
            })
        };
      });
      expect(state.documentWidth).toBeLessThanOrEqual(state.viewport + 1);
      expect(state.card.left).toBeGreaterThanOrEqual(0);
      expect(state.card.right).toBeLessThanOrEqual(state.viewport);
      for (const control of state.controls) {
        expect(control.left).toBeGreaterThanOrEqual(state.card.left);
        expect(control.right).toBeLessThanOrEqual(state.card.right);
        expect(control.height).toBeGreaterThan(0);
        expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
      }
    }

    await assertReadable();
    await mockBatch(page, 'incomplete');
    await page.locator('#noaGeneratorGenerate').click();
    await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación incompleta');
    await assertReadable();
    await mockBatch(page, 'error');
    await page.locator('#noaGeneratorGenerate').click();
    await expect(page.locator('#noaGeneratorPhase')).toHaveText('Error del motor');
    await expect(page.locator('#noaGeneratorGenerate')).toBeEnabled();
    await assertReadable();
  });
}

test('v24 permite recorrer controles por teclado y anuncia el error sin bloquear el botón', async ({ page }) => {
  await expect(page.getByLabel('Materia del Temario Maestro EXCOBA', { exact: true })).toHaveAttribute('id', 'noaGeneratorSubject');
  await expect(page.getByLabel('Cantidad de preguntas', { exact: true })).toHaveAttribute('id', 'noaGeneratorCount');
  await expect(page.locator('#noaGeneratorStatus')).toHaveAttribute('role', 'status');
  await expect(page.locator('#noaGeneratorStatus')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#noaGeneratorStatus')).toHaveAttribute('aria-atomic', 'true');
  await expect(page.locator('#noaGeneratorGenerate')).toHaveAttribute('aria-describedby', 'noaGeneratorStatus');

  await mockBatch(page, 'deferred');
  await page.locator('#noaGeneratorSubject').focus();
  await page.keyboard.press('ArrowDown');
  const selectedSubject = await page.locator('#noaGeneratorSubject').inputValue();
  await page.keyboard.press('Tab');
  await expect(page.locator('#noaGeneratorCount')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#noaGeneratorCount')).toHaveValue('10');
  await page.keyboard.press('Tab');
  await expect(page.locator('#noaGeneratorGenerate')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generando y evaluando reactivos');
  expect(await page.evaluate(() => window.__batchCalls)).toEqual([{
    subject: selectedSubject, blueprintCount: 10, limit: 10, concurrency: 2, maxAttempts: 2
  }]);
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  await page.evaluate(() => window.__batchPending.reject(new Error('Fallo sintético desde teclado')));
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Error del motor');
  await expect(page.locator('#noaGeneratorDetails')).toContainText('Fallo sintético desde teclado');
  await expect(page.locator('#noaGeneratorGenerate')).toBeEnabled();
});

test('v24 permite activar por teclado y cancelar la confirmación sin perder progreso', async ({ page }) => {
  await page.evaluate(queue => NOA_MIXED_EXAM.start(queue, 'Examen protegido por teclado'), questions);
  await answer(page, questions[0]);
  const before = await examState(page);
  await mockBatch(page);
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
  await page.locator('#noaGeneratorGenerate').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => confirmations).toBe(1);
  expect(await page.evaluate(() => window.__batchCalls)).toEqual([]);
  expect(await examState(page)).toEqual(before);
  await expect(page.locator('#noaGeneratorGenerate')).toBeEnabled();
});
