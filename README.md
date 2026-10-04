# Token Abacus

Estimate what an agent task will cost before it runs, and record what it actually cost.

| Path | What it is |
| --- | --- |
| `cli/` | Local CLI and MCP server |
| `web/` | The website |
| `supabase/` | Database schema and local Supabase config |
| `docs/` | Plan and MCP notes |

## Deploy

Every push to `main` deploys `web/` to [tokenabacus.com](https://tokenabacus.com) on Vercel through `.github/workflows/deploy.yml`. The workflow needs a `VERCEL_TOKEN` repository secret. Site environment variables are set in the Vercel project, not in this repo.
