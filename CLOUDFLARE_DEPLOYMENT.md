# CareerFinder AI: GitHub Actions → Cloudflare deployment

The workflow is in `.github/workflows/deploy-cloudflare.yml` on the `feature/secure-profile-d1` branch. It runs on pushes to `main` affecting backend files, and can also be started manually from GitHub Actions. **It does not deploy until merged into main.**

## One-time setup (do not share tokens in chat)

1. Cloudflare Dashboard → My Profile → API Tokens → Create Token. Use a narrowly scoped token with **Workers Scripts: Edit** and **D1: Edit** for the relevant account. Some Cloudflare deployments may also need Workers Routes: Edit if routes are configured.
2. Copy your Cloudflare **Account ID** from the Cloudflare dashboard.
3. GitHub → `Tovi-Donninger/careerfinder` → Settings → Secrets and variables → Actions → New repository secret. Create `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` separately. Do not commit either value.
4. GitHub → repository Settings → Secrets and variables → Actions: create a repository secret named `CAREERFINDER_LOGIN_PASSWORD` containing a unique strong password of at least 16 characters. The workflow hashes it using PBKDF2 with a fresh random salt and uploads only the hash to Cloudflare as `ADMIN_PASSWORD_HASH`. Never place the password in code, documentation or chat.
5. After review, merge `feature/secure-profile-d1` into `main`. Watch GitHub → Actions → Deploy CareerFinder Cloudflare Worker. The workflow applies the SQL migration, provisions the login hash and deploys the Worker.
6. Verify the Worker is healthy and private login works before putting any personal information into the website.

## Important safeguards
- The SQL migration is idempotent (`CREATE TABLE IF NOT EXISTS`), so running it repeatedly is safe for this initial version.
- Existing public search routes remain in the Worker.
- Never add a real CV, street address, passwords or token to GitHub files.
- The current GitHub Pages frontend has no server-side authentication barrier; protect private API data on the Worker side.
- For later schema changes, add versioned migrations instead of editing migration 0001.
- This is a preliminary deployment pipeline. Verify Cloudflare account permissions and Worker health after the first deployment.

## Optional: read-only profile key for Grok Bot
`PROFILE_READ_KEY` is a Worker secret that lets an automation read your saved profile (including CV text) and nothing else. Requests send it in the `X-CareerFinder-Profile-Key` header and it is accepted only on `GET /api/private/profile`. It cannot edit the profile, save or read job discoveries, open application handoffs, or record submissions; every other route still requires the dashboard login or its own dedicated key.

1. Generate a key: `openssl rand -hex 32` (it must be exactly 64 lowercase hex characters, or the Worker rejects it).
2. From the `careerfinder` folder, run `npx wrangler secret put PROFILE_READ_KEY` and paste the key when prompted. (Or Cloudflare dashboard → Workers & Pages → `careerfinder-search` → Settings → Variables and Secrets → add a **Secret**.) Do not put the key in a file, URL, chat or GitHub.
3. Give the same key only to the automation that needs it, through its secret store.
4. To revoke access, delete or replace the `PROFILE_READ_KEY` secret. Secrets take effect immediately, with no redeploy.
