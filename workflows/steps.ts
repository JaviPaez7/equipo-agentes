/**
 * Durable steps of the agent-team workflow. Each step is one unit of work
 * that Workflow persists and retries: one model turn of one agent, or one
 * state transition. The logic lives in lib/agents so it stays plain and
 * testable; this file only marks the durable boundaries.
 */
import { beginDevelopment as beginDevelopmentImpl, developTurn as developTurnImpl } from "@/lib/agents/develop";
import { failRun as failRunImpl, finishTask as finishTaskImpl, markCancelled as markCancelledImpl, setTaskFailedEarly, startRun as startRunImpl } from "@/lib/agents/lifecycle";
import { planTasks as planTasksImpl, summarizeRun as summarizeRunImpl } from "@/lib/agents/orchestrator";
import {
  beginTesting as beginTestingImpl,
  forceFailedVerdict as forceFailedVerdictImpl,
  testingTurn as testingTurnImpl,
} from "@/lib/agents/testing";

export async function startRun(runId: string) {
  "use step";
  return startRunImpl(runId);
}

export async function planTasks(runId: string) {
  "use step";
  return planTasksImpl(runId);
}

export async function beginDevelopment(runId: string, taskId: string, attempt: number) {
  "use step";
  return beginDevelopmentImpl(runId, taskId, attempt);
}

export async function developTurn(runId: string, taskId: string) {
  "use step";
  return developTurnImpl(runId, taskId);
}

export async function developmentTurnLimit(runId: string, taskId: string) {
  "use step";
  await setTaskFailedEarly(runId, taskId, "Develop alcanzó el máximo de pasos; se pasa a pruebas tal como está");
}

export async function beginTesting(runId: string, taskId: string, attempt: number) {
  "use step";
  return beginTestingImpl(runId, taskId, attempt);
}

export async function testingTurn(runId: string, taskId: string, attempt: number) {
  "use step";
  return testingTurnImpl(runId, taskId, attempt);
}

export async function forceFailedVerdict(runId: string, taskId: string, attempt: number) {
  "use step";
  return forceFailedVerdictImpl(runId, taskId, attempt);
}

export async function finishTask(runId: string, taskId: string, passed: boolean) {
  "use step";
  return finishTaskImpl(runId, taskId, passed);
}

export async function summarizeRun(runId: string) {
  "use step";
  return summarizeRunImpl(runId);
}

export async function markCancelled(runId: string) {
  "use step";
  return markCancelledImpl(runId);
}

export async function failRun(runId: string, message: string) {
  "use step";
  return failRunImpl(runId, message);
}
