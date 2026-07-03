#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createAskUserQuestionServer, runStdioServer } from "./server.js";

export { createAskUserQuestionServer, runStdioServer };

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runStdioServer().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
