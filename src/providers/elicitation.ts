import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ElicitRequestFormParams } from "@modelcontextprotocol/sdk/types.js";
import type { AskUserProvider, AskUserQuestion, SingleQuestionResult } from "../types.js";
import {
  annotationForMultiple,
  annotationForSingle,
  buildQuestionMessage,
  optionLabels,
  otherLabel,
  requireOtherText
} from "./shared.js";

export class ElicitationProvider implements AskUserProvider {
  constructor(private readonly mcpServer: McpServer) {}

  async ask(question: AskUserQuestion, index: number, total: number): Promise<SingleQuestionResult> {
    if (!this.supportsFormElicitation()) {
      throw new Error(
        "MCP client does not support form elicitation. Set ASK_USER_PROVIDER=terminal for the experimental terminal provider, or use a client that advertises elicitation support."
      );
    }

    const result = await this.mcpServer.server.elicitInput({
      mode: "form",
      message: buildQuestionMessage(question, index, total),
      requestedSchema: buildRequestedSchema(question)
    });

    if (result.action === "cancel") {
      return { action: "cancel" };
    }

    if (result.action === "decline") {
      return { action: "decline" };
    }

    if (!result.content) {
      throw new Error("MCP client accepted elicitation but returned no content.");
    }

    return question.multiSelect
      ? this.parseMultiSelectContent(question, result.content as Record<string, unknown>)
      : this.parseSingleSelectContent(question, result.content as Record<string, unknown>);
  }

  private supportsFormElicitation(): boolean {
    const elicitation = this.mcpServer.server.getClientCapabilities()?.elicitation;
    if (!elicitation) {
      return false;
    }

    if (Object.keys(elicitation).length === 0) {
      return true;
    }

    return "form" in elicitation;
  }

  private async parseSingleSelectContent(
    question: AskUserQuestion,
    content: Record<string, unknown>
  ): Promise<SingleQuestionResult> {
    const selectedLabel = content.answer;
    if (typeof selectedLabel !== "string") {
      throw new Error("MCP client returned an invalid single-select answer.");
    }

    if (selectedLabel === otherLabel) {
      const other = await this.askOther(question);
      if (other.action !== "accept") {
        return other;
      }

      return {
        action: "accept",
        answer: other.answer,
        annotation: annotationForSingle(question, selectedLabel)
      };
    }

    return {
      action: "accept",
      answer: selectedLabel,
      annotation: annotationForSingle(question, selectedLabel)
    };
  }

  private async parseMultiSelectContent(
    question: AskUserQuestion,
    content: Record<string, unknown>
  ): Promise<SingleQuestionResult> {
    const selectedLabels = content.answers;
    if (!Array.isArray(selectedLabels) || selectedLabels.some((label) => typeof label !== "string")) {
      throw new Error("MCP client returned an invalid multi-select answer.");
    }

    const labels = selectedLabels as string[];
    if (labels.length === 0) {
      throw new Error("At least one option must be selected.");
    }

    if (labels.includes(otherLabel)) {
      const other = await this.askOther(question);
      if (other.action !== "accept") {
        return other;
      }

      return {
        action: "accept",
        answer: labels.map((label) => (label === otherLabel ? other.answer : label)),
        annotation: annotationForMultiple(question, labels)
      };
    }

    return {
      action: "accept",
      answer: labels,
      annotation: annotationForMultiple(question, labels)
    };
  }

  private async askOther(question: AskUserQuestion): Promise<OtherResult> {
    const result = await this.mcpServer.server.elicitInput({
      mode: "form",
      message: `Provide a custom answer for: ${question.question}`,
      requestedSchema: {
        type: "object",
        properties: {
          other: {
            type: "string",
            title: "Other",
            description: "Your custom answer.",
            minLength: 1
          }
        },
        required: ["other"]
      }
    });

    if (result.action === "cancel") {
      return { action: "cancel" };
    }

    if (result.action === "decline") {
      return { action: "decline" };
    }

    if (!result.content) {
      throw new Error("MCP client accepted Other answer but returned no content.");
    }

    return {
      action: "accept",
      answer: requireOtherText((result.content as Record<string, unknown>).other)
    };
  }
}

type OtherResult =
  | {
      action: "accept";
      answer: string;
    }
  | {
      action: "cancel";
    }
  | {
      action: "decline";
    };

function buildRequestedSchema(question: AskUserQuestion): ElicitRequestFormParams["requestedSchema"] {
  if (question.multiSelect) {
    return {
      type: "object",
      properties: {
        answers: {
          type: "array",
          title: question.header,
          description: "Select one or more options.",
          items: {
            anyOf: optionLabels(question).map((label) => ({
              const: label,
              title: label
            }))
          },
          minItems: 1
        }
      },
      required: ["answers"]
    };
  }

  return {
    type: "object",
    properties: {
      answer: {
        type: "string",
        title: question.header,
        description: "Select one option.",
        oneOf: optionLabels(question).map((label) => ({
          const: label,
          title: label
        }))
      }
    },
    required: ["answer"]
  };
}
