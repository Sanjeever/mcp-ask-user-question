import { describe, expect, it } from "vitest";
import { askUserQuestionInputSchema } from "../src/schema.js";

describe("askUserQuestionInputSchema", () => {
  it("accepts a minimal single-select question", () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: "Which library should we use?",
          header: "Library",
          options: [
            {
              label: "Zustand",
              description: "Small state library"
            },
            {
              label: "Redux",
              description: "Large ecosystem"
            }
          ]
        }
      ]
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0].multiSelect).toBe(false);
    }
  });

  it("rejects explicit Other options", () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: "Which library should we use?",
          header: "Library",
          options: [
            {
              label: "Zustand",
              description: "Small state library"
            },
            {
              label: "Other",
              description: "Custom answer"
            }
          ]
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects headers longer than twelve characters", () => {
    const result = askUserQuestionInputSchema.safeParse({
      questions: [
        {
          question: "Which library should we use?",
          header: "Very long header",
          options: [
            {
              label: "Zustand",
              description: "Small state library"
            },
            {
              label: "Redux",
              description: "Large ecosystem"
            }
          ]
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
