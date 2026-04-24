import { expect, test } from '@playwright/test';

const adminEmail = process.env.UPRM_ADMIN_E2E_EMAIL || 'admin@uprm.local';
const adminPassword = process.env.UPRM_ADMIN_E2E_PASSWORD || 'jxzA5liAz5DlRsM4Bt2D';

test('login page loads and authenticates into dashboard', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
});

test('users page can load tenant users after login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByRole('button', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User search' })).toBeVisible();
});
