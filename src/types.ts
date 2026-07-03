export type ProviderName = "auto" | "elicitation" | "terminal" | "desktop" | "web";

export type AskUserQuestionOption = {
  label: string;
  description: string;
  preview?: string;
};

export type AskUserQuestion = {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
};

export type AskUserQuestionInput = {
  questions: AskUserQuestion[];
  metadata?: {
    source?: string;
  };
};

export type QuestionAnnotation = {
  notes?: string;
  preview?: string;
  selectedOption?: string;
  selectedOptions?: string[];
};

export type AnswerValue = string | string[];

export type AskUserQuestionResult =
  | {
      status: "answered";
      answers: Record<string, AnswerValue>;
      annotations?: Record<string, QuestionAnnotation>;
    }
  | {
      status: "cancelled";
      answers: Record<string, never>;
      cancelledAt: number;
    }
  | {
      status: "declined";
      answers: Record<string, never>;
      declinedAt: number;
    };

export type SingleQuestionResult =
  | {
      action: "accept";
      answer: AnswerValue;
      annotation?: QuestionAnnotation;
    }
  | {
      action: "cancel";
    }
  | {
      action: "decline";
    };

export type AskUserProvider = {
  ask(question: AskUserQuestion, index: number, total: number): Promise<SingleQuestionResult>;
};
