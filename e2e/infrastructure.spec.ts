import { expect, test, type Page } from '@playwright/test';
import { inDays } from './dates';

/** Phase 4 — infrastructure, and the relationships that make it navigable. */
const RUN = Date.now().toString(36);

async function deleteCurrent(page: Page): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
}

test.describe('environments and configuration', () => {
  test('a variable is a literal or a vault reference, never both', async ({ page }) => {
    await page.goto('/environments/new');
    await page.getByLabel('Name', { exact: true }).fill(`E2E env ${RUN}`);
    await page.getByLabel('Type').selectOption('STAGING');
    await page.getByRole('button', { name: 'Create environment' }).click();
    await expect(page).toHaveURL(/\/environments\/[0-9a-f-]{36}/);

    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Key').fill('log_level');
    // Keys are upper-cased as you type — a .env key is conventionally shouted.
    await expect(page.getByLabel('Key')).toHaveValue('LOG_LEVEL');
    await page.getByLabel('Value', { exact: true }).fill('debug');
    await page.getByRole('button', { name: 'Set variable' }).click();

    await expect(page.getByText('LOG_LEVEL')).toBeVisible();
    await expect(page.getByText('debug')).toBeVisible();

    // Switching to the vault path offers a reference, not a value field.
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Vault reference' }).click();
    await expect(page.getByLabel('Value', { exact: true })).toBeHidden();
    // A picker of vault items, or an explanation if the vault is not built yet.
    await expect(
      page.getByLabel('Vault item').or(page.getByText(/vault arrives in phase 5/)),
    ).toBeVisible();
  });

  test('the .env template is downloadable and names no secrets', async ({ page, request }) => {
    await page.goto('/environments');
    // Filter first: a list accumulates, and after a few dozen rows the one
    // this run created is on page two. Clicking whatever is visible is a test
    // that passes for the wrong reason.
    await page
      .getByRole('textbox', { name: /Filter|Search/ })
      .first()
      .fill(`E2E env ${RUN}`);
    await page
      .locator('a[href^="/environments/"]')
      .filter({ hasText: `E2E env ${RUN}` })
      .click();
    await expect(page).toHaveURL(/\/environments\/[0-9a-f-]{36}/);

    const id = page.url().split('/').pop();
    const response = await request.get(`/api/environments/${id}/template`);
    expect(response.ok()).toBeTruthy();

    const body = await response.text();
    expect(body).toContain('LOG_LEVEL=debug');
    expect(body).toContain('Secrets are shown as vault references');

    await deleteCurrent(page);
    await expect(page).toHaveURL('/environments');
  });
});

test.describe('servers', () => {
  test('record a server, read its specs and copy the ssh line', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/servers/new');
    await page.getByLabel('Name', { exact: true }).fill(`E2E host ${RUN}`);
    await page.getByLabel('Provider').selectOption('HETZNER');
    await page.getByLabel('Hostname').fill('e2e-host');
    await page.getByLabel('CPU cores').fill('4');
    await page.getByLabel('Memory in GB').fill('8');
    await page.getByLabel('Disk in GB').fill('160');
    await page.getByLabel('SSH user').fill('deploy');
    await page.getByLabel('SSH port').fill('2222');
    await page.getByLabel('Services').fill('Docker, Nginx');
    await page.getByRole('button', { name: 'Add server' }).click();

    await expect(page).toHaveURL(/\/servers\/[0-9a-f-]{36}/);
    await expect(page.getByText('4 cores')).toBeVisible();
    await expect(page.getByText('8 GB')).toBeVisible();
    await expect(page.getByText('Docker')).toBeVisible();

    // The non-standard port must appear in the command, or the line is wrong.
    await expect(page.getByText('ssh -p 2222 deploy@e2e-host')).toBeVisible();
    // And it is text to copy, never something this app runs.
    await expect(page.getByText(/never opens a connection/)).toBeVisible();

    await deleteCurrent(page);
    await expect(page).toHaveURL('/servers');
  });

  test('there is no password field anywhere on the server form', async ({ page }) => {
    await page.goto('/servers/new');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/No password or private key is ever stored here/)).toBeVisible();
  });
});

test.describe('databases', () => {
  test('the connection hint masks the password', async ({ page }) => {
    await page.goto('/databases/new');
    await page.getByLabel('Name', { exact: true }).fill(`E2E db ${RUN}`);
    await page.getByLabel('Engine').selectOption('POSTGRESQL');
    // Choosing an engine fills the port in.
    await expect(page.getByLabel('Port')).toHaveValue('5432');

    await page.getByLabel('Host').fill('db.internal');
    await page.getByLabel('Database name').fill('appdb');
    await page.getByLabel('Username').fill('app');
    await page.getByRole('button', { name: 'Add database' }).click();

    await expect(page).toHaveURL(/\/databases\/[0-9a-f-]{36}/);
    await expect(
      page.getByText('postgresql://app:<password>@db.internal:5432/appdb'),
    ).toBeVisible();
    await expect(page.getByText(/leaves the password as/)).toBeVisible();

    await deleteCurrent(page);
  });

  test('the backup state is spelled out rather than left blank', async ({ page }) => {
    await page.goto('/databases/new');
    await page.getByLabel('Name', { exact: true }).fill(`E2E backup ${RUN}`);
    await page.getByRole('button', { name: 'Add database' }).click();
    await expect(page).toHaveURL(/\/databases\/[0-9a-f-]{36}/);

    await expect(page.getByText('No schedule')).toBeVisible();
    await page.getByRole('button', { name: 'Backed up' }).click();
    // With no schedule the state stays "none" — recording a backup does not
    // invent a schedule that was never set.
    await expect(page.getByRole('complementary', { name: 'Context' })).toContainText('Never');

    await deleteCurrent(page);
  });
});

test.describe('expiry', () => {
  test('a certificate expiring this week reads as critical', async ({ page }) => {
    const soon = inDays(3);

    await page.goto('/certificates/new');
    await page.getByLabel('Common name').fill(`e2e-${RUN}.example.com`);
    await page.getByLabel('Issuer').fill('E2E CA');
    await page.getByLabel('Expires').fill(soon);
    await page.getByRole('button', { name: 'Add certificate' }).click();

    await expect(page).toHaveURL(/\/certificates\/[0-9a-f-]{36}/);
    await expect(page.getByText('CRITICAL')).toBeVisible();
    await expect(page.getByText(/Expires in 3 days/)).toBeVisible();

    // The list leads with what breaks next.
    await page.goto('/certificates');
    await expect(page.getByText(`e2e-${RUN}.example.com`).first()).toBeVisible();
    await expect(page.getByText(/expiring within a week, or already expired/)).toBeVisible();

    await page.getByText(`e2e-${RUN}.example.com`).first().click();
    await deleteCurrent(page);
  });

  test('a domain records its expiry and renewal state', async ({ page }) => {
    await page.goto('/domains/new');
    // A pasted URL is trimmed to a hostname on blur.
    await page.getByLabel('Domain').fill(`https://e2e-${RUN}.example.com/some/path`);
    await page.getByLabel('Registrar').click();
    await expect(page.getByLabel('Domain')).toHaveValue(`e2e-${RUN}.example.com`);

    await page.getByLabel('Registrar').fill('E2E Registrar');
    await page.getByLabel('Expires').fill(inDays(200));
    await page.getByRole('button', { name: 'Add domain' }).click();

    await expect(page).toHaveURL(/\/domains\/[0-9a-f-]{36}/);
    await expect(page.getByText('VALID')).toBeVisible();
    await expect(page.getByText('manual renewal')).toBeVisible();

    await deleteCurrent(page);
  });
});

test.describe('deployments', () => {
  test('an in-progress deployment can be closed out from its page', async ({ page }) => {
    await page.goto('/deployments/new');
    await page.getByLabel('Version').fill(`v0.0.${RUN}`);
    await page.getByLabel('Commit').fill('abc1234');
    await page.getByLabel('Status').selectOption('IN_PROGRESS');
    await page.getByRole('button', { name: 'Record deployment' }).click();

    await expect(page).toHaveURL(/\/deployments\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: 'Succeeded' })).toBeVisible();

    await page.getByRole('button', { name: 'Succeeded' }).click();
    await expect(page.getByText('Success').first()).toBeVisible();
    // Finishing computes the duration rather than asking for it.
    await expect(page.getByRole('complementary', { name: 'Context' })).toContainText('Success');

    await deleteCurrent(page);
    await expect(page).toHaveURL('/deployments');
  });

  test('the timeline summarises the release history', async ({ page }) => {
    await page.goto('/deployments/new');
    await page.getByLabel('Version').fill(`v9.9.${RUN}`);
    await page.getByRole('button', { name: 'Record deployment' }).click();
    await expect(page).toHaveURL(/\/deployments\/[0-9a-f-]{36}/);

    await page.goto('/deployments');
    await expect(page.getByText('Success rate')).toBeVisible();
    await expect(page.getByText('Releases')).toBeVisible();

    await page.getByRole('button', { name: 'List' }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByText(`v9.9.${RUN}`).first()).toBeVisible();

    await page.getByText(`v9.9.${RUN}`).first().click();
    await deleteCurrent(page);
  });
});

test.describe('the project graph', () => {
  test('draws the seeded project and its relationships', async ({ page }) => {
    // Uses whichever project has the most connected records.
    await page.goto('/projects/new');
    await page.getByLabel('Name', { exact: true }).fill(`E2E graph ${RUN}`);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/projects\/e2e-graph-/);
    await expect(page.getByText('Relationships')).toBeVisible();

    const graph = page.getByRole('img', { name: 'Project relationship graph' });
    // A project with nothing connected shows an explanation instead — both are
    // correct, so accept either rather than depending on seed data.
    // A project with nothing attached explains itself instead of drawing an
    // empty canvas — that is the correct behaviour, not a missing feature.
    await expect(page.getByText(/Connect a repository, server or environment/)).toBeVisible();
    expect(await graph.count()).toBe(0);

    // Attach an environment and the graph appears.
    await page.goto('/environments/new');
    await page.getByLabel('Name', { exact: true }).fill(`E2E graph env ${RUN}`);
    await page.getByLabel('Project').selectOption({ label: `E2E graph ${RUN}` });
    await page.getByRole('button', { name: 'Create environment' }).click();
    await expect(page).toHaveURL(/\/environments\/[0-9a-f-]{36}/);

    await page.goto(`/projects/e2e-graph-${RUN.toLowerCase()}`);
    await expect(page.getByRole('img', { name: 'Project relationship graph' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
  });
});
