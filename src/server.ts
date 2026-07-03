import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { askAllQuestions } from "./result.js";
import { askUserQuestionInputSchema, formatZodError } from "./schema.js";
import { createProvider, getProviderName } from "./providers/index.js";
import type { AskUserQuestionInput, AskUserQuestionResult } from "./types.js";

const version = "1.0.1";

export function createAskUserQuestionServer(): McpServer {
  const server = new McpServer(
    {
      name: "ask-user-question",
      version
    },
    {
      capabilities: {},
      instructions:
        "Use AskUserQuestion only when a real user decision is needed and reasonable defaults or code inspection cannot resolve it. This server prefers MCP elicitation; non-native fallback providers must be explicitly configured."
    }
  );

  server.registerTool(
    "AskUserQuestion",
    {
      title: "Ask User Question",
      description:
        "Ask the user one to four decision-blocking questions. Input is compatible with Claude Code AskUserQuestion; output is stable JSON.",
      inputSchema: askUserQuestionInputSchema
    },
    async (rawInput): Promise<CallToolResult> => {
      const input = parseInput(rawInput);
      const provider = createProvider(getProviderName(), server);

      const result = await askAllQuestions(input, async (index) =>
        provider.ask(input.questions[index], index, input.questions.length)
      );

      return toolResult(result);
    }
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createAskUserQuestionServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function parseInput(rawInput: unknown): AskUserQuestionInput {
  const parsed = askUserQuestionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`Invalid AskUserQuestion input: ${formatZodError(parsed.error)}`);
  }

  return {
    questions: parsed.data.questions.map((question) => ({
      question: question.question,
      header: question.header,
      options: question.options,
      multiSelect: question.multiSelect
    })),
    ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {})
  };
}

function toolResult(result: AskUserQuestionResult): CallToolResult {
  return {
    structuredContent: result as Record<string, unknown>,
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
