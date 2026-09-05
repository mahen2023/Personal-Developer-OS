import { expect, test, type Page } from '@playwright/test';
import { MASTER_PASSWORD } from './credentials';

/**
 * Phase 5 — the vault.
 *
 * These tests care about one thing above all: a secret must never be present
 * anywhere it should not be. Several assertions are therefore negative, and
 * those are the important ones.
 *
 * Two constraints shape how this file is written, and both are features:
 *
 *  1. Unlocking is rate limited to five attempts a minute. So the suite
 *     unlocks once and shares the session, the way a person does.
 *  2. A full page load drops the in-memory key. So navigation after unlocking
 *     goes through the UI, never `page.goto`.
 */
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const RUN = Date.now().toString(36);
const SECRET = `s3cret-${RUN}-value`;

let page: Page;

/** Sets the vault up on the first ever run, then unlocks it. Argon2id is slow. */
async function openVault(target: Page): Promise<void> {
  await target.goto('/vault');

  const setup = target.getByRole('button', { name: 'Create vault' });
  const unlock = target.getByRole('button', { name: 'Unlock vault' });
  // Waits for whichever gate applies; isVisible() alone would race the load.
  await expect(setup.or(unlock)).toBeVisible({ timeout: 20_000 });

  if (await setup.isVisible()) {
    await target.getByLabel('Master password').fill(MASTER_PASSWORD);
    await target.getByLabel('Confirm').fill(MASTER_PASSWORD);
    await target.getByRole('checkbox').check();
    await setup.click();
  } else {
    await target.getByLabel('Master password').fill(MASTER_PASSWORD);
    await unlock.click();
  }

  await expect(target.getByText('Vault is unlocked in this tab.')).toBeVisible({ timeout: 40_000 });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await openVault(page);
});

test.afterAll(async () => {
  await page.close();
});

/** The panel's own control, not the always-present one in the top bar. */
const lockNow = () => page.getByRole('button', { name: 'Lock now', exact: true });

/**
 * Navigate by href, not by accessible name: rail links carry a live count and
 * a shortcut hint, so their names change as records are added and removed.
 */
const navigateTo = (href: string) =>
  page.locator(`nav[aria-label="Primary"] a[href="${href}"]`).first().click();

/**
 * Opens an item by name, filtering first.
 *
 * A vault accumulates: after a few dozen items the one just created is not on
 * the first page, and clicking a name that happens to be visible is a test
 * that passes for the wrong reason.
 */
async function openItem(name: string): Promise<void> {
  await page.getByRole('textbox', { name: /Search names/ }).fill(name);
  await page.getByText(name).click();
  await expect(page).toHaveURL(/\/vault\/[0-9a-f-]{36}/);
}

test('a password round-trips, and the plaintext never leaves the browser', async () => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  // Watch what the browser actually sends.
  const bodies: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/vault/items') && request.method() === 'POST') {
      bodies.push(request.postData() ?? '');
    }
  });

  await page.getByRole('link', { name: 'Add secret' }).click();
  await page.getByLabel('Name', { exact: true }).fill(`E2E secret ${RUN}`);
  await page.getByLabel('Username').fill('e2e-user');
  await page.getByLabel('Secret', { exact: true }).fill(SECRET);
  await page.getByRole('button', { name: 'Add to vault' }).click();

  await expect(page).toHaveURL(/\/vault\/[0-9a-f-]{36}/);

  // The request carried ciphertext, not the secret.
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.join('')).not.toContain(SECRET);
  expect(bodies.join('')).toContain('cipher');

  // Nothing is shown until it is asked for.
  await expect(page.getByText('••••••••••••••••')).toBeVisible();
  await page.getByRole('button', { name: 'Reveal' }).click();

  // Revealed, but still blurred until explicitly shown.
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByText(SECRET)).toBeVisible();

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SECRET);
  await expect(page.getByRole('button', { name: /Copied — clears in/ })).toBeVisible();

  // "Clear from screen" puts it back behind the reveal.
  await page.getByRole('button', { name: 'Clear from screen' }).click();
  await expect(page.getByText('••••••••••••••••')).toBeVisible();
});

test('the list carries no ciphertext and no masked placeholder', async () => {
  const responses: string[] = [];
  page.on('response', async (response) => {
    if (response.url().includes('/api/vault/items')) {
      responses.push(await response.text().catch(() => ''));
    }
  });

  await navigateTo('/vault');
  await expect(page.getByText(`E2E secret ${RUN}`)).toBeVisible();

  const body = responses.join('');
  expect(body).not.toContain(SECRET);
  expect(body).not.toContain('cipher');
  // The UI says so plainly rather than showing dots that imply a value.
  await expect(page.getByText('not loaded').first()).toBeVisible();
});

test('the generator reports real entropy and fills the field', async () => {
  await page.getByRole('link', { name: 'Add secret' }).click();

  await expect(page.getByText('Generate')).toBeVisible();
  await expect(page.getByText(/bits of entropy/)).toBeVisible();
  await expect(
    page.getByText('Overkill, in a good way').or(page.getByText('Strong')),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Pronounceable' }).click();
  await expect(page.getByText(/bits of entropy/)).toBeVisible();

  await page.getByRole('button', { name: 'Random' }).click();
  await page.getByRole('button', { name: 'Use this' }).click();
  await expect(page.getByLabel('Secret', { exact: true })).not.toHaveValue('');
});

test('an otpauth URI is reduced to its secret, and the code ticks', async () => {
  await page.getByLabel('Type').selectOption('TOTP');
  await page
    .getByLabel('TOTP secret')
    .fill('otpauth://totp/Example:you@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example');
  // Pasting the whole QR-code URI is the natural gesture; only the secret is kept.
  await expect(page.getByLabel('TOTP secret')).toHaveValue('JBSWY3DPEHPK3PXP');

  await page.getByLabel('Name', { exact: true }).fill(`E2E TOTP ${RUN}`);
  await page.getByRole('button', { name: 'Add to vault' }).click();
  await expect(page).toHaveURL(/\/vault\/[0-9a-f-]{36}/);

  await page.getByRole('button', { name: 'Show code' }).click();
  // A real six-digit code with a live countdown, not a placeholder.
  await expect(page.getByText(/^\d{3} \d{3}$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^\d{1,2}s$/)).toBeVisible();
});

test('unlocks and reveals are recorded, values are not', async () => {
  await navigateTo('/vault');
  await openItem(`E2E secret ${RUN}`);

  await page.getByRole('button', { name: 'Reveal' }).click();
  await expect(page.getByRole('button', { name: 'Show', exact: true })).toBeVisible();

  await navigateTo('/settings/security');
  await expect(page.getByText('Audit log')).toBeVisible();
  await expect(page.getByText('Vault unlocked').first()).toBeVisible();
  await expect(page.getByText('Secret viewed').first()).toBeVisible();

  const text = (await page.locator('main').textContent()) ?? '';
  expect(text).not.toContain(SECRET);
});

test('secrets can be deleted, with the consequence spelled out', async () => {
  await navigateTo('/vault');

  await openItem(`E2E secret ${RUN}`);

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('unrecoverable');
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL('/vault');

  await openItem(`E2E TOTP ${RUN}`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL('/vault');
});

/** Last, because each one spends an unlock attempt against the rate limit. */
test('locking is immediate, and the chrome says so', async () => {
  await navigateTo('/vault');
  await expect(page.getByRole('button', { name: /Vault unlocked/ })).toBeVisible();

  await lockNow().click();
  await expect(page.getByRole('button', { name: 'Unlock vault' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vault is locked' })).toBeVisible();
});

test('a wrong master password does not open it', async () => {
  await page.getByLabel('Master password').fill('definitely not the master password');
  await page.getByRole('button', { name: 'Unlock vault' }).click();
  await expect(page.getByRole('alert', { name: 'Error' })).toContainText(
    /not correct|Too many attempts/,
    { timeout: 40_000 },
  );
});

test('reloading locks the vault, because the key is never persisted', async () => {
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unlock vault' })).toBeVisible({ timeout: 20_000 });
});
