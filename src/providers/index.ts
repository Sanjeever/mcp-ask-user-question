import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AskUserProvider, ProviderName } from "../types.js";
import { DesktopProvider } from "./desktop.js";
import { ElicitationProvider } from "./elicitation.js";
import { TerminalProvider } from "./terminal.js";
import { WebProvider } from "./web.js";

export function getProviderName(): ProviderName {
  const raw = process.env.ASK_USER_PROVIDER ?? "auto";

  if (raw === "auto" || raw === "elicitation" || raw === "terminal" || raw === "desktop" || raw === "web") {
    return raw;
  }

  throw new Error(
    `Invalid ASK_USER_PROVIDER "${raw}". Expected one of: auto, elicitation, terminal, desktop, web.`
  );
}

export function createProvider(providerName: ProviderName, mcpServer: McpServer): AskUserProvider {
  if (providerName === "auto" || providerName === "elicitation") {
    return new ElicitationProvider(mcpServer);
  }

  if (providerName === "terminal") {
    return new TerminalProvider();
  }

  if (providerName === "desktop") {
    return new DesktopProvider();
  }

  return new WebProvider();
}
