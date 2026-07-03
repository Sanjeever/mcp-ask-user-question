import { z } from "zod";

const optionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  preview: z.string().optional()
});

const questionSchema = z
  .object({
    question: z.string().min(1),
    header: z.string().min(1),
    options: z.array(optionSchema).min(2).max(4),
    multiSelect: z.boolean().default(false)
  })
  .superRefine((question, context) => {
    if (Array.from(question.header).length > 12) {
      context.addIssue({
        code: "custom",
        path: ["header"],
        message: "header must be at most 12 characters"
      });
    }

    const otherOptionIndex = question.options.findIndex(
      (option) => option.label.trim().toLowerCase() === "other"
    );
    if (otherOptionIndex !== -1) {
      context.addIssue({
        code: "custom",
        path: ["options", otherOptionIndex, "label"],
        message: 'options must not include "Other"; it is added automatically'
      });
    }
  });

export const askUserQuestionInputSchema = z.object({
  questions: z.array(questionSchema).min(1).max(4),
  answers: z.record(z.string(), z.unknown()).optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
  metadata: z
    .object({
      source: z.string().optional()
    })
    .optional()
});

export type ParsedAskUserQuestionInput = z.infer<typeof askUserQuestionInputSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "input" : issue.path.join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
