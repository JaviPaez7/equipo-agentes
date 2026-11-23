/** Develop: edits the site with Anthropic's text editor tool, one model turn per step. */
import type {
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { applyEditorCommand, listing } from "@/lib/site/editor";
import { summarizeChecks } from "@/lib/site/checks";
import {
  addUsage,
  getConversation,
  getRun,
  getSiteFiles,
  getTask,
  getTasks,
  isTerminal,
  logEvent,
  saveConversation,
  setAgent,
  updateTask,
  writeSiteFile,
} from "@/lib/runs/repo";
import type { CheckResult, TestFailure } from "@/lib/db/schema";
import { agentModel, callClaude, refusalMessage, responseText, thinkingSummary } from "./claude";
import { bulletList, DEVELOP_SYSTEM, dumpSite } from "./prompts";

const EDITOR_TOOL = { type: "text_editor_20250728", name: "str_replace_based_edit_tool" } as const;

export type TurnResult = { done: boolean; cancelled?: boolean };

/** Prepares Develop for an attempt: first brief, or Testing's feedback on later attempts. */
export async function beginDevelopment(runId: string, taskId: string, attempt: number): Promise<TurnResult> {
  const run = await getRun(runId);
  if (!run || isTerminal(run.status)) return { done: true, cancelled: true };

  const task = await getTask(taskId);
  const allTasks = await getTasks(runId);
  await updateTask(taskId, { status: "in_progress", attempts: attempt });

  const conversation = await getConversation(taskId, "develop");
  if (conversation?.state.attempt === attempt) return { done: false }; // step retried; already prepared

  let messages = (conversation?.messages ?? []) as BetaMessageParam[];
  if (attempt === 1 || !conversation) {
    const files = await getSiteFiles(runId);
    messages = [
      {
        role: "user",
        content: [
          `Tarea ${task.position} de ${allTasks.length}: ${task.title}`,
          `\nInstrucciones del Orquestador:\n${task.developBrief}`,
          `\nPlan de pruebas que aplicará Testing:\n${bulletList(task.testPlan)}`,
          `\nPetición original del usuario: "${run.request}"`,
          `\nArchivos actuales de la web:\n${listing(files)}`,
          `\nContenido actual:\n\n${dumpSite(files)}`,
        ].join("\n"),
      },
    ];
    await logEvent({
      runId,
      taskId,
      agent: "orchestrator",
      kind: "status",
      title: `Asigna la tarea ${task.position} a Develop: ${task.title}`,
      detail: task.developBrief,
    });
  } else {
    messages = [
      ...messages,
      {
        role: "user",
        content: `Testing ha revisado tu trabajo y la tarea no pasa (intento ${attempt - 1}). Esto es lo que falla:\n\n${task.lastFeedback ?? "(sin detalle)"}\n\nCorrige estos problemas. Cuando termines, responde con un resumen breve de los cambios.`,
      },
    ];
    await logEvent({
      runId,
      taskId,
      agent: "testing",
      kind: "status",
      title: `Devuelve la tarea ${task.position} a Develop (intento ${attempt} de 3)`,
    });
  }

  await saveConversation(runId, taskId, "develop", messages, { state: { attempt } });
  await setAgent(runId, "develop", "working", attempt === 1 ? `Empezando: ${task.title}` : `Corrigiendo: ${task.title}`, {
    taskId,
  });
  await setAgent(runId, "testing", "idle", "Esperando a que Develop termine", { taskId });
  await setAgent(runId, "orchestrator", "waiting", `Tarea ${task.position} en desarrollo`);
  return { done: false };
}

export async function developTurn(runId: string, taskId: string): Promise<TurnResult> {
  const run = await getRun(runId);
  if (!run || isTerminal(run.status)) return { done: true, cancelled: true };

  const conversation = await getConversation(taskId, "develop");
  if (!conversation) throw new Error("Develop no tiene conversación para esta tarea");
  const messages = conversation.messages as BetaMessageParam[];
  const files = await getSiteFiles(runId);

  await setAgent(runId, "develop", "working", "Pensando el siguiente cambio…", { taskId });
  const response = await callClaude({
    agent: "develop",
    system: DEVELOP_SYSTEM,
    tools: [EDITOR_TOOL],
    messages,
  });
  if (!(await addUsage(runId, agentModel(), response.usage))) return { done: true, cancelled: true };
  messages.push({ role: "assistant", content: response.content });

  const thinking = thinkingSummary(response);
  if (thinking) await logEvent({ runId, taskId, agent: "develop", kind: "thinking", title: "Razonando", detail: thinking });

  const refusal = refusalMessage(response);
  if (refusal) {
    await finishDevelopment(runId, taskId, messages, refusal);
    return { done: true };
  }

  const toolUses = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
  if (toolUses.length === 0) {
    await finishDevelopment(runId, taskId, messages, responseText(response) || "Cambios terminados.");
    return { done: true };
  }

  const results: BetaToolResultBlockParam[] = [];
  for (const toolUse of toolUses) {
    if (response.stop_reason === "max_tokens") {
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        is_error: true,
        content:
          "Tu respuesta se cortó por el límite de tokens antes de completar esta llamada. Haz cambios más pequeños con str_replace o divide el archivo en partes.",
      });
      continue;
    }
    if (toolUse.name !== EDITOR_TOOL.name) {
      results.push({ type: "tool_result", tool_use_id: toolUse.id, is_error: true, content: `Herramienta desconocida: ${toolUse.name}` });
      continue;
    }
    const result = applyEditorCommand(files, toolUse.input);
    if (result.change) {
      await writeSiteFile(runId, result.change.path, result.change.content, "develop");
      files[result.change.path] = result.change.content;
    }
    results.push({ type: "tool_result", tool_use_id: toolUse.id, content: result.output, is_error: result.isError || undefined });
    await logEvent({
      runId,
      taskId,
      agent: "develop",
      kind: result.isError ? "error" : "tool",
      title: result.summary,
      detail: result.isError ? result.output : null,
    });
    await setAgent(runId, "develop", "working", result.summary, { taskId, countAction: true });
  }

  messages.push({ role: "user", content: results });
  await saveConversation(runId, taskId, "develop", messages, { turnsDelta: 1 });
  return { done: false };
}

async function finishDevelopment(runId: string, taskId: string, messages: BetaMessageParam[], summary: string) {
  await saveConversation(runId, taskId, "develop", messages, { turnsDelta: 1 });
  await updateTask(taskId, { developSummary: summary });
  await logEvent({ runId, taskId, agent: "develop", kind: "message", title: "Entrega el trabajo a Testing", detail: summary });
  await setAgent(runId, "develop", "waiting", "Esperando el veredicto de Testing", { taskId });
}

/** Formats Testing's failed verdict as the feedback Develop receives next attempt. */
export function formatFeedback(summary: string, failures: TestFailure[], checks: CheckResult[]): string {
  const lines = [summary];
  if (failures.length > 0) {
    lines.push(
      "",
      ...failures.map((f, i) => `${i + 1}. [${f.criterion}] ${f.problem}\n   Sugerencia: ${f.suggestion}`),
    );
  }
  const autoFailures = checks.filter((c) => c.source === "auto" && !c.passed);
  if (autoFailures.length > 0) lines.push("", "Auditoría automática del sitio:", summarizeChecks(autoFailures));
  return lines.join("\n");
}
