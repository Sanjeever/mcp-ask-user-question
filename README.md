# mcp-ask-user-question

A portable MCP server that exposes an `AskUserQuestion`-compatible tool.

It uses MCP elicitation first, so clients that support elicitation can present questions through their native approval/input UI. Optional fallback providers are explicit and never enabled automatically.

## Install

Use it directly with `npx`:

```bash
npx -y mcp-ask-user-question
```

## Codex

Add the server:

```bash
codex mcp add ask-user-question -- npx -y mcp-ask-user-question
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.ask-user-question]
command = "npx"
args = ["-y", "mcp-ask-user-question"]
```

By default, the server uses:

```toml
[mcp_servers.ask-user-question.env]
ASK_USER_PROVIDER = "auto"
```

`auto` only uses native MCP elicitation. It does not automatically open a terminal, browser, or desktop dialog.

Codex must also allow MCP elicitation prompts. If tool calls return `declined` without showing a prompt, enable `mcp_elicitations` in your approval policy:

```toml
approval_policy = { granular = {
  sandbox_approval = true,
  rules = true,
  mcp_elicitations = true,
  request_permissions = true,
  skill_approval = true
} }
```

For a one-off test, start Codex with:

```bash
codex -c 'approval_policy={granular={sandbox_approval=true,rules=true,mcp_elicitations=true,request_permissions=true,skill_approval=true}}'
```

Do not use `codex --yolo` when you need this tool to ask questions. `--yolo` is shorthand for bypassing approvals and sandboxing, and Codex treats MCP elicitation as an interactive approval prompt. In that mode, elicitation requests can be auto-declined before the user sees a form.

If you need broad filesystem/command access while keeping user questions interactive, prefer setting only the sandbox mode:

```bash
codex --sandbox danger-full-access -c 'approval_policy={granular={sandbox_approval=true,rules=true,mcp_elicitations=true,request_permissions=true,skill_approval=true}}'
```

## Providers

| Provider | Status | Behavior |
| --- | --- | --- |
| `auto` | stable | Uses MCP form elicitation when the client advertises support. |
| `elicitation` | stable | Requires MCP form elicitation. |
| `terminal` | experimental | Reads from the attached TTY. It writes prompts outside stdout so MCP stdio is not corrupted. |
| `desktop` | experimental | Opens a native desktop dialog on Windows or macOS. Other platforms should use `web`. |
| `web` | experimental | Starts a loopback-only browser form and opens it in the default browser. |

For MCP elicitation, normal single-select and multi-select questions use one prompt. If the user selects `Other`, the server sends one follow-up prompt for the custom answer.

To enable the experimental terminal provider:

```toml
[mcp_servers.ask-user-question.env]
ASK_USER_PROVIDER = "terminal"
```

The terminal provider requires an attached TTY. It is mainly for local CLI testing and clients that launch MCP servers in an interactive terminal.

Terminal prompts accept `c` to cancel and `d` to decline.

To enable the desktop provider on Windows or macOS:

```toml
[mcp_servers.ask-user-question.env]
ASK_USER_PROVIDER = "desktop"
```

On macOS, the desktop provider uses the system `osascript` command.

To enable the browser-based provider:

```toml
[mcp_servers.ask-user-question.env]
ASK_USER_PROVIDER = "web"
```

The web provider listens on `127.0.0.1` with a random local port and closes the temporary server after the answer is submitted.

## Tool

The server exposes one tool:

```text
AskUserQuestion
```

Input is compatible with the Claude Code-style `AskUserQuestion` shape:

```json
{
  "questions": [
    {
      "question": "Which state management library should we use?",
      "header": "State mgmt",
      "options": [
        {
          "label": "Zustand (Recommended)",
          "description": "Lightweight, minimal boilerplate, great with TypeScript"
        },
        {
          "label": "Redux Toolkit",
          "description": "Full-featured, larger ecosystem, more boilerplate"
        }
      ],
      "multiSelect": false
    }
  ]
}
```

Constraints:

- `questions`: 1 to 4
- `options`: 2 to 4
- `header`: at most 12 characters
- Do not include `Other`; the server adds it automatically.
- `preview` is accepted on options, but native MCP clients may render it differently or not at all.

## Result

Answered:

```json
{
  "status": "answered",
  "answers": {
    "Which state management library should we use?": "Zustand (Recommended)"
  },
  "annotations": {
    "Which state management library should we use?": {
      "selectedOption": "Zustand (Recommended)"
    }
  }
}
```

Cancelled:

```json
{
  "status": "cancelled",
  "answers": {},
  "cancelledAt": 0
}
```

Declined:

```json
{
  "status": "declined",
  "answers": {},
  "declinedAt": 0
}
```

For multi-question calls, the result is all-or-nothing. If a later question is cancelled or declined, partial answers are not returned.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
