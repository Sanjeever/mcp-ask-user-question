#!/usr/bin/env node
import { runStdioServer } from "./server.js";

runStdioServer().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
