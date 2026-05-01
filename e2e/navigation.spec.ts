import { test, expect } from '@playwright/test';

test('index page loads with editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app-title')).toHaveText('Java Browser Runtime');
  await expect(page.getByTestId('monaco-container')).toBeVisible();
  await expect(page.getByTestId('compile-btn')).toBeVisible();
});
