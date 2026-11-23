/**
 * The agent team as a durable workflow:
 *
 *   Orchestrator plans → for each task: Develop ⇄ Testing (up to 3 attempts) → Orchestrator summarises.
 *
 * Each await below is a persisted step, so a run survives function timeouts,
 * redeploys and transient API errors, and resumes where it stopped.
 */
import {
  beginDevelopment,
  beginTesting,
  developmentTurnLimit,
  developTurn,
  failRun,
  finishTask,
  forceFailedVerdict,
  markCancelled,
  planTasks,
  startRun,
  summarizeRun,
  testingTurn,
  validateFinalSite,
} from "./steps";

export const MAX_ATTEMPTS = 3;
const MAX_DEVELOP_TURNS = 14;
const MAX_TESTING_TURNS = 8;

export async function agentTeamWorkflow(runId: string) {
  "use workflow";

  try {
    const started = await startRun(runId);
    if (!started.ok) return { status: "cancelled" };

    const plan = await planTasks(runId);
    if (plan.cancelled) return { status: "cancelled" };
    if (plan.rejected) return { status: "rejected" };

    for (const taskId of plan.taskIds) {
      let passed = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !passed; attempt++) {
        // Develop works until it says it is done (or hits the turn limit).
        if ((await beginDevelopment(runId, taskId, attempt)).cancelled) return await cancelled(runId);
        let developed = false;
        for (let turn = 0; turn < MAX_DEVELOP_TURNS && !developed; turn++) {
          const result = await developTurn(runId, taskId);
          if (result.cancelled) return await cancelled(runId);
          developed = result.done;
        }
        if (!developed) await developmentTurnLimit(runId, taskId);

        // Testing reviews until it submits a verdict backed by checks.
        if ((await beginTesting(runId, taskId, attempt)).cancelled) return await cancelled(runId);
        let verdict: boolean | undefined;
        for (let turn = 0; turn < MAX_TESTING_TURNS && verdict === undefined; turn++) {
          const result = await testingTurn(runId, taskId, attempt);
          if (result.cancelled) return await cancelled(runId);
          if (result.done) verdict = result.passed ?? false;
        }
        passed = verdict ?? (await forceFailedVerdict(runId, taskId, attempt));
      }

      await finishTask(runId, taskId, passed);
    }

    for (const taskId of plan.taskIds) {
      if ((await validateFinalSite(runId, taskId)).cancelled) return await cancelled(runId);
    }
    const outcome = await summarizeRun(runId);
    return { status: outcome ?? "finished" };
  } catch (error) {
    await failRun(runId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function cancelled(runId: string) {
  await markCancelled(runId);
  return { status: "cancelled" };
}
