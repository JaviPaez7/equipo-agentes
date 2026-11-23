/** Run-level transitions that are not a single agent's job. */
import {
  getRun,
  getTask,
  initRunAgents,
  initRunFiles,
  isTerminal,
  logEvent,
  setAgent,
  setAllAgents,
  setRunStatus,
  updateTask,
} from "@/lib/runs/repo";
import { agentModel } from "./claude";

export async function startRun(runId: string): Promise<{ ok: boolean }> {
  const run = await getRun(runId);
  if (!run || run.status === "cancelled") return { ok: false };
  await initRunFiles(runId);
  await initRunAgents(runId);
  if (!run.startedAt) {
    await setRunStatus(runId, "planning", { startedAt: new Date() });
    await logEvent({
      runId,
      agent: "system",
      kind: "status",
      title: "Petición recibida; el equipo se pone en marcha",
      detail: `Modelo: ${agentModel()}`,
    });
  }
  return { ok: true };
}

export async function finishTask(runId: string, taskId: string, passed: boolean): Promise<void> {
  const task = await getTask(taskId);
  await updateTask(taskId, { status: passed ? "done" : "failed" });
  await logEvent({
    runId,
    taskId,
    agent: "orchestrator",
    kind: "status",
    title: passed
      ? `Tarea ${task.position} completada: ${task.title}`
      : `Tarea ${task.position} fallida tras ${task.attempts} intentos: ${task.title}`,
  });
  await setAgent(runId, "develop", "idle", "Esperando la siguiente tarea", { taskId: null });
  await setAgent(runId, "testing", "idle", "Esperando la siguiente tarea", { taskId: null });
  await setAgent(runId, "orchestrator", "waiting", passed ? "Tarea cerrada; pasando a la siguiente" : "Tarea marcada como fallida");
}

export async function failRun(runId: string, message: string): Promise<void> {
  const run = await getRun(runId);
  if (!run || isTerminal(run.status)) return;
  message = message.replace(/^(Fatal|Retryable)Error:\s*/, "");
  await setRunStatus(runId, "failed", { error: message.slice(0, 1000), finishedAt: new Date() });
  await logEvent({ runId, agent: "system", kind: "error", title: "La ejecución se ha detenido por un error", detail: message });
  await setAllAgents(runId, "error", "Detenido por un error");
}

export async function markCancelled(runId: string): Promise<void> {
  await setAllAgents(runId, "idle", "Ejecución cancelada");
  await logEvent({ runId, agent: "system", kind: "status", title: "Ejecución cancelada" });
}

export async function setTaskFailedEarly(runId: string, taskId: string, reason: string): Promise<void> {
  await logEvent({ runId, taskId, agent: "system", kind: "error", title: reason });
  await setAgent(runId, "develop", "waiting", reason, { taskId });
}
