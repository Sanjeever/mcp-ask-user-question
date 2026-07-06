# AGENTS.md

## Project

- This repository is a TypeScript MCP server package named `mcp-ask-user-question`.
- It exposes one MCP tool: `AskUserQuestion`.
- The package entrypoint is `src/index.ts`; build output goes to `dist/`.

## Communication

- Reply to the user in Chinese.
- Keep implementation updates concise and only report meaningful progress, blockers, or completion.

## Commands

- Use `pnpm` for Node.js package tasks.
- Install dependencies: `pnpm install`
- Build: `pnpm build`
- Run tests: `pnpm test`
- Type check: `pnpm typecheck`
- Launch MCP Inspector: `pnpm inspect`

`pnpm inspect` builds first, then starts:

```bash
npx -y @modelcontextprotocol/inspector --config ./mcp.json --server mcp-ask-user-question
```

## MCP Debugging

- Local MCP Inspector config lives in `mcp.json`.
- The server name in `mcp.json` is `mcp-ask-user-question`.
- The server command should point at `./dist/index.js`, so run `pnpm build` before manual Inspector runs.
- To debug fallback providers, set `ASK_USER_PROVIDER` in `mcp.json`:
  - `auto`
  - `elicitation`
  - `terminal`
  - `desktop`
  - `web`

## Provider Notes

- `auto` and `elicitation` use native MCP form elicitation.
- `terminal` requires an attached TTY and writes prompts outside stdout.
- `desktop` uses Windows Forms on Windows and `osascript` on macOS.
- `web` starts a temporary loopback-only browser form on `127.0.0.1`.
- Do not enable terminal, desktop, or web fallback behavior automatically from `auto`.

## Coding Guidelines

- Keep changes small and focused.
- Preserve existing result shapes in `src/types.ts`.
- Keep provider behavior consistent by reusing helpers from `src/providers/shared.ts` where practical.
- Do not add dependencies unless they are clearly necessary.
- Avoid unrelated formatting churn.

## Testing

- Provider behavior should be covered with focused tests in `test/`.
- Prefer fake providers, injected openers, or local loopback requests over interactive tests.
- Do not require real terminal, browser, desktop, or MCP clients in automated tests.

## Git

- Default branch is `main`.
- Commit messages should follow Conventional Commits, for example:

```text
feat(desktop): support macOS dialogs
fix(web): close server after invalid submissions
test(terminal): cover decline input
```
