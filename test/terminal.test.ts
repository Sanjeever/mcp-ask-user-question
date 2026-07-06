import { describe, expect, it, vi } from "vitest";
import { TerminalProvider, type Terminal } from "../src/providers/terminal.js";
import type { AskUserQuestion } from "../src/types.js";

const question: AskUserQuestion = {
  question: "Which tools should we use?",
  header: "Tools",
  multiSelect: false,
  options: [
    { label: "Vitest", description: "Fast unit tests", preview: "vitest preview" },
    { label: "Playwright", description: "Browser tests" }
  ]
};

describe("TerminalProvider", () => {
  it("accepts a single-select answer", async () => {
    const terminal = createTerminal(["1", "ship it"]);
    const provider = new TerminalProvider(() => terminal);

    await expect(provider.ask(question, 0, 1)).resolves.toEqual({
      action: "accept",
      answer: "Vitest",
      annotation: {
        selectedOption: "Vitest",
        notes: "ship it",
        preview: "vitest preview"
      }
    });
    expect(terminal.close).toHaveBeenCalledOnce();
  });

  it("accepts a multi-select answer with Other", async () => {
    const terminal = createTerminal(["1,3", "Node test runner", ""]);
    const provider = new TerminalProvider(() => terminal);

    await expect(provider.ask({ ...question, multiSelect: true }, 0, 1)).resolves.toEqual({
      action: "accept",
      answer: ["Vitest", "Node test runner"],
      annotation: {
        selectedOptions: ["Vitest", "Other"],
        preview: "vitest preview"
      }
    });
  });

  it("returns cancel when the user enters c", async () => {
    const terminal = createTerminal(["c"]);
    const provider = new TerminalProvider(() => terminal);

    await expect(provider.ask(question, 0, 1)).resolves.toEqual({ action: "cancel" });
  });

  it("returns decline when the user enters d", async () => {
    const terminal = createTerminal(["d"]);
    const provider = new TerminalProvider(() => terminal);

    await expect(provider.ask(question, 0, 1)).resolves.toEqual({ action: "decline" });
  });
});

function createTerminal(answers: string[]): Terminal {
  return {
    rl: {
      question: vi.fn(async () => {
        const answer = answers.shift();
        if (answer === undefined) {
          throw new Error("No fake terminal answer left.");
        }

        return answer;
      })
    },
    write: vi.fn(),
    close: vi.fn()
  };
}
