<h1><img src="public/brand/logo.svg" alt="Senda" width="210"></h1>

Senda turns interview transcripts into BPMN process diagrams people can agree on. An AI agent drafts the diagram, every step links back to the passage it came from, and anything the interview left unclear becomes a question you can take back to the people who do the work.

**Most people: use the hosted app with its built-in agent or the Claude connector. Building on Senda: use the CLI or JavaScript library.**

**[Try Senda](https://senda.hanifcarroll.com)** · **[See the example](https://senda.hanifcarroll.com/example)** · **[Documentation](#documentation)**

<img src="public/marketing/evidence.svg" alt="A deposit invoice step selected in a client onboarding diagram, with the transcript passage that supports it." width="100%">

## What it does

- Drafts a BPMN 2.0 model of the current process from an interview transcript.
- Links each step to the transcript passage that supports it.
- Records gaps and conflicting accounts as open questions, then revises the same model as answers come in.
- Saves every revision, so you can see what changed and when.
- Keeps the current process (As-is) and a planned future process (To-be) as separate models, each with its own history.
- Exports standard `.bpmn` files with diagram layout.

## Ways to use it

### In the hosted app

Create an account at [senda.hanifcarroll.com](https://senda.hanifcarroll.com). Paste a transcript or upload TXT, Markdown, VTT, SRT or DOCX. Only the transcript is required; the agent can draft the name, purpose and perspective from it. Files are converted in your browser before you submit them, preserving speaker turns. Uploads can be up to 5 MB, with up to 300 KB of converted text; built-in chat accepts up to 60,000 characters per message.

Work with the built-in agent, or open **Connect your agent** for the current Claude and ChatGPT setup steps, server URL and starter prompt. ChatGPT support is in beta. Saving diagrams from ChatGPT requires a Business, Enterprise or Edu plan; ChatGPT Pro can only read from Senda. Workspace settings may also limit custom connections. Plans and limits are on the [pricing page](https://senda.hanifcarroll.com/pricing). To free a slot, delete a project from its menu. You can restore it from **Recently deleted** for seven days, as long as your plan has room.

### With an agent on your computer

Requires Node.js 24 or later.

The npm release is prepared but not published yet. Until it is available, clone this repository, run `npm ci`, then run `npm run install:skill`.

After the npm release is published:

Install the skill for Claude Code and Codex without cloning the repository:

```sh
npx @hanifcarroll/senda install-skill
```

Add `--agent claude` or `--agent codex` to install for one assistant. The installer copies the skill into `~/.claude/skills/senda` and `~/.codex/skills/senda`. The copy does not depend on a checkout: it uses the matching CLI when one is installed, or downloads that pinned version with npm when needed. A first download needs network access. Run `npx @hanifcarroll/senda@latest install-skill` to update it.

Start a new agent session and ask:

> Use the Senda skill to model this interview as the current process. Ask me about missing decisions and keep the evidence attached.

For Claude desktop or web, download the [skill as a ZIP file](https://senda.hanifcarroll.com/api/skill.zip) and upload it under Skills in Claude's settings. The ZIP supplies the discovery method; use the hosted connector to save projects from those apps.

### Claude Code plugin

In Claude Code, run:

```text
/plugin marketplace add HanifCarroll/Senda
/plugin install senda@senda
```

The plugin includes the skill and Senda’s hosted connector. Run `/mcp` to sign in to Senda and choose which projects it can use. For local projects, the skill runs the CLI, downloading its pinned npm version when the plugin copy cannot run it directly. You can use `/senda:senda` to load the method explicitly.

### From the command line

After the npm release is published:

Install the command once:

```sh
npm install --global @hanifcarroll/senda
```

Each project has its own folder and database. Set the project path once and create a project from your own transcript. An agent using the skill, or `senda apply`, then adds the diagram:

```sh
export SENDA_PROJECT=workspaces/booking
senda init \
  --name "Project booking" \
  --purpose "Explain how accepted proposals become bookings" \
  --perspective "Freelancer" \
  --transcript interview.txt

senda status --human
senda export --open
```

Without `SENDA_PROJECT`, Senda uses `.senda` in the current folder. An explicit `--project <directory>` takes precedence. Commands print JSON by default for agents; `status --human` shows a readable summary. `export` saves the review bundle; `export --open` also opens its review page.

Every change names the revision it was based on, so a stale or invalid edit leaves the saved project unchanged. `senda --help` lists every command, and the [command reference](skills/senda/references/commands.md) describes the change format.

### As a JavaScript library

After the npm release is published, install `@hanifcarroll/senda` and import `Project`, `exportBundle` and `assess` from it. The package exports them from [`src/core/index.js`](src/core/index.js). The command line and the web app both use them.

## Try it locally

For development, clone this repository and use Node.js 24 or later with npm. CI checks Node.js 24 and 26.

```sh
npm ci
npm run demo
```

The demo builds a synthetic project under `output/` and opens its review page in your browser. Add `-- --no-open` to keep it closed; CI and headless Linux skip opening automatically. Explore the diagram, follow a step to its source passage, and read the clarification that shaped the model. The page works offline.

For a longer interview with three rounds of clarification, run `npm run test:workflow -- --keep-output`. The [example notes](examples/complex-onboarding/README.md) describe what it covers.

To run the web app on your machine:

```sh
npm run build
npm run serve
```

Then open `http://127.0.0.1:3000`. Use `npm run dev:hosted` while you work on the app.

## How it works

Discovery follows chapter 5 of *Fundamentals of Business Process Management*. The agent starts with the process boundaries, then maps the activities and events, the people and handoffs, and the control flow, and asks about anything the interview didn't settle. The [method summary](skills/senda/references/methodology.md) covers the stages, and the [planning guide](skills/senda/references/planning.md) covers To-be models.

Senda stores the transcripts, answers and revisions, and checks every revision before saving it. [What Senda checks](docs/quality.md) lists those checks and how a person approves a finished model.

## Development

```sh
npm test
npm run check
npm run build
npm run typecheck
```

Run the build before the typecheck on a fresh checkout, because the build generates the route list. [CONTRIBUTING.md](CONTRIBUTING.md) explains where code belongs and what to run for each kind of change. Changes between versions are in the [changelog](CHANGELOG.md).

## Documentation

- [Architecture](docs/architecture.md): how the core, server, web app and Worker fit together
- [Hosted app](docs/hosted.md): accounts, the agent connection and limits
- [Built-in agent](docs/hosted-agent.md): setup and usage limits
- [Cloudflare](docs/cloudflare.md): deployment and runtime checks
- [Authentication](docs/authentication.md): sign-in and email
- [Billing](docs/billing.md): plans and payment setup
- [Exports and layout](docs/portable-bpmn.md): BPMN files, views and diagram layout
- [What Senda checks](docs/quality.md): validation and review
- [Client testing](docs/client-testing.md): tested agent connections
- [State machines](docs/state-machines.md): how chat, account, project and billing workflows are modeled
- [Generative testing](docs/generative-testing.md): property, fuzz and API tests
- [Branding](docs/branding.md) and [marketing page](docs/marketing-design.md)

Working notes from testing and research are in [docs/notes](docs/notes/README.md).

## Data and privacy

Local projects stay on your computer, in the folder you pass to `--project` (`.senda` by default). Hosted projects are private to your account, and a connected agent can open only the projects you allow. Exported review bundles include the full transcript text, so check what a bundle contains before you share it. Everything committed to this repository, including the public example, is synthetic.

## License and attribution

Senda is released under the [MIT license](LICENSE). Third-party dependencies keep their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Diagram editing uses [Miragon bpmn-cli](https://github.com/Miragon/bpmn-cli) 0.8.0.

The discovery method is an original summary based on Marlon Dumas, Marcello La Rosa, Jan Mendling and Hajo A. Reijers (2018), *Fundamentals of Business Process Management*, 2nd ed., Springer, chapter 5, §§5.3–5.4, pp. 177–193. [DOI](https://doi.org/10.1007/978-3-662-56509-4).
