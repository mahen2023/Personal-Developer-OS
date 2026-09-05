# End-to-end tests

These drive a real browser against a running stack.

```bash
npm run infra:up          # postgres + redis
npm run db:migrate
npm run dev               # api on :4000, web on :3000
npx playwright install chromium   # once
npm run test:e2e
```

`E2E_EMAIL` / `E2E_PASSWORD` override the account used. If that account does not
exist yet the suite registers it, so a clean instance works without setup.
