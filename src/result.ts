import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
  QuestionAnnotation,
  SingleQuestionResult
} from "./types.js";

export async function askAllQuestions(
  input: AskUserQuestionInput,
  ask: (index: number) => Promise<SingleQuestionResult>
): Promise<AskUserQuestionResult> {
  const answers: Record<string, string | string[]> = {};
  const annotations: Record<string, QuestionAnnotation> = {};

  for (let index = 0; index < input.questions.length; index += 1) {
    const result = await ask(index);

    if (result.action === "cancel") {
      return {
        status: "cancelled",
        answers: {},
        cancelledAt: index
      };
    }

    if (result.action === "decline") {
      return {
        status: "declined",
        answers: {},
        declinedAt: index
      };
    }

    const question = input.questions[index].question;
    answers[question] = result.answer;

    if (result.annotation && Object.keys(result.annotation).length > 0) {
      annotations[question] = result.annotation;
    }
  }

  return {
    status: "answered",
    answers,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {})
  };
}
