import { expect, request, test as setup } from '@playwright/test';
import { EMAIL, PASSWORD, STATE_FILE } from './credentials';

/**
 * Signs in once for the whole run and saves the cookies.
 *
 * Every test re-authenticating through the form would be both slow and wrong:
 * the login endpoint is rate limited to five attempts a minute, so a suite that
 * signs in a dozen times ends up testing the throttle rather than the feature.
 */
setup('authenticate', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });

  const response = await api.post('/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });

  if (!response.ok()) {
    // Only a rejected credential means the account is missing. Treating every
    // failure as "register it then" turns a rate limit into "could not create
    // the test account", which sends you looking in entirely the wrong place.
    expect(
      response.status(),
      response.status() === 429
        ? 'the login endpoint is rate limited — five attempts a minute. Wait a minute and run again.'
        : `sign-in failed unexpectedly: ${await response.text()}`,
    ).toBe(401);

    const created = await api.post('/api/auth/register', {
      data: { email: EMAIL, name: 'E2E', password: PASSWORD },
    });
    expect(created.ok(), `could not create the test account: ${await created.text()}`).toBeTruthy();
  }

  await api.storageState({ path: STATE_FILE });
  await api.dispose();
});
