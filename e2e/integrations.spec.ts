import { expect, test } from '@playwright/test';

/**
 * Phase 8 — connections to the outside world.
 *
 * These reach the real GitHub API, deliberately: a token check that is mocked
 * proves only that the mock works. The cost is that this file needs the
 * network, and will fail when GitHub is unreachable.
 *
 * The property under test is restraint. This screen must never claim a
 * connection it does not have: a provider is listed only when a client exists,
 * and a token is checked with the provider before anything is stored. A
 * rejected token has to leave the account exactly as it found it.
 */
test.describe('integrations', () => {
  test('lists only providers this build can actually talk to', async ({ page }) => {
    await page.goto('/settings/integrations');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Integrations');
    for (const provider of ['GitHub', 'GitLab', 'Cloudflare']) {
      await expect(page.getByText(provider, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('not connected').first()).toBeVisible();

    // Optionality is stated, not implied by an absence of nagging.
    await expect(page.getByText(/can stay disconnected/)).toBeVisible();
  });

  test('a token is verified with the provider before it is stored', async ({ page }) => {
    await page.goto('/settings/integrations');

    // Each provider is its own region, so "Connect" is never ambiguous.
    const github = page.getByRole('region', { name: 'GitHub' });
    await github.getByRole('button', { name: 'Connect' }).click();
    await expect(github.getByLabel('Access token')).toBeVisible();
    // The scope needed is stated before the token is pasted, not after.
    await expect(github.getByText(/read-only "Metadata" access/)).toBeVisible();

    await github.getByLabel('Access token').fill('ghp_this_token_is_not_real_at_all');
    await github.getByRole('button', { name: 'Connect', exact: true }).click();

    // GitHub itself refuses it. Which refusal it gives depends on GitHub —
    // 401 for a bad credential, 403 once you have asked too often — so the
    // assertion is that it was refused and said so, not which sentence came
    // back. The claim that matters is the next one: nothing was stored.
    await expect(page.getByRole('alert', { name: 'Error' })).toContainText(
      /rejected that token|GitHub returned/,
      { timeout: 25_000 },
    );

    // Nothing was written: the card still offers to connect.
    await page.reload();
    await expect(page.getByText('not connected').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  });

  test('the token field never gives the value back', async ({ page }) => {
    await page.goto('/settings/integrations');
    const github = page.getByRole('region', { name: 'GitHub' });
    await github.getByRole('button', { name: 'Connect' }).click();

    const field = github.getByLabel('Access token');
    // A password input, so a shoulder or a screen share sees nothing.
    await expect(field).toHaveAttribute('type', 'password');
    await expect(field).toHaveAttribute('autocomplete', 'off');
  });

  test('the risk of a stored token is spelled out, not buried', async ({ page }) => {
    await page.goto('/settings/integrations');

    // Integration tokens are weaker than vault items and the page says so.
    await expect(page.getByText(/the server can decrypt them/)).toBeVisible();
    await expect(page.getByText(/narrowest scope that works/)).toBeVisible();
  });
});
