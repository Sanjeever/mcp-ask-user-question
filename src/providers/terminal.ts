import { createReadStream, createWriteStream } from "node:fs";
import { createInterface, type Interface } from "node:readline/promises";
import type { AskUserProvider, AskUserQuestion, SingleQuestionResult } from "../types.js";
import {
  buildQuestionMessage,
  optionLabels,
  otherLabel,
  optionalNotes,
  resultFromSelectedLabels
} from "./shared.js";

export class TerminalProvider implements AskUserProvider {
  constructor(private readonly open: () => Terminal = openTerminal) {}

  async ask(question: AskUserQuestion, index: number, total: number): Promise<SingleQuestionResult> {
    const terminal = this.open();

    try {
      terminal.write(`${buildQuestionMessage(question, index, total)}\n\n`);
      const labels = optionLabels(question);

      labels.forEach((label, labelIndex) => {
        terminal.write(`${labelIndex + 1}) ${label}\n`);
      });

      const selectedLabels = question.multiSelect
        ? await askMultiSelect(terminal.rl, labels)
        : [await askSingleSelect(terminal.rl, labels)];

      const customAnswer = selectedLabels.includes(otherLabel)
        ? (await terminal.rl.question("Other: ")).trim()
        : undefined;

      const notes = optionalNotes(await terminal.rl.question("Notes (optional): "));
      return resultFromSelectedLabels(question, selectedLabels, customAnswer, notes);
    } catch (error) {
      if (error instanceof TerminalCancelError) {
        return { action: "cancel" };
      }

      if (error instanceof TerminalDeclineError) {
        return { action: "decline" };
      }

      throw error;
    } finally {
      terminal.close();
    }
  }
}

export type Terminal = {
  rl: Pick<Interface, "question">;
  write(text: string): void;
  close(): void;
};

function openTerminal(): Terminal {
  try {
    const input = createReadStream(process.platform === "win32" ? "CONIN$" : "/dev/tty");
    const output = createWriteStream(process.platform === "win32" ? "CONOUT$" : "/dev/tty");
    const rl = createInterface({ input, output });

    return {
      rl,
      write(text: string) {
        output.write(text);
      },
      close() {
        rl.close();
        input.close();
        output.close();
      }
    };
  } catch (error) {
    throw new Error(
      `Terminal provider requires an attached TTY. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function askSingleSelect(rl: Pick<Interface, "question">, labels: string[]): Promise<string> {
  while (true) {
    const raw = (await rl.question("Select one option by number, type c to cancel, or type d to decline: ")).trim();
    if (isCancel(raw)) {
      throw new TerminalCancelError();
    }

    if (isDecline(raw)) {
      throw new TerminalDeclineError();
    }

    const selectedIndex = Number(raw);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= labels.length) {
      return labels[selectedIndex - 1];
    }
  }
}

async function askMultiSelect(rl: Pick<Interface, "question">, labels: string[]): Promise<string[]> {
  while (true) {
    const raw = (await rl.question("Select option numbers separated by commas, type c to cancel, or type d to decline: ")).trim();
    if (isCancel(raw)) {
      throw new TerminalCancelError();
    }

    if (isDecline(raw)) {
      throw new TerminalDeclineError();
    }

    const selectedIndexes = raw
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value));

    const uniqueIndexes = [...new Set(selectedIndexes)];
    const valid = uniqueIndexes.length > 0 && uniqueIndexes.every((value) => value >= 1 && value <= labels.length);
    if (valid) {
      return uniqueIndexes.map((value) => labels[value - 1]);
    }
  }
}

function isCancel(raw: string): boolean {
  return raw.toLowerCase() === "c";
}

function isDecline(raw: string): boolean {
  return raw.toLowerCase() === "d";
}

class TerminalCancelError extends Error {
  constructor() {
    super("Terminal selection cancelled.");
  }
}

class TerminalDeclineError extends Error {
  constructor() {
    super("Terminal selection declined.");
  }
}
