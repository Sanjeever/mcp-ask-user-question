import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { AskUserProvider, AskUserQuestion, SingleQuestionResult } from "../types.js";
import {
  buildQuestionMessage,
  optionLabels,
  optionalNotes,
  otherLabel,
  resultFromSelectedLabels
} from "./shared.js";

export class WebProvider implements AskUserProvider {
  constructor(private readonly open: (url: string) => Promise<void> = openBrowser) {}

  ask(question: AskUserQuestion, index: number, total: number): Promise<SingleQuestionResult> {
    return new Promise((resolve, reject) => {
      const server = createServer(async (request, response) => {
        try {
          if (request.method === "GET" && request.url === "/") {
            sendHtml(response, renderQuestionPage(question, index, total));
            return;
          }

          if (request.method === "POST" && request.url === "/answer") {
            const params = new URLSearchParams(await readRequestBody(request));
            const parsed = parseAnswer(question, params);

            if ("error" in parsed) {
              sendHtml(response, renderQuestionPage(question, index, total, parsed.error), 400);
              return;
            }

            sendHtml(response, renderDonePage(parsed.action));
            resolve(parsed);
            setTimeout(() => server.close(), 0);
            return;
          }

          response.writeHead(404).end();
        } catch (error) {
          reject(error);
          response.writeHead(500).end();
          setTimeout(() => server.close(), 0);
        }
      });

      server.once("error", reject);
      server.listen(0, "127.0.0.1", async () => {
        const address = server.address() as AddressInfo;
        const url = `http://127.0.0.1:${address.port}/`;

        try {
          await this.open(url);
        } catch (error) {
          server.close();
          reject(error);
        }
      });
    });
  }
}

type ParseResult = SingleQuestionResult | { error: string };

function parseAnswer(question: AskUserQuestion, params: URLSearchParams): ParseResult {
  const action = params.get("action");
  if (action === "cancel") {
    return { action: "cancel" };
  }

  if (action === "decline") {
    return { action: "decline" };
  }

  if (action !== "accept") {
    return { error: "Invalid form action." };
  }

  const selectedLabels = question.multiSelect
    ? params.getAll("answers")
    : [params.get("answer")].filter((value): value is string => Boolean(value));

  if (selectedLabels.length === 0) {
    return { error: "Select at least one option." };
  }

  const labels = optionLabels(question);
  if (selectedLabels.some((label) => !labels.includes(label))) {
    return { error: "Selected option is not valid." };
  }

  const customAnswer = params.get("other")?.trim();
  if (selectedLabels.includes(otherLabel) && !customAnswer) {
    return { error: "Other was selected, but no custom answer was provided." };
  }

  return resultFromSelectedLabels(question, selectedLabels, customAnswer, optionalNotes(params.get("notes")));
}

function renderQuestionPage(
  question: AskUserQuestion,
  index: number,
  total: number,
  error?: string
): string {
  const inputType = question.multiSelect ? "checkbox" : "radio";
  const inputName = question.multiSelect ? "answers" : "answer";
  const options = optionLabels(question)
    .map((label) => {
      return `<label class="option"><input type="${inputType}" name="${inputName}" value="${escapeHtml(label)}"> <span>${escapeHtml(label)}</span></label>`;
    })
    .join("");

  return pageShell(`
    <main>
      <h1>${escapeHtml(question.header)}</h1>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <pre>${escapeHtml(buildQuestionMessage(question, index, total))}</pre>
      <form method="post" action="/answer">
        <fieldset>${options}</fieldset>
        <label class="field">Other answer<input name="other" autocomplete="off"></label>
        <label class="field">Notes<input name="notes" autocomplete="off"></label>
        <div class="actions">
          <button type="submit" name="action" value="accept">Answer</button>
          <button type="submit" name="action" value="cancel">Cancel</button>
          <button type="submit" name="action" value="decline">Decline</button>
        </div>
      </form>
    </main>
  `);
}

function renderDonePage(action: string): string {
  return pageShell(`
    <main>
      <h1>Done</h1>
      <p>The ${escapeHtml(action)} response was sent. You can close this tab.</p>
    </main>
  `);
}

function pageShell(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ask User Question</title>
<style>
body { margin: 0; font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f7f7f7; }
main { width: min(760px, calc(100vw - 32px)); margin: 32px auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 24px; }
h1 { margin: 0 0 16px; font-size: 24px; }
pre { white-space: pre-wrap; background: #f3f3f3; border-radius: 6px; padding: 16px; overflow-wrap: anywhere; }
fieldset { border: 0; padding: 0; margin: 16px 0; display: grid; gap: 8px; }
.option, .field { display: block; }
.field { margin: 12px 0; font-weight: 600; }
.field input { display: block; box-sizing: border-box; width: 100%; margin-top: 4px; padding: 8px; border: 1px solid #bbb; border-radius: 4px; font: inherit; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
button { padding: 8px 14px; border: 1px solid #999; border-radius: 4px; background: #fff; font: inherit; cursor: pointer; }
button:first-child { color: #fff; background: #1f5fbf; border-color: #1f5fbf; }
.error { color: #9f1239; font-weight: 600; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function sendHtml(response: ServerResponse, html: string, status = 200): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
