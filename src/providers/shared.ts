import type { AskUserQuestion, AskUserQuestionOption, QuestionAnnotation } from "../types.js";

export const otherLabel = "Other";

export function optionLabels(question: AskUserQuestion): string[] {
  return [...question.options.map((option) => option.label), otherLabel];
}

export function buildQuestionMessage(question: AskUserQuestion, index: number, total: number): string {
  const title = total === 1 ? question.question : `Question ${index + 1} of ${total}: ${question.question}`;
  const options = question.options
    .map((option, optionIndex) => {
      const preview = option.preview ? `\nPreview:\n${option.preview}` : "";
      return `${optionIndex + 1}. ${option.label}: ${option.description}${preview}`;
    })
    .join("\n\n");

  return `${title}\n\nOptions:\n${options}\n\nYou may choose Other to provide a custom answer.`;
}

export function annotationForSingle(
  question: AskUserQuestion,
  selectedLabel: string,
  notes?: string
): QuestionAnnotation {
  const selectedOption = findOption(question.options, selectedLabel);
  return {
    selectedOption: selectedLabel,
    ...(notes ? { notes } : {}),
    ...(selectedOption?.preview ? { preview: selectedOption.preview } : {})
  };
}

export function annotationForMultiple(
  question: AskUserQuestion,
  selectedLabels: string[],
  notes?: string
): QuestionAnnotation {
  const previews = selectedLabels
    .map((label) => findOption(question.options, label)?.preview)
    .filter((preview): preview is string => Boolean(preview));

  return {
    selectedOptions: selectedLabels,
    ...(notes ? { notes } : {}),
    ...(previews.length === 1 ? { preview: previews[0] } : {})
  };
}

function findOption(options: AskUserQuestionOption[], label: string): AskUserQuestionOption | undefined {
  return options.find((option) => option.label === label);
}

export function requireOtherText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Other was selected, but no custom answer was provided.");
  }

  return value.trim();
}

export function optionalNotes(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
