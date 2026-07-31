import { Annotation } from '@langchain/langgraph';

export type PastStep = [string, string];

export const PlanExecuteState = Annotation.Root({
  input: Annotation<string>,
  plan: Annotation<string[]>({ reducer: (_current, next) => next, default: () => [] }),
  past_steps: Annotation<PastStep[]>({ reducer: (current, next) => [...current, ...next], default: () => [] }),
  response: Annotation<string>({ reducer: (_current, next) => next, default: () => '' }),
});

export type PlanExecuteStateValue = typeof PlanExecuteState.State;
export type PlanExecuteStateUpdate = typeof PlanExecuteState.Update;
