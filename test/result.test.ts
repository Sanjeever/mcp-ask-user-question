import { describe, expect, it } from "vitest";
import { askAllQuestions } from "../src/result.js";
import type { AskUserQuestionInput } from "../src/types.js";

const input: AskUserQuestionInput = {
  questions: [
    {
      question: "First?",
      header: "First",
      multiSelect: false,
      options: [
        { label: "A", description: "Option A" },
        { label: "B", description: "Option B" }
      ]
    },
    {
      question: "Second?",
      header: "Second",
      multiSelect: false,
      options: [
        { label: "C", description: "Option C" },
        { label: "D", description: "Option D" }
      ]
    }
  ]
};

describe("askAllQuestions", () => {
  it("returns all answers when every question is accepted", async () => {
    const result = await askAllQuestions(input, async (index) => ({
      action: "accept",
      answer: index === 0 ? "A" : "D"
    }));

    expect(result).toEqual({
      status: "answered",
      answers: {
        "First?": "A",
        "Second?": "D"
      }
    });
  });

  it("is all-or-nothing when a later question is cancelled", async () => {
    const result = await askAllQuestions(input, async (index) =>
      index === 0
        ? {
            action: "accept",
            answer: "A"
          }
        : {
            action: "cancel"
          }
    );

    expect(result).toEqual({
      status: "cancelled",
      answers: {},
      cancelledAt: 1
    });
  });
});
