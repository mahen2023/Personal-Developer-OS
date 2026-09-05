import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Runs the production build locally.
 *
 * `next start` does not work with `output: 'standalone'` — Next says so on
 * every boot — so this mirrors what the Dockerfile does: the standalone server
 * carries its own dependencies but not the static assets, which have to be
 * copied in beside it.
 *
 * Without this the app still appeared to serve, which is what made it easy to
 * miss: it just did so through the wrong entrypoint, and leaked memory doing it.
 */
const root = '.next/standalone/apps/web';

if (!existsSync(`${root}/server.js`)) {
  console.error('No standalone build found. Run `npm run build` first.');
  process.exit(1);
}

cpSync('.next/static', `${root}/.next/static`, { recursive: true });
if (existsSync('public')) cpSync('public', `${root}/public`, { recursive: true });

spawn(process.execPath, [`${root}/server.js`], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT ?? '3000' },
}).on('exit', (code) => process.exit(code ?? 0));
