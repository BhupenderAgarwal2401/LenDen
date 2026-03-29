const { test, expect } = require('@playwright/test');

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
