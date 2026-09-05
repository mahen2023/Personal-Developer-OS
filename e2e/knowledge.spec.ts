import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 — the core knowledge loop.
 *
 * Each spec creates what it needs with a unique suffix and cleans up after
 * itself, so the suite can run repeatedly against a real instance without
 * accumulating rubbish or depending on the demo seed.
 */
const RUN = Date.now().toString(36);

/**
 * Deletes the record on screen.
 *
 * By accessible name, never by position: "the last button in a header" also
 * matches the sign-out button in the top bar whenever the detail header has
 * not rendered yet. Clicking that revokes the session, and every test after it
 * fails somewhere unrelated — which is a long way to walk back from a race.
 */
async function deleteCurrent(page: Page, confirmText: RegExp): Promise<void> {
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toMatch(confirmText);
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
}

test.describe('projects', () => {
  test('create, open the workspace, and delete', async ({ page }) => {
    const name = `E2E Project ${RUN}`;

    await page.goto('/projects/new');
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Description').fill('Created by the end-to-end suite.');
    await page.getByLabel('Tech stack').fill('TypeScript, Postgres');
    await page.getByRole('button', { name: 'Create project' }).click();

    await expect(page).toHaveURL(/\/projects\/e2e-project-/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);

    // The workspace tabs are the point of the screen.
    for (const tab of ['Work', 'Code', 'Infrastructure', 'Knowledge', 'Overview']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
    }
    await expect(page.getByText('Project health')).toBeVisible();

    // The context panel lists what the project connects to.
    await expect(page.getByRole('complementary', { name: 'Context' })).toContainText('Connected');

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('connected records are kept');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL('/projects');
  });

  test('the status filter lives in the URL and survives a reload', async ({ page }) => {
    await page.goto('/projects');
    await page.getByLabel('Status').selectOption('ACTIVE');
    await expect(page).toHaveURL(/status=ACTIVE/);

    await page.reload();
    await expect(page.getByLabel('Status')).toHaveValue('ACTIVE');
  });
});

test.describe('notes', () => {
  test('write markdown, read it back rendered, then delete', async ({ page }) => {
    const title = `E2E Note ${RUN}`;

    await page.goto('/notes/new');
    await page.getByLabel('Title').fill(title);
    await page.getByRole('textbox', { name: 'Tags' }).fill('e2e');
    await page.keyboard.press('Enter');
    await page
      .getByLabel('Content')
      .fill('## Heading\n\n- [x] a task list item\n\n```bash\necho hello\n```');

    await page.getByRole('button', { name: 'Create note' }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}/);

    // Markdown is rendered, not shown as source.
    await expect(page.getByRole('heading', { name: 'Heading' })).toBeVisible();
    await expect(page.locator('pre code')).toContainText('echo hello');
    await expect(page.locator('input[type="checkbox"]')).toBeChecked();

    // Editing happens in place, not on a separate route.
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);

    await deleteCurrent(page, /Delete/);
    await expect(page).toHaveURL('/notes');
  });

  test('the preview in the list is plain text, not markdown source', async ({ page }) => {
    await page.goto('/notes');
    const rows = page.locator('a[href^="/notes/"]');
    if ((await rows.count()) > 0) {
      await expect(rows.first()).not.toContainText('```');
      await expect(rows.first()).not.toContainText('##');
    }
  });
});

test.describe('tasks', () => {
  test('all three views render the same work', async ({ page }) => {
    const title = `E2E Task ${RUN}`;

    await page.goto('/tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Priority').selectOption('HIGH');
    await page.getByLabel('Due date').fill('2027-01-15');
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/);

    await page.goto('/tasks');
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole('button', { name: 'Board' }).click();
    await expect(page).toHaveURL(/view=board/);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText('In progress')).toBeVisible();

    await page.getByRole('button', { name: 'Timeline' }).click();
    await expect(page).toHaveURL(/view=timeline/);
    await expect(page.getByText(title)).toBeVisible();

    await page.getByText(title).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);

    // Clean up, so repeated runs do not fill page one of the list.
    await deleteCurrent(page, /Delete/);
    await expect(page).toHaveURL('/tasks');
  });

  test('marking done sets the completion stamp and reopening clears it', async ({ page }) => {
    const title = `E2E Done ${RUN}`;

    await page.goto('/tasks/new');
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/);

    await page.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByRole('complementary', { name: 'Context' })).toContainText('Completed');

    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible();

    await deleteCurrent(page, /Delete/);
    await expect(page).toHaveURL('/tasks');
  });
});

test.describe('search', () => {
  // A term that cannot collide with anything else in the instance. Search is
  // scoped per user, so these tests create their own corpus rather than
  // relying on the demo seed, which belongs to whoever ran it.
  const TERM = `zarquon${RUN}`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/notes/new');
    await page.getByLabel('Title').fill(`Searchable ${TERM}`);
    await page.getByLabel('Content').fill(`The body mentions ${TERM} once, in a sentence.`);
    await page.getByRole('button', { name: 'Create note' }).click();
    await page.waitForURL(/\/notes\/[0-9a-f-]{36}/);
    await page.close();
  });

  test('finds a record, groups it by type and highlights the match', async ({ page }) => {
    await page.goto(`/search?q=${TERM}`);

    await expect(page.getByText('Note', { exact: true })).toBeVisible();
    await expect(page.getByText(`Searchable ${TERM}`)).toBeVisible();
    await expect(page.locator('mark').first()).toContainText(TERM);
  });

  test('type chips narrow the results', async ({ page }) => {
    await page.goto(`/search?q=${TERM}`);
    await page.getByRole('button', { name: 'Task', exact: true }).click();

    await expect(page).toHaveURL(/types=TASK/);
    // The note no longer qualifies, so the empty state explains why.
    await expect(page.getByText('Nothing found')).toBeVisible();

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByText(`Searchable ${TERM}`)).toBeVisible();
  });

  test('the palette searches real records, not just navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toContainText(/\d{2}:\d{2}/);

    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type(TERM);

    const palette = page.getByRole('dialog', { name: 'Command palette' });
    // A note is not a navigation destination, so finding one proves the
    // server-side search is wired into the palette.
    await expect(palette.getByText(`Searchable ${TERM}`)).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}/);
  });
});

test.describe('documents', () => {
  test('upload, download and delete a file', async ({ page }) => {
    await page.goto('/documents');

    await page.setInputFiles('input[type="file"]', {
      name: `e2e-${RUN}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from('# End-to-end\n\nUploaded by the test suite.\n'),
    });

    const row = page.getByText(`e2e-${RUN}.md`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Downloads must be served as an attachment, never rendered inline.
    const download = page.waitForEvent('download');
    await page.locator('a[href*="/download"]').first().click();
    expect((await download).suggestedFilename()).toContain('.md');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.locator('button[title="Delete"]').first().click();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test('an unsupported file type is refused with a readable reason', async ({ page }) => {
    await page.goto('/documents');
    await page.setInputFiles('input[type="file"]', {
      name: 'payload.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });
    await expect(page.getByRole('alert', { name: 'Error' })).toContainText('not supported');
  });
});
