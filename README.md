<h1><img src="public/brand/logo.svg" alt="Senda" width="210"></h1>

Senda turns interview transcripts into BPMN process diagrams people can agree on. An AI agent drafts the diagram, every step links back to the passage it came from, and anything the interview left unclear becomes a question you can take back to the people who do the work.

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

Create an account at [senda.hanifcarroll.com](https://senda.hanifcarroll.com). You can work with the built-in agent, or connect Claude or ChatGPT: add Senda as a connector in your assistant's settings, sign in, and ask it to map the interview. Plans and limits are on the [pricing page](https://senda.hanifcarroll.com/pricing).

### With an agent on your computer

The `senda` skill teaches an agent the discovery method and how to use the `senda` command. Install it from a checkout of this repository:

```sh
npm ci
npm run install:skill
```

This links the skill into Claude Code (`~/.claude/skills/senda`) and Codex (`~/.codex/skills/senda`). Add `-- --agent claude` or `-- --agent codex` to install it for one of them. Keep the checkout where it is, because the skill runs the command from it. For the Claude desktop or web app, download the [skill as a ZIP file](https://senda.hanifcarroll.com/api/skill.zip) and upload it under Skills in Claude's settings.

Then start a new session and ask something like:

> Use the Senda skill to model this interview as the current process. Ask me about missing decisions and keep the evidence attached.

### From the command line

The `senda` command keeps each project in a folder with its own database. Run it from the checkout with `node bin/senda.js`, or run `npm link` once to put `senda` on your path.

```sh
senda --project workspaces/booking init \
  --name "Project booking" \
  --purpose "Explain how accepted proposals become bookings" \
  --perspective "Freelancer" \
  --transcript examples/transcript.txt

senda --project workspaces/booking apply --file examples/01-discover.json
senda --project workspaces/booking apply --file examples/02-answer-and-model.json
senda --project workspaces/booking validate
senda --project workspaces/booking export
```

Every change names the revision it was based on, so a stale or invalid edit leaves the saved project unchanged. `senda --help` lists every command, and the [command reference](skills/senda/references/commands.md) describes the change format.

### As a JavaScript library

The package exports `Project`, `exportBundle` and `assess` from [`src/core/index.js`](src/core/index.js). The command line and the web app both use them.

## Try it locally

You need Node.js 24 and npm.

```sh
npm ci
npm run demo
```

The demo builds a synthetic project under `output/` and prints the path to a review page. Open it in a browser to explore the diagram, follow a step to its source passage, and read the clarification that shaped the model. The page works offline.

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
- [Branding](docs/branding.md) and [marketing page](docs/marketing-design.md)

Working notes from testing and research are in [docs/notes](docs/notes/README.md).

## Data and privacy

Local projects stay on your computer, in the folder you pass to `--project` (`.senda` by default). Hosted projects are private to your account, and a connected agent can open only the projects you allow. Exported review bundles include the full transcript text, so check what a bundle contains before you share it. Everything committed to this repository, including the public example, is synthetic.

## License and attribution

Senda is released under the [MIT license](LICENSE). Third-party dependencies keep their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Diagram editing uses [Miragon bpmn-cli](https://github.com/Miragon/bpmn-cli) 0.8.0.

The discovery method is an original summary based on Marlon Dumas, Marcello La Rosa, Jan Mendling and Hajo A. Reijers (2018), *Fundamentals of Business Process Management*, 2nd ed., Springer, chapter 5, §§5.3–5.4, pp. 177–193. [DOI](https://doi.org/10.1007/978-3-662-56509-4).
