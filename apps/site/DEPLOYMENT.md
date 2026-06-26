# Deployment

The marketing site and documentation live in `apps/site` and deploy to Vercel.

## Vercel setup

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `apps/site`.
3. Framework preset: **Next.js** (auto-detected).
4. Build uses the monorepo install from repository root via `vercel.json`.

## Custom domain (GitHub Student Pack)

Recommended domain: `informio.tech` from the `.TECH` student benefit.

1. Claim the domain in GitHub Student Developer Pack.
2. In Vercel → Project → Settings → Domains, add:
   - `informio.tech`
   - `www.informio.tech`
3. At your registrar, add the DNS records Vercel provides.
4. Wait for SSL provisioning.

Documentation is served at `https://informio.tech/docs` (English) and `https://informio.tech/cn/docs` (Chinese).

## Local development

```bash
corepack enable
corepack pnpm install
corepack pnpm dev:site
```

Open `http://localhost:3001`.
