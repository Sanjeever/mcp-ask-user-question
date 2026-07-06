import { describe, expect, it } from "vitest";
import { WebProvider } from "../src/providers/web.js";
import type { AskUserQuestion } from "../src/types.js";

const question: AskUserQuestion = {
  question: "Which tools should we use?",
  header: "Tools",
  multiSelect: false,
  options: [
    { label: "Vitest", description: "Fast unit tests" },
    { label: "Playwright", description: "Browser tests" }
  ]
};

describe("WebProvider", () => {
  it("accepts a single-select browser form answer", async () => {
    const provider = new WebProvider(async (url) => {
      await submit(url, {
        action: "accept",
        answer: "Vitest",
        notes: "use existing tests"
      });
    });

    await expect(provider.ask(question, 0, 1)).resolves.toEqual({
      action: "accept",
      answer: "Vitest",
      annotation: {
        selectedOption: "Vitest",
        notes: "use existing tests"
      }
    });
  });

  it("accepts a multi-select browser form answer with Other", async () => {
    const provider = new WebProvider(async (url) => {
      await submit(url, [
        ["action", "accept"],
        ["answers", "Vitest"],
        ["answers", "Other"],
        ["other", "Node test runner"]
      ]);
    });

    await expect(provider.ask({ ...question, multiSelect: true }, 0, 1)).resolves.toEqual({
      action: "accept",
      answer: ["Vitest", "Node test runner"],
      annotation: {
        selectedOptions: ["Vitest", "Other"]
      }
    });
  });

  it("returns decline from the browser form", async () => {
    const provider = new WebProvider(async (url) => {
      await submit(url, {
        action: "decline"
      });
    });

    await expect(provider.ask(question, 0, 1)).resolves.toEqual({ action: "decline" });
  });
});

async function submit(url: string, body: Record<string, string> | [string, string][]): Promise<void> {
  const response = await fetch(new URL("/answer", url), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body)
  });

  expect(response.ok).toBe(true);
}
