import { expect, test, type Page } from '@playwright/test';

// Signed in via the storageState saved by auth.setup.ts.

/**
 * Keyboard shortcuts are registered by a client effect, so pressing a key
 * straight after goto() races hydration. The status bar clock is rendered from
 * a mount effect, which makes it a reliable "the page is interactive" signal.
 */
async function ready(page: Page): Promise<void> {
  await expect(page.getByRole('contentinfo')).toContainText(/\d{2}:\d{2}/);
}

test.describe('dashboard', () => {
  test('answers what needs attention today', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good |Still up/);
    await expect(page.getByText('Needs attention')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('ready');
  });
});

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ready(page);
  });

  test('opens, filters and navigates', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();

    await page.keyboard.type('serv');
    await expect(palette.getByRole('button', { name: /Servers/ }).first()).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(/\/(servers|databases)/);
  });

  test('> narrows it to actions only', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await page.keyboard.type('>project');

    // Exact, because the palette footer also carries the hint "> actions".
    await expect(palette.getByText('Actions', { exact: true })).toBeVisible();
    await expect(palette.getByText('Go to', { exact: true })).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('says so plainly when nothing matches', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('zzzqqq');
    await expect(page.getByText('Nothing matches')).toBeVisible();
  });
});

test.describe('keyboard', () => {
  test('g-chords jump between modules', async ({ page }) => {
    await page.goto('/');
    await ready(page);

    await page.keyboard.press('g');
    await page.keyboard.press('s');
    await expect(page).toHaveURL('/servers');

    await page.keyboard.press('g');
    await page.keyboard.press('p');
    await expect(page).toHaveURL('/projects');

    // The vault goes last: its unlock field takes focus on arrival, and bare
    // keys are deliberately ignored while typing — so no further chord fires.
    await page.keyboard.press('g');
    await page.keyboard.press('v');
    await expect(page).toHaveURL('/vault');
  });

  test('? lists the shortcuts', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
  });
});

test.describe('shell', () => {
  test('the navigation rail collapses and the choice survives a reload', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: 'Primary' });
    const expanded = (await rail.boundingBox())?.width ?? 0;
    expect(expanded).toBeGreaterThan(100);

    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect.poll(async () => (await rail.boundingBox())?.width).toBeLessThan(expanded);

    await page.reload();
    await expect.poll(async () => (await rail.boundingBox())?.width).toBeLessThan(expanded);

    await page.getByRole('button', { name: 'Expand navigation' }).click();
  });

  test('the theme choice persists across a reload', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('html');
    await page.getByRole('button', { name: /^Theme:/ }).click();
    const chosen = await root.getAttribute('data-theme');

    await page.reload();
    await expect(root).toHaveAttribute('data-theme', chosen ?? 'dark');
  });

  test('every module in the navigation resolves to a real page', async ({ page }) => {
    // The information architecture is the product; a dead link in it is a bug.
    for (const href of [
      '/projects',
      '/servers',
      '/vault',
      '/solutions',
      '/activity',
      '/settings',
    ]) {
      await page.goto(href);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('diagnostics reports subsystem state honestly', async ({ page }) => {
    await page.goto('/settings/diagnostics');
    // Scoped to the table: the status bar reports the same subsystems, which is
    // the point of it, and the note underneath explains the same words again.
    const table = page.getByRole('region', { name: 'Subsystems' });
    await expect(table.getByText('database', { exact: true })).toBeVisible();
    // Every subsystem reports what it actually found. `embeddings` says which
    // kind of matching is loaded, because "lexical" and "semantic" are not the
    // same product and a screen that hid the difference would be flattering.
    await expect(table.getByText('redis', { exact: true })).toBeVisible();
    await expect(table.getByText('embeddings', { exact: true })).toBeVisible();
    await expect(table.getByText('lexical', { exact: true })).toBeVisible();
  });
});

test.describe('security', () => {
  test('auth tokens are not reachable from JavaScript', async ({ page }) => {
    await page.goto('/');
    const cookies = await page.evaluate(() => document.cookie);
    expect(cookies).not.toContain('devos_at');
    expect(cookies).not.toContain('devos_rt');
    // Only the non-secret session marker the middleware reads is visible.
    expect(cookies).toContain('devos_session');
  });

  test('signing out ends the session', async ({ page }) => {
    await page.goto('/');
    await page.getByTitle(/Signed in as|Sign out/).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
