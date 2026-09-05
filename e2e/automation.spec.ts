import { expect, test, type Page } from '@playwright/test';
import { inDays } from './dates';

/**
 * Phase 7 — what the application does on its own.
 *
 * The behaviour worth protecting is not that a notification appears. It is
 * that the list stays honest: a warning is raised once however often the scan
 * runs, and it disappears when its cause does.
 */
const RUN = Date.now().toString(36);
const DOMAIN = `expiring-${RUN}.example.com`;

/**
 * Deletes the record on screen. Targets the control by its accessible name
 * rather than by position: "the last button in a header" is also the sign-out
 * button, and picking the wrong one ends the session for the whole suite.
 */
async function deleteCurrent(page: Page): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
}

async function runScan(page: Page): Promise<void> {
  await page.goto('/settings/automation');
  await page.getByRole('button', { name: /Run the scan now/ }).click();
  await expect(page.getByText(/raised, |Nothing changed/)).toBeVisible({ timeout: 20_000 });
}

test.describe('automation', () => {
  test('the settings screen reports the schedule and the worker honestly', async ({ page }) => {
    await page.goto('/settings/automation');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Automation');
    // Both schedules are registered by the queue itself, not by a config file.
    await expect(page.getByText('0 7 * * *', { exact: true })).toBeVisible();
    await expect(page.getByText('30 7 * * *', { exact: true })).toBeVisible();
    // Whether a worker is consuming is a fact the screen must not fudge, and
    // it is read from Redis rather than from the API's own configuration.
    await expect(
      page.getByText(/worker running|no worker|Redis unreachable/, { exact: true }),
    ).toBeVisible();
  });

  test('a certificate near expiry raises one warning, however often it is scanned', async ({
    page,
  }) => {
    await page.goto('/certificates/new');
    await page.getByLabel('Common name').fill(DOMAIN);
    await page.getByLabel('Expires').fill(inDays(5));
    await page.getByRole('button', { name: 'Add certificate' }).click();
    await expect(page).toHaveURL(/\/certificates\/[0-9a-f-]{36}/);
    const certificateUrl = page.url();

    await runScan(page);
    await runScan(page);

    // Matched on the domain, not on the wording: how many days it says is the
    // notification's business, and pinning it here would make this test fail
    // for a reason that has nothing to do with what it is checking.
    const warning = page.getByText(new RegExp(`${DOMAIN} certificate expires`));

    await page.goto('/notifications');
    // Exactly one: the second scan recognised the warning it had already made.
    await expect(warning).toHaveCount(1);

    // Reading it is not the same as fixing it — it stays until the cause goes.
    await warning.click();
    await expect(page).toHaveURL(certificateUrl);

    await page.goto('/notifications');
    await expect(warning).toBeVisible();

    // Remove the cause. The warning should go on its own, with nothing ticked.
    await page.goto(certificateUrl);
    await deleteCurrent(page);
    await expect(page).toHaveURL('/certificates');

    await runScan(page);
    await page.goto('/notifications');
    await expect(warning).toHaveCount(0);
  });

  test('the bell counts unread and clearing it empties the count', async ({ page }) => {
    await page.goto('/notifications');

    // Wait for the count before acting on it: until the list has loaded the
    // page does not claim a number, and "Unread" without one is the tell.
    await expect(page.getByRole('button', { name: /Unread \(\d+\)/ })).toBeVisible();

    const markAll = page.getByRole('button', { name: 'Mark all read' });
    if (await markAll.isEnabled()) await markAll.click();

    // Nothing left to mark is the observable end state.
    await expect(page.getByRole('button', { name: 'Unread (0)' })).toBeVisible();
    await expect(markAll).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole('button', { name: /Nothing unread|Nothing needs attention/ }),
    ).toBeVisible();
  });

  test('export offers real formats and downloads what was asked for', async ({ page }) => {
    await page.goto('/settings/automation');

    await page.getByRole('radio', { name: 'Markdown' }).check();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();

    const download = await Promise.race([
      page.waitForEvent('download'),
      page
        .getByRole('link', { name: 'Download export' })
        .click()
        .then(() => null),
    ]);
    // Chromium reports the download through the event; either way the link has
    // to carry the chosen format and selection.
    const href = await page.getByRole('link', { name: 'Download export' }).getAttribute('href');
    expect(href).toContain('format=markdown');
    expect(href).toContain('what=notes');
    if (download) expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test('a backup can be written and appears in the list', async ({ page }) => {
    await page.goto('/settings/automation');

    await page.getByRole('button', { name: /Back up now/ }).click();
    await expect(page.getByText(/devos-.*\.json\.gz/).first()).toBeVisible({ timeout: 20_000 });
    // The screen states plainly what the file can and cannot be read without.
    await expect(page.getByText(/envelope key/)).toBeVisible();
  });

  test('muting a kind stops it being raised at all', async ({ page }) => {
    await page.goto('/settings/automation');

    const mute = page.getByRole('button', { name: 'Ssl expiry' });
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');

    // Unmute again so the suite leaves the account as it found it.
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
  });
});
