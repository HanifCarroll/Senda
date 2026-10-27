# Senda in a browser with native WebMCP

Verified locally on Chrome 156.0.8078.48 with its native `document.modelContext` implementation, not a polyfill. The ordinary app and remote MCP connection still work when that API is absent. WebMCP remains an experimental browser capability.

## Open the dedicated browser

Start the app, then run:

```sh
npm run browser:webmcp -- http://127.0.0.1:3000/app
```

Pass the actual local origin if the server uses another port. The helper opens installed Chrome with `--enable-features=WebMCP`, a separate profile under the user's Codex browser-profiles directory, and a loopback debugging endpoint on port 9227. It does not change the normal Chrome profile. Set `CHROME_PATH`, `SENDA_BROWSER_PROFILE` or `SENDA_BROWSER_PORT` when needed. Sign into Senda in this profile and open the latest revision of a private project. **Connect your agent** reports whether native project tools are ready.

The browser can register/read/execute tools on HTTPS or a trusted loopback origin. Senda registers active-model tools plus `get_visible_project_context`; server-side authorization and revision checks still apply. Changing projects or switching As-is/To-be aborts their registration and binds the new tools to that model. Historical revisions do not expose editing tools. Source text is evidence, not instructions for the browser agent.

## Connect a coding agent

The official `chrome-devtools-mcp` bridge exposes `list_webmcp_tools` and `execute_webmcp_tool` when `--categoryExperimentalWebmcp=true` is enabled. Connect it to the dedicated browser's loopback endpoint, not an unrelated personal browser session. Enable only the tool categories needed. The local verified setup disables general input, debugging, network, performance, emulation and memory categories, and allows the Senda development origins and `https://senda.hanifcarroll.com`.

The verified bridge version is 1.12.0. Codex can register a stdio server using `codex mcp add`; configurations live outside the application repository. No separate model API key is needed merely to expose or invoke these native browser tools. The user's chosen coding agent supplies its reasoning. A newly added server may need a fresh chat to appear in the agent's tool inventory.

## Verified behavior

- A native browser probe registered a tool, discovered it and executed it through Chrome's `ModelContext` implementation.
- A private synthetic onboarding project received an initial draft and three clarification rounds through native `executeTool`, progressing through revisions 2–5 and open-question counts 7, 5, 4 and 0. Each saved revision appeared in the visible app.
- The official DevTools MCP bridge discovered Senda's native tools and invoked `apply_revision`. The invoice step's label changed in both the saved model and the visible diagram at revision 6.
- Readable context reports the visible project, revision, selected scope and step. Remote MCP ownership, consent, stale-write and revocation checks are verified independently by the integration suite.
- This Codex chat invoked the native tools to create a separate To-be plan from As-is revision 6, read its design brief and save To-be revision 2 with a proposed claim and an open design question. The complete As-is read remained identical. A browser call that attempted to target As-is while To-be was open was rejected. Opening a historical To-be view removed the registered tools; returning to a current model registered them again.

These are synthetic workflow and browser-integration checks, not a measurement of autonomous extraction quality or process-owner approval. A successful native browser tool call does not establish support in every agent client or in the desktop app's built-in browser.

Primary sources: [Chrome WebMCP setup](https://developer.chrome.com/docs/ai/webmcp), [native tool API](https://developer.chrome.com/docs/ai/webmcp/imperative), [DevTools WebMCP tools](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md), [DevTools MCP configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md), and [Codex MCP configuration](https://developers.openai.com/codex/mcp).
