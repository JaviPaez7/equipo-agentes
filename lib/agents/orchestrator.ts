/** Orchestrator: turns the user's request into tasks, then writes the closing summary. */
import { asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { tasks as tasksTable, testReports } from "@/lib/db/schema";
import {
  addUsage,
  getRun,
  getSiteFiles,
  getTasks,
  logEvent,
  setAgent,
  setAllAgents,
  setRunStatus,
} from "@/lib/runs/repo";
import { agentModel, callClaude, refusalMessage, responseText, thinkingSummary } from "./claude";
import { bulletList, dumpSite, ORCHESTRATOR_SYSTEM, SUMMARY_SYSTEM } from "./prompts";

const MAX_TASKS = 4;

const PlanSchema = z.object({
  analysis: z.string(),
  rejected_reason: z.string().nullable(),
  tasks: z.array(
    z.object({
      title: z.string().min(1),
      develop_brief: z.string().min(1),
      test_plan: z.array(z.string().min(1)).min(1),
    }),
  ),
});

const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["analysis", "rejected_reason", "tasks"],
  properties: {
    analysis: {
      type: "string",
      description: "Dos o tres frases: qué pide el usuario y cómo lo has dividido.",
    },
    rejected_reason: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Motivo del rechazo, o null si la petición es válida.",
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "develop_brief", "test_plan"],
        properties: {
          title: { type: "string" },
          develop_brief: { type: "string" },
          test_plan: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export async function planTasks(runId: string): Promise<{ taskIds: string[]; rejected: boolean }> {
  const run = await getRun(runId);
  if (!run) throw new Error(`Ejecución ${runId} no encontrada`);

  // A retried step must not plan twice.
  const existing = await getTasks(runId);
  if (existing.length > 0) return { taskIds: existing.map((t) => t.id), rejected: false };

  await setRunStatus(runId, "planning");
  await setAgent(runId, "orchestrator", "working", "Analizando la petición y planificando tareas", {
    countAction: true,
  });

  const files = await getSiteFiles(runId);
  const response = await callClaude({
    agent: "orchestrator",
    system: ORCHESTRATOR_SYSTEM,
    cache: false,
    outputFormat: { type: "json_schema", schema: PLAN_JSON_SCHEMA },
    messages: [
      {
        role: "user",
        content: `Petición del usuario:\n"""${run.request}"""\n\nContenido actual de la web:\n\n${dumpSite(files)}`,
      },
    ],
  });
  await addUsage(runId, agentModel(), response.usage);

  const thinking = thinkingSummary(response);
  if (thinking) {
    await logEvent({ runId, agent: "orchestrator", kind: "thinking", title: "Razonamiento del plan", detail: thinking });
  }

  const refusal = refusalMessage(response);
  if (refusal) return reject(runId, refusal);

  let plan: z.infer<typeof PlanSchema>;
  try {
    plan = PlanSchema.parse(JSON.parse(responseText(response)));
  } catch {
    // Structured outputs make this unlikely; a retry of the step is the right answer if it happens.
    throw new Error("El Orquestador devolvió un plan con un formato inesperado.");
  }

  if (plan.tasks.length === 0) {
    return reject(runId, plan.rejected_reason ?? "La petición no requiere cambios en la web.");
  }

  const chosen = plan.tasks.slice(0, MAX_TASKS);
  const inserted = await getDb()
    .insert(tasksTable)
    .values(
      chosen.map((task, i) => ({
        runId,
        position: i + 1,
        title: task.title.slice(0, 200),
        developBrief: task.develop_brief,
        testPlan: task.test_plan.slice(0, 8),
      })),
    )
    .returning({ id: tasksTable.id, position: tasksTable.position });
  inserted.sort((a, b) => a.position - b.position);

  await setRunStatus(runId, "running", { analysis: plan.analysis });
  await logEvent({
    runId,
    agent: "orchestrator",
    kind: "plan",
    title: `Plan listo: ${chosen.length} ${chosen.length === 1 ? "tarea" : "tareas"}`,
    detail: [
      plan.analysis,
      "",
      ...chosen.map(
        (task, i) =>
          `Tarea ${i + 1}: ${task.title}\n  → Develop: ${task.develop_brief}\n  → Testing:\n${bulletList(task.test_plan)
            .split("\n")
            .map((l) => `     ${l}`)
            .join("\n")}`,
      ),
    ].join("\n"),
  });
  await setAgent(runId, "orchestrator", "waiting", "Plan repartido; coordinando a Develop y Testing");

  return { taskIds: inserted.map((t) => t.id), rejected: false };
}

async function reject(runId: string, reason: string) {
  await setRunStatus(runId, "rejected", { summary: reason, finishedAt: new Date() });
  await logEvent({ runId, agent: "orchestrator", kind: "status", title: "Petición rechazada", detail: reason });
  await setAllAgents(runId, "done", "Sin tareas que hacer");
  return { taskIds: [], rejected: true };
}

export async function summarizeRun(runId: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) return;
  const all = await getTasks(runId);
  const failed = all.filter((t) => t.status !== "done");

  await setAgent(runId, "orchestrator", "working", "Redactando el resumen final", { countAction: true });

  const reports =
    all.length === 0
      ? []
      : await getDb()
          .select()
          .from(testReports)
          .where(
            inArray(
              testReports.taskId,
              all.map((t) => t.id),
            ),
          )
          .orderBy(asc(testReports.attempt));
  const latestReport = new Map(reports.map((r) => [r.taskId, r]));

  const facts = all
    .map((t) => {
      const report = latestReport.get(t.id);
      const lines = [
        `Tarea ${t.position}: ${t.title} → ${t.status === "done" ? "completada" : "fallida"} tras ${t.attempts} intento(s).`,
      ];
      if (t.developSummary) lines.push(`  Develop: ${t.developSummary}`);
      if (report) {
        const passing = report.checks.filter((c) => c.passed).length;
        lines.push(
          `  Testing, intento ${report.attempt}: ${report.passed ? "pasa" : "no pasa"} (${passing} de ${report.checks.length} comprobaciones en verde). ${report.summary}`,
        );
      } else {
        lines.push("  Testing no llegó a emitir un veredicto.");
      }
      if (t.status !== "done" && t.lastFeedback) lines.push(`  Último informe de Testing: ${t.lastFeedback}`);
      return lines.join("\n");
    })
    .join("\n");

  let summary: string;
  try {
    const response = await callClaude({
      agent: "orchestrator",
      effort: "low",
      cache: false,
      maxTokens: 4000,
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: `Petición: "${run.request}"\n\nResultado:\n${facts}` }],
    });
    await addUsage(runId, agentModel(), response.usage);
    summary = responseText(response) || fallbackSummary(all.length, failed.length);
  } catch {
    // The summary is a nicety: never fail a finished run because of it.
    summary = fallbackSummary(all.length, failed.length);
  }

  await setRunStatus(runId, failed.length === 0 ? "completed" : "completed_with_failures", {
    summary,
    finishedAt: new Date(),
  });
  await logEvent({ runId, agent: "orchestrator", kind: "message", title: "Resumen final", detail: summary });
  await setAllAgents(runId, "done", "Trabajo terminado");
}

function fallbackSummary(total: number, failed: number) {
  return failed === 0
    ? `Las ${total} tareas se han completado y Testing ha validado todas.`
    : `Se han completado ${total - failed} de ${total} tareas; ${failed} no superaron las pruebas tras el máximo de intentos.`;
}
