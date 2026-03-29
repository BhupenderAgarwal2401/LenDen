const { test, expect } = require('@playwright/test');

async function enterPin(page, digits = '1234') {
  for (const d of digits) {
    await page.locator('.pin-btn', { hasText: d }).first().click();
  }
  await page.waitForTimeout(250);
}

async function unlockFreshApp(page) {
  await page.goto('/index.html');
  await expect(page.locator('#pin-screen')).toBeVisible();
  await enterPin(page, '1234');
  await enterPin(page, '1234');
  await expect(page.locator('#app')).toHaveClass(/visible/);
}

test('app loads and shows PIN gate', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#pin-screen')).toBeVisible();
  await expect(page.locator('.pin-logo')).toContainText('LenDen');
});

test('regression test page is reachable', async ({ page }) => {
  await page.goto('/tests/regression.html');
  await expect(page.locator('h2')).toContainText('LenDen Regression Tests');
  await expect(page.getByRole('button', { name: 'Run Tests' })).toBeVisible();
});

test('emi schedule requires explicit settlement', async ({ page }) => {
  await unlockFreshApp(page);

  await page.evaluate(() => {
    localStorage.setItem('ld2_people', JSON.stringify([{ id: 'p-emi', name: 'EMI Friend', phone: '', notes: '' }]));
    localStorage.setItem('ld2_txns', JSON.stringify([]));
    localStorage.setItem('ld2_payments', JSON.stringify([]));
    localStorage.setItem('ld2_emi_schedules', JSON.stringify([]));
    if (typeof showPage === 'function') showPage('lending');
    if (typeof openTxnModal === 'function') openTxnModal('p-emi');
  });

  await page.locator('#m-charged').fill('12000');
  await page.locator('#m-date').fill('2026-01-05');
  await page.locator('#m-is-emi').check();
  await page.locator('#m-emi-rate').fill('12');
  await page.locator('#m-emi-tenure').fill('6');
  await page.locator('#m-emi-tenure-unit').selectOption('months');
  await page.locator('#m-emi-start').fill('2026-01-05');
  await page.locator('#m-emi-proc-fee').fill('300');
  await page.locator('#m-emi-proc-gst').fill('18');
  await page.locator('#m-emi-interest-gst').fill('18');
  await page.getByRole('button', { name: 'Save' }).click();

  const before = await page.evaluate(() => {
    const txns = JSON.parse(localStorage.getItem('ld2_txns') || '[]');
    const payments = JSON.parse(localStorage.getItem('ld2_payments') || '[]');
    const schedules = JSON.parse(localStorage.getItem('ld2_emi_schedules') || '[]');
    const txn = txns[0];
    const emiEntries = schedules.filter(p => p.txnId === txn.id);
    const paid = payments.filter(p => p.txnId === txn.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return {
      txnId: txn.id,
      emiCount: emiEntries.length,
      paid,
      firstExpected: emiEntries[0]?.expectedAmount || 0,
      secondExpected: emiEntries[1]?.expectedAmount || 0
    };
  });

  expect(before.emiCount).toBe(6);
  expect(before.paid).toBe(0);
  expect(before.firstExpected).toBeGreaterThan(before.secondExpected);

  await page.evaluate((txnId) => {
    if (typeof openTxnDetail === 'function') openTxnDetail(txnId, 'td-pay');
  }, before.txnId);

  await page.getByRole('button', { name: 'Mark Received' }).first().click();
  await page.locator('#emi-rx-amt').fill('2500');
  await page.locator('#emi-rx-date').fill('2026-01-05');
  await page.getByRole('button', { name: 'Confirm Received' }).click();

  const after = await page.evaluate((txnId) => {
    const txns = JSON.parse(localStorage.getItem('ld2_txns') || '[]');
    const payments = JSON.parse(localStorage.getItem('ld2_payments') || '[]');
    const schedules = JSON.parse(localStorage.getItem('ld2_emi_schedules') || '[]');
    const emiEntries = schedules.filter(p => p.txnId === txnId);
    const settled = emiEntries.filter(p => p.settled);
    const paid = payments.filter(p => p.txnId === txnId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const txn = txns.find(t => t.id === txnId) || {};
    return { settledCount: settled.length, paid, status: txn.status || '' };
  }, before.txnId);

  expect(after.settledCount).toBe(1);
  expect(after.paid).toBe(2500);
  expect(['partial', 'settled']).toContain(after.status);
});
