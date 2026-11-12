# Senda

Senda turns process interviews into BPMN diagrams with evidence, as a CLI, an agent skill, and a hosted app.
The hosted app runs on Cloudflare Workers, D1, and private R2 at senda.hanifcarroll.com.
Read the project's state and decisions in `/home/hanif/projects/agent-home/wiki/senda.md` first.
This repo is public, so never commit secrets, real interviews, or customer data.

## Layout

`CONTRIBUTING.md` explains what belongs in each folder and the checks to run after a change.
`docs/cloudflare.md` covers production, and `skills/senda/SKILL.md` is the method the app and skill share.

## Install, run, and test

Develop on the VPS. `mise.toml` pins Node 24.18.0 and uv, so run `mise install` once.

```sh
npm ci --ignore-scripts
npm test                  # about 2.5 minutes on the VPS
npm run build && npm run typecheck && npm run check
npm run demo -- --no-open
npm run build:cloudflare
```

Build before typecheck on a fresh checkout, because the build generates the route tree.
On the VPS, one timing test in `test/rendering.test.js` ("a dense invoice view") can pass its 15-second limit and fail. CI on GitHub passes it.
Keep local servers on loopback. `npm run dev:cloudflare` serves the Worker on 127.0.0.1:8788.

## Deploy

Production deploys from the `deploy` job in `.github/workflows/ci.yml` (the Verify workflow) after every check in that workflow passes on a push to `main`.
The job builds the Worker, applies D1 migrations, and then uploads the Worker. Runs on `main` never cancel each other: a newer push waits for the running workflow, and a still newer push replaces the waiting one, so a running deploy always finishes and pushes deploy in order, but not every commit is deployed. Re-running an older `main` run from the Actions page deploys that older commit over newer code, so do it only to roll back on purpose. GitHub matches branch names without regard to case, so never create a branch named `Main` or `MAIN`, because it would deploy too.
Cloudflare Workers Builds is disconnected, so nothing else deploys. `generative.yml` doesn't gate the deploy.
After a push, check the commit's runs with `gh api repos/HanifCarroll/Senda/commits/<sha>/check-runs`. The "deploy" run is the deploy.

## Traps

- Never add `.tool-versions`. Keep `.nvmrc` and the deploy job's Node version in step with `mise.toml`.
- `.env`, `.dev.vars`, and `.senda/` hold local secrets and test accounts. All three are gitignored, so never stage them.
- `.senda/` is persistent data, not a cache, so don't delete it.
- Read `docs/cloudflare.md` before shipping a migration. Some need a coordinated release, and an older Worker is not a safe rollback.
- Don't remove `global_fetch_strictly_public` from `wrangler.jsonc`.
