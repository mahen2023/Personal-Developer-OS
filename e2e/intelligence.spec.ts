import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 6 — the intelligence console.
 *
 * The claim this file checks is narrow and important: an answer is only ever
 * built from records that exist, and the console says where each one came
 * from. A confident answer with nothing behind it is the failure mode worth
 * testing for.
 */
const RUN = Date.now().toString(36);
const TERM = `zylkath${RUN}`;

/**
 * Deletes the record on screen.
 *
 * By accessible name, never by position: "the last button in a header" also
 * matches the sign-out button in the top bar whenever the detail header has
 * not rendered yet. Clicking that revokes the session, and every test after it
 * fails somewhere unrelated — which is a long way to walk back from a race.
 */
async function deleteCurrent(page: Page): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
}

async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel('Question').fill(question);
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByRole('region', { name: 'Answer' })).toBeVisible({ timeout: 20_000 });
}

test.describe('the console', () => {
  test('says what it can do before it is asked anything', async ({ page }) => {
    await page.goto('/intelligence');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Intelligence');
    await expect(page.getByText('Answered by a query')).toBeVisible();
    await expect(page.getByText('Answered from your writing')).toBeVisible();

    // The calibration strip is the honesty: which model, and whether it writes.
    await expect(page.getByText(/records indexed/)).toBeVisible();
    await expect(page.getByText(/matching (words|meaning)/)).toBeVisible();
  });

  test('answers a countable question from the database, not from prose', async ({ page }) => {
    await page.goto('/intelligence');
    await ask(page, 'how many issues are still open?');

    await expect(page.getByText('From your records')).toBeVisible();
    // A query answer cites nothing, because it is not quoting anything.
    await expect(page.getByText('Sources')).toBeHidden();
  });

  test('finds a note it has just indexed, and links back to it', async ({ page }) => {
    await page.goto('/notes/new');
    await page.getByLabel('Title').fill(`Console test note ${RUN}`);
    await page
      .getByLabel('Content')
      .fill(
        `The ${TERM} subsystem refuses to start when its socket path is longer than 100 characters. ` +
          `Shorten the path, or set ${TERM.toUpperCase()}_SOCKET to somewhere under /tmp.`,
      );
    await page.getByRole('button', { name: 'Create note' }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}/);
    const noteUrl = page.url();

    // Indexing happens on save, so the note is findable immediately.
    await page.goto('/intelligence');
    await ask(page, `why does ${TERM} refuse to start?`);

    await expect(page.getByText('From what you wrote')).toBeVisible();
    await expect(page.getByText('Sources')).toBeVisible();
    await expect(page.getByRole('link', { name: `Console test note ${RUN}` })).toBeVisible();
    // The passage is shown verbatim rather than summarised. Scoped to this
    // run's own source entry: a previous run's note is still a valid match.
    await expect(
      page.getByText(new RegExp(`${TERM} subsystem refuses to start when its socket path`)),
    ).toBeVisible();

    await page.getByRole('link', { name: `Console test note ${RUN}` }).click();
    await expect(page).toHaveURL(noteUrl);

    await deleteCurrent(page);
    await expect(page).toHaveURL('/notes');

    // Deleting the note deletes what it contributed to the index: the console
    // must not keep answering from a record that no longer exists.
    //
    // The assertion is that *this* note is gone, not that nothing is found —
    // another note may still be a weak match for "refuse to start", and
    // demanding an empty result would be testing the corpus, not the deletion.
    await page.goto('/intelligence');
    await ask(page, `why does ${TERM} refuse to start?`);
    // Scoped to the answer: the term is still in the query bar and in this
    // session's history, which is not the index answering — it is what I typed.
    const answer = page.getByRole('region', { name: 'Answer' });
    await expect(answer.getByRole('link', { name: `Console test note ${RUN}` })).toHaveCount(0);
    await expect(answer.getByText(new RegExp(TERM))).toHaveCount(0);
  });

  test('admits when it has nothing rather than inventing something', async ({ page }) => {
    await page.goto('/intelligence');
    await ask(page, 'what is the airspeed velocity of an unladen swallow');

    await expect(page.getByText('Nothing in your notes covers this')).toBeVisible();
    await expect(page.getByText('Sources')).toBeHidden();
  });

  test('the index panel reports what is in it and can rebuild', async ({ page }) => {
    await page.goto('/intelligence');

    const panel = page.getByRole('complementary', { name: 'Context' });
    // Wait for the real counts: until the status call lands the panel says it
    // is still reading, which is the point of the three-state rendering.
    // Types are labelled the same way as everywhere else in the app.
    await expect(panel.getByText('Note', { exact: true })).toBeVisible();
    await expect(panel.getByText('Solution', { exact: true })).toBeVisible();

    await panel.getByRole('button', { name: 'Rebuild index' }).click();
    await expect(panel.getByText(/last written/)).toBeVisible({ timeout: 30_000 });
  });
});
