import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { ElicitationProvider } from "../src/providers/elicitation.js";
import type { AskUserQuestion } from "../src/types.js";

const singleSelectQuestion: AskUserQuestion = {
  question: "Which library should we use?",
  header: "Library",
  multiSelect: false,
  options: [
    { label: "Zustand", description: "Small state library", preview: "zustand preview" },
    { label: "Redux", description: "Large ecosystem" }
  ]
};

const multiSelectQuestion: AskUserQuestion = {
  question: "Which tooling should we use?",
  header: "Tooling",
  multiSelect: true,
  options: [
    { label: "Vitest", description: "Fast unit tests" },
    { label: "Playwright", description: "Browser tests", preview: "playwright preview" }
  ]
};

describe("ElicitationProvider", () => {
  it("throws when the MCP client does not advertise elicitation support", async () => {
    const provider = new ElicitationProvider(createMockServer(undefined));

    await expect(provider.ask(singleSelectQuestion, 0, 1)).rejects.toThrow(
      "MCP client does not support form elicitation"
    );
  });

  it("accepts a single-select answer from form elicitation", async () => {
    const elicitInput = vi.fn().mockResolvedValue({
      action: "accept",
      content: {
        answer: "Zustand"
      }
    });
    const provider = new ElicitationProvider(createMockServer({}, elicitInput));

    const result = await provider.ask(singleSelectQuestion, 0, 1);

    expect(result).toEqual({
      action: "accept",
      answer: "Zustand",
      annotation: {
        selectedOption: "Zustand",
        preview: "zustand preview"
      }
    });
    expect(elicitInput).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "form",
        message: expect.stringContaining("Which library should we use?")
      })
    );
  });

  it("asks a follow-up question when single-select chooses Other", async () => {
    const elicitInput = vi
      .fn()
      .mockResolvedValueOnce({
        action: "accept",
        content: {
          answer: "Other"
        }
      })
      .mockResolvedValueOnce({
        action: "accept",
        content: {
          other: "Jotai"
        }
      });
    const provider = new ElicitationProvider(createMockServer({ form: {} }, elicitInput));

    const result = await provider.ask(singleSelectQuestion, 0, 1);

    expect(result).toEqual({
      action: "accept",
      answer: "Jotai",
      annotation: {
        selectedOption: "Other"
      }
    });
    expect(elicitInput).toHaveBeenCalledTimes(2);
    expect(elicitInput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: "form",
        message: "Provide a custom answer for: Which library should we use?"
      })
    );
  });

  it("accepts a multi-select answer from form elicitation", async () => {
    const elicitInput = vi.fn().mockResolvedValue({
      action: "accept",
      content: {
        answers: ["Vitest", "Playwright"]
      }
    });
    const provider = new ElicitationProvider(createMockServer({ form: {} }, elicitInput));

    const result = await provider.ask(multiSelectQuestion, 1, 2);

    expect(result).toEqual({
      action: "accept",
      answer: ["Vitest", "Playwright"],
      annotation: {
        selectedOptions: ["Vitest", "Playwright"],
        preview: "playwright preview"
      }
    });
    expect(elicitInput).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Question 2 of 2")
      })
    );
  });

  it("asks a follow-up question when multi-select includes Other", async () => {
    const elicitInput = vi
      .fn()
      .mockResolvedValueOnce({
        action: "accept",
        content: {
          answers: ["Vitest", "Other"]
        }
      })
      .mockResolvedValueOnce({
        action: "accept",
        content: {
          other: "Node test runner"
        }
      });
    const provider = new ElicitationProvider(createMockServer({ form: {} }, elicitInput));

    const result = await provider.ask(multiSelectQuestion, 0, 1);

    expect(result).toEqual({
      action: "accept",
      answer: ["Vitest", "Node test runner"],
      annotation: {
        selectedOptions: ["Vitest", "Other"]
      }
    });
  });

  it("returns cancel and decline actions without partial answers", async () => {
    const cancelProvider = new ElicitationProvider(
      createMockServer(
        { form: {} },
        vi.fn().mockResolvedValue({
          action: "cancel"
        })
      )
    );
    const declineProvider = new ElicitationProvider(
      createMockServer(
        { form: {} },
        vi.fn().mockResolvedValue({
          action: "decline"
        })
      )
    );

    await expect(cancelProvider.ask(singleSelectQuestion, 0, 1)).resolves.toEqual({ action: "cancel" });
    await expect(declineProvider.ask(singleSelectQuestion, 0, 1)).resolves.toEqual({ action: "decline" });
  });

  it("throws when accepted elicitation returns invalid content", async () => {
    const provider = new ElicitationProvider(
      createMockServer(
        { form: {} },
        vi.fn().mockResolvedValue({
          action: "accept",
          content: {
            answers: "Vitest"
          }
        })
      )
    );

    await expect(provider.ask(multiSelectQuestion, 0, 1)).rejects.toThrow(
      "MCP client returned an invalid multi-select answer"
    );
  });
});

function createMockServer(
  elicitation: Record<string, unknown> | undefined,
  elicitInput = vi.fn()
): McpServer {
  return {
    server: {
      getClientCapabilities: vi.fn(() => (elicitation ? { elicitation } : {})),
      elicitInput
    }
  } as unknown as McpServer;
}
