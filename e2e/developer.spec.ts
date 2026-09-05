import { expect, test, type Page } from '@playwright/test';

/** Phase 3 — the developer system, and the loop that makes it worth having. */
const RUN = Date.now().toString(36);

async function deleteCurrent(page: Page): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
}

test.describe('the troubleshooting loop', () => {
  // A distinctive error string so the matcher has something unambiguous to
  // work with, and so the test cannot be satisfied by seeded data.
  const TOKEN = `qux${RUN}`;
  const ERROR = `FATAL: ${TOKEN} handshake rejected by upstream`;

  test('record a solution, then find it again from a pasted error', async ({ page }) => {
    await page.goto('/solutions/new');
    await page.getByLabel('Title').fill(`Handshake rejected ${TOKEN}`);
    await page
      .getByLabel('Problem')
      .fill('The upstream refused every connection after a redeploy.');
    await page.getByLabel('Error message').fill(ERROR);
    await page.getByLabel('Environment').fill('Docker · nginx');
    await page.getByLabel('Root cause').fill('Stale upstream certificate pinned in the sidecar.');
    await page.getByLabel('The fix').fill('Re-issue the certificate and restart the sidecar.');
    await page.getByLabel('Commands').fill('docker compose restart sidecar');
    await page.getByRole('button', { name: 'Record solution' }).click();

    await expect(page).toHaveURL(/\/solutions\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(TOKEN);
    // Commands are copyable, one per row.
    await expect(page.getByText('docker compose restart sidecar')).toBeVisible();

    // The whole point: paste the error, get the fix back.
    await page.goto('/solutions');
    await page.getByLabel('Paste an error message').fill(ERROR);
    await page.getByRole('button', { name: 'Search my solutions' }).click();
    await expect(page.getByText(`Handshake rejected ${TOKEN}`)).toBeVisible({ timeout: 10_000 });
  });

  test('an issue suggests the matching solution and resolving links them', async ({ page }) => {
    await page.goto('/issues/new');
    await page.getByLabel('Title').fill(`Upstream refusing connections ${TOKEN}`);
    await page.getByLabel('Error message').fill(ERROR);
    await page.getByRole('button', { name: 'Log issue' }).click();
    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]{36}/);

    // The suggestion comes from the solution written in the previous test.
    const context = page.getByRole('complementary', { name: 'Context' });
    await expect(context).toContainText('Have you seen this before?');
    await expect(context).toContainText(`Handshake rejected ${TOKEN}`);

    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('Link an existing solution')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve and record' }).click();

    await expect(page.getByText('Resolved')).toBeVisible();
    await expect(page.getByRole('link', { name: `Handshake rejected ${TOKEN}` })).toBeVisible();

    await deleteCurrent(page);
    await expect(page).toHaveURL('/issues');
  });

  test('an issue with no match offers to write the fix instead', async ({ page }) => {
    await page.goto('/issues/new');
    await page.getByLabel('Title').fill(`Novel failure ${RUN}`);
    await page.getByLabel('Error message').fill('zzyzx unprecedented condition');
    await page.getByRole('button', { name: 'Log issue' }).click();
    await expect(page).toHaveURL(/\/issues\/[0-9a-f-]{36}/);

    await page.getByRole('button', { name: 'Resolve' }).click();
    // Either path is always available; this one writes the fix from scratch.
    await page.getByRole('button', { name: 'Write the fix now' }).click();
    await expect(page.getByRole('textbox', { name: 'The fix' })).toBeVisible();

    await page
      .getByRole('textbox', { name: 'The fix' })
      .fill('Restarted it. Nobody knows why that worked.');
    await page.getByRole('button', { name: 'Resolve and record' }).click();
    await expect(page.getByText('Resolved')).toBeVisible();

    await deleteCurrent(page);
  });
});

test.describe('commands', () => {
  test('a destructive command is flagged and confirms before copying', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/commands/new');
    await page.getByLabel('Title').fill(`Wipe everything ${RUN}`);
    await page.getByLabel('Command').fill('rm -rf /var/lib/devos-test');

    // The warning appears while typing, before anything is saved.
    await expect(page.getByText(/will be saved as DESTRUCTIVE/)).toBeVisible();

    await page.getByRole('button', { name: 'Save command' }).click();
    await expect(page).toHaveURL(/\/commands\/[0-9a-f-]{36}/);
    await expect(page.getByText('DESTRUCTIVE').first()).toBeVisible();

    await page.getByRole('button', { name: 'Copy' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('rm -rf /var/lib/devos-test');
    await expect(dialog).toContainText('nothing is executed here');

    await dialog.getByRole('button', { name: 'Copy to clipboard' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'rm -rf /var/lib/devos-test',
    );

    await deleteCurrent(page);
  });

  test('a harmless command copies without a prompt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/commands/new');
    await page.getByLabel('Title').fill(`List files ${RUN}`);
    await page.getByLabel('Command').fill('ls -la');
    await page.getByRole('button', { name: 'Save command' }).click();
    await expect(page).toHaveURL(/\/commands\/[0-9a-f-]{36}/);

    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

    await deleteCurrent(page);
  });
});

test.describe('snippets', () => {
  test('save code and read it back highlighted', async ({ page }) => {
    await page.goto('/snippets/new');
    await page.getByLabel('Title').fill(`Chunked iterator ${RUN}`);
    await page.getByLabel('Language').selectOption('python');
    await page.getByLabel('Code').fill('def chunked(rows, size):\n    yield rows[:size]');
    // The preview renders as you type.
    await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible();

    await page.getByRole('button', { name: 'Save snippet' }).click();
    await expect(page).toHaveURL(/\/snippets\/[0-9a-f-]{36}/);
    await expect(page.locator('pre code')).toContainText('def chunked');
    // Highlighting is applied, not just monospace text.
    await expect(page.locator('pre code .hljs-keyword').first()).toBeVisible();

    await deleteCurrent(page);
  });
});

test.describe('decision records', () => {
  test('numbers are assigned automatically and never reused', async ({ page }) => {
    await page.goto('/adrs/new');
    await page.getByLabel('Title').fill(`Use a monorepo ${RUN}`);
    await page
      .getByRole('textbox', { name: 'Context' })
      .fill('Two repositories kept drifting apart.');
    await page
      .getByRole('textbox', { name: 'Decision' })
      .fill('Keep the API and the web app in one repository.');
    await page.getByRole('button', { name: 'Record decision' }).click();

    await expect(page).toHaveURL(/\/adrs\/[0-9a-f-]{36}/);
    const first = await page
      .locator('header')
      .getByText(/^ADR-\d{3}$/)
      .textContent();
    expect(first).toMatch(/^ADR-\d{3}$/);

    await deleteCurrent(page);
    await expect(page).toHaveURL('/adrs');

    // The next record takes the next number, not the freed one.
    await page.goto('/adrs/new');
    await page.getByLabel('Title').fill(`Second decision ${RUN}`);
    await page.getByRole('textbox', { name: 'Context' }).fill('Follow-up.');
    await page.getByRole('textbox', { name: 'Decision' }).fill('Something else.');
    await page.getByRole('button', { name: 'Record decision' }).click();

    const second = await page
      .locator('header')
      .getByText(/^ADR-\d{3}$/)
      .textContent();
    expect(Number(second?.slice(4))).toBeGreaterThan(Number(first?.slice(4)));

    await deleteCurrent(page);
  });
});

test.describe('meetings', () => {
  test('action items become real tasks that outlive the meeting', async ({ page }) => {
    const item = `Ship the thing ${RUN}`;

    await page.goto('/meetings/new');
    await page.getByLabel('Title').fill(`Planning ${RUN}`);
    await page.getByLabel('Participants').fill('You, Someone else');
    await page.getByLabel('Action items').fill(item);
    await page.getByRole('button', { name: 'Record meeting' }).click();

    await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}/);
    await expect(page.getByText(item)).toBeVisible();

    // It is a task, not a bullet in some notes.
    await page.goto(`/tasks?q=${encodeURIComponent(`Ship the thing ${RUN}`)}`);
    await expect(page.getByText(item)).toBeVisible();

    await page.goBack();
    await deleteCurrent(page);
    await expect(page).toHaveURL('/meetings');

    // Deleting the meeting must not delete the work that came out of it.
    await page.goto(`/tasks?q=${encodeURIComponent(`Ship the thing ${RUN}`)}`);
    await expect(page.getByText(item)).toBeVisible();
  });
});

test.describe('lightweight modules', () => {
  test('bookmarks guess their category from the URL', async ({ page }) => {
    await page.goto('/bookmarks/new');
    await page.getByLabel('URL').fill('https://owasp.org/www-project-top-ten/');
    await expect(page.getByLabel('Category')).toHaveValue('SECURITY');

    await page.getByLabel('Title').fill(`OWASP Top Ten ${RUN}`);
    await page.getByRole('button', { name: 'Add bookmark' }).click();
    await expect(page).toHaveURL(/\/bookmarks\/[0-9a-f-]{36}/);
    await expect(page.getByRole('article').getByText('SECURITY', { exact: true })).toBeVisible();

    await deleteCurrent(page);
  });

  test('learning keeps progress and status in step', async ({ page }) => {
    await page.goto('/learning/new');
    await page.getByLabel('Title').fill(`Read something ${RUN}`);
    await page.getByLabel('Progress').fill('100');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page).toHaveURL(/\/learning\/[0-9a-f-]{36}/);
    // 100% must mean completed, whatever the status field said.
    await expect(page.getByRole('complementary', { name: 'Context' })).toContainText('Completed');

    await deleteCurrent(page);
  });

  test('ideas record what has not been committed to yet', async ({ page }) => {
    await page.goto('/ideas/new');
    await page.getByLabel('Title').fill(`Try something new ${RUN}`);
    await page.getByLabel('Category').fill('Infrastructure');
    await page.getByRole('button', { name: 'Capture idea' }).click();

    await expect(page).toHaveURL(/\/ideas\/[0-9a-f-]{36}/);
    await expect(page.getByRole('article').getByText('Infrastructure')).toBeVisible();

    await deleteCurrent(page);
  });
});
