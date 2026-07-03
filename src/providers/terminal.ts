import { createReadStream, createWriteStream } from "node:fs";
import { createInterface, type Interface } from "node:readline/promises";
import type { AskUserProvider, AskUserQuestion, SingleQuestionResult } from "../types.js";
import {
  annotationForMultiple,
  annotationForSingle,
  buildQuestionMessage,
  optionLabels,
  otherLabel
} from "./shared.js";

export class TerminalProvider implements AskUserProvider {
  async ask(question: AskUserQuestion, index: number, total: number): Promise<SingleQuestionResult> {
    const terminal = openTerminal();

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

      if (selectedLabels.includes(otherLabel) && !customAnswer) {
        throw new Error("Other was selected, but no custom answer was provided.");
      }

      const notes = (await terminal.rl.question("Notes (optional): ")).trim() || undefined;

      if (question.multiSelect) {
        return {
          action: "accept",
          answer: selectedLabels.map((label) => (label === otherLabel ? customAnswer as string : label)),
          annotation: annotationForMultiple(question, selectedLabels, notes)
        };
      }

      const selectedLabel = selectedLabels[0];
      return {
        action: "accept",
        answer: selectedLabel === otherLabel ? customAnswer as string : selectedLabel,
        annotation: annotationForSingle(question, selectedLabel, notes)
      };
    } catch (error) {
      if (error instanceof TerminalCancelError) {
        return { action: "cancel" };
      }

      throw error;
    } finally {
      terminal.close();
    }
  }
}

type Terminal = {
  rl: Interface;
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

async function askSingleSelect(rl: Interface, labels: string[]): Promise<string> {
  while (true) {
    const raw = (await rl.question("Select one option by number, or type c to cancel: ")).trim();
    if (raw.toLowerCase() === "c") {
      throw new TerminalCancelError();
    }

    const selectedIndex = Number(raw);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= labels.length) {
      return labels[selectedIndex - 1];
    }
  }
}

async function askMultiSelect(rl: Interface, labels: string[]): Promise<string[]> {
  while (true) {
    const raw = (await rl.question("Select one or more option numbers separated by commas, or type c to cancel: ")).trim();
    if (raw.toLowerCase() === "c") {
      throw new TerminalCancelError();
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

class TerminalCancelError extends Error {
  constructor() {
    super("Terminal selection cancelled.");
  }
}
