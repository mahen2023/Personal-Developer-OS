import { expect, test } from '@playwright/test';
import { EMAIL, PASSWORD } from './credentials';

// These exercise the sign-in flow itself, so they start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

/** Named so it cannot match Next's route announcer, which is also role=alert. */
const ALERT = { name: 'Error' } as const;

test('an unauthenticated visitor is sent to sign-in, and back to where they were headed', async ({
  page,
}) => {
  await page.goto('/servers');
  await expect(page).toHaveURL(/\/login\?next=%2Fservers/);

  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock workspace' }).click();

  await expect(page).toHaveURL('/servers');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
});

test('a wrong password is rejected without revealing which field was wrong', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Unlock workspace' }).click();

  // Both outcomes are correct: the credential message, or the rate limit if
  // the suite has already spent this minute's login attempts. What matters is
  // that neither names which field was wrong, and neither leaks an exception.
  await expect(page.getByRole('alert', ALERT)).toContainText(
    /Email or password is incorrect|Too many attempts in a short time/,
  );
  await expect(page.getByRole('alert', ALERT)).not.toContainText('Exception');
  await expect(page).toHaveURL(/\/login/);
});

test('registration rejects a password that is too short, and says why', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Too Short');
  await page.getByLabel('Email').fill(`short-${Date.now()}@developer-os.local`);
  // minLength on the input would block submission before the API is reached, so
  // this checks the server-side rule, which is the one that actually protects.
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('alert', ALERT)).toContainText('at least 12 characters');
});
