/** Testing: verifies Develop's work with deterministic checks and returns what fails. */
import type {
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { testReports, type CheckResult, type TestFailure } from "@/lib/db/schema";
import { AGENT_CHECK_TYPES, auditSite, runAgentChecks, summarizeChecks } from "@/lib/site/checks";
import { applyEditorCommand, listing } from "@/lib/site/editor";
import {
  addUsage,
  getConversation,
  getFileSummaries,
  getRun,
  getSiteFiles,
  getTask,
  logEvent,
  saveConversation,
  setAgent,
  updateTask,
} from "@/lib/runs/repo";
import { agentModel, callClaude, refusalMessage, responseText, thinkingSummary } from "./claude";
import { formatFeedback, type TurnResult } from "./develop";
import { bulletList, dumpSite, TESTING_SYSTEM } from "./prompts";

const nullable = (type: "string" | "integer") => ({ anyOf: [{ type }, { type: "null" }] });

const TOOLS: BetaTool[] = [
  {
    name: "list_files",
    description: "Lista los archivos de la web con su tamaño.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "read_file",
    description: "Devuelve el contenido de un archivo de la web con números de línea.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: 'Ruta relativa, p. ej. "contacto.html"' } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "run_checks",
    description:
      "Ejecuta comprobaciones deterministas sobre el DOM de las páginas y devuelve si pasa cada una. " +
      "Tipos: exists (el selector encuentra algo), absent (no encuentra nada), count_at_least (al menos min elementos), " +
      "text_contains (algún elemento del selector contiene value, sin distinguir mayúsculas ni tildes), " +
      "attribute_equals (algún elemento del selector tiene el atributo attribute; si value no es null, con ese valor exacto), " +
      "links_to (la página page tiene un enlace <a> a la ruta value), file_exists (existe el archivo page). " +
      "Los campos que un tipo no usa van a null. Cada llamada sustituye a la anterior: incluye siempre la lista completa.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["checks"],
      properties: {
        checks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["description", "type", "page", "selector", "attribute", "value", "min"],
            properties: {
              description: { type: "string", description: "Qué criterio verifica, en una frase." },
              type: { type: "string", enum: [...AGENT_CHECK_TYPES] },
              page: { type: "string" },
              selector: nullable("string"),
              attribute: nullable("string"),
              value: nullable("string"),
              min: nullable("integer"),
            },
          },
        },
      },
    },
  },
  {
    name: "audit_site",
    description:
      "Repite la auditoría automática de todo el sitio: HTML válido y accesible, metadatos, enlaces y recursos rotos, páginas huérfanas y sintaxis de JS y CSS.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "submit_report",
    description: "Entrega el veredicto final de esta revisión. Termina siempre con esta herramienta.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["passed", "summary", "failures"],
      properties: {
        passed: { type: "boolean" },
        summary: { type: "string", description: "Una o dos frases con el resultado." },
        failures: {
          type: "array",
          description: "Vacía si passed es true.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["criterion", "problem", "suggestion"],
            properties: {
              criterion: { type: "string" },
              problem: { type: "string" },
              suggestion: { type: "string" },
            },
          },
        },
      },
    },
  },
];

const ChecksInput = z.object({
  checks: z
    .array(
      z.object({
        description: z.string(),
        type: z.enum(AGENT_CHECK_TYPES),
        page: z.string(),
        selector: z.string().nullable(),
        attribute: z.string().nullable(),
        value: z.string().nullable(),
        min: z.number().int().nullable(),
      }),
    )
    .max(40),
});

const ReportInput = z.object({
  passed: z.boolean(),
  summary: z.string(),
  failures: z.array(z.object({ criterion: z.string(), problem: z.string(), suggestion: z.string() })),
});

export type TestTurnResult = TurnResult & { passed?: boolean };

/** Prepares Testing for an attempt and hands it the automatic audit. */
export async function beginTesting(runId: string, taskId: string, attempt: number): Promise<TurnResult> {
  const run = await getRun(runId);
  if (!run || run.status === "cancelled") return { done: true, cancelled: true };

  const task = await getTask(taskId);
  await updateTask(taskId, { status: "testing" });

  const conversation = await getConversation(taskId, "testing");
  if (conversation?.state.attempt === attempt) return { done: false };

  const files = await getSiteFiles(runId);
  const audit = await auditSite(files);
  const changes = (await getFileSummaries(runId)).filter((f) => f.change !== "unchanged");
  const changeList =
    changes.map((f) => `- ${f.path} (${f.change === "new" ? "nuevo" : "modificado"})`).join("\n") || "- (ninguno)";

  const intro =
    attempt === 1
      ? [
          `Tarea a comprobar: ${task.title}`,
          `\nInstrucciones que recibió Develop:\n${task.developBrief}`,
          `\nPlan de pruebas:\n${bulletList(task.testPlan)}`,
        ]
      : [`Develop ha aplicado correcciones (intento ${attempt}). Vuelve a comprobar todos los criterios del plan de pruebas.`];

  const content = [
    ...intro,
    `\nResumen de Develop:\n${task.developSummary ?? "(sin resumen)"}`,
    `\nArchivos nuevos o modificados en esta ejecución:\n${changeList}`,
    `\nAuditoría automática del sitio:\n${summarizeChecks(audit)}`,
    `\nArchivos actuales (${Object.keys(files).length}):\n${listing(files)}`,
    `\nContenido actual:\n\n${dumpSite(files)}`,
    "\nEjecuta run_checks con la lista completa de comprobaciones y termina con submit_report.",
  ].join("\n");

  const messages = [...((conversation?.messages ?? []) as BetaMessageParam[]), { role: "user" as const, content }];
  await saveConversation(runId, taskId, "testing", messages, { state: { attempt, agentChecks: [] } });

  const autoFailures = audit.filter((c) => !c.passed).length;
  await logEvent({
    runId,
    taskId,
    agent: "testing",
    kind: "test",
    title:
      autoFailures === 0
        ? `Auditoría automática: ${audit.length} comprobaciones pasan`
        : `Auditoría automática: ${autoFailures} de ${audit.length} fallan`,
    detail: summarizeChecks(audit),
  });
  await setAgent(runId, "develop", "waiting", "Esperando el veredicto de Testing", { taskId });
  await setAgent(runId, "testing", "working", `Revisando: ${task.title}`, { taskId });
  await setAgent(runId, "orchestrator", "waiting", `Tarea ${task.position} en pruebas`);
  return { done: false };
}

export async function testingTurn(runId: string, taskId: string, attempt: number): Promise<TestTurnResult> {
  const run = await getRun(runId);
  if (!run || run.status === "cancelled") return { done: true, cancelled: true };

  const conversation = await getConversation(taskId, "testing");
  if (!conversation) throw new Error("Testing no tiene conversación para esta tarea");
  const messages = conversation.messages as BetaMessageParam[];
  const state = { ...conversation.state };
  const files = await getSiteFiles(runId);

  await setAgent(runId, "testing", "working", "Decidiendo qué comprobar…", { taskId });
  const response = await callClaude({ agent: "testing", system: TESTING_SYSTEM, tools: TOOLS, messages });
  await addUsage(runId, agentModel(), response.usage);
  messages.push({ role: "assistant", content: response.content });

  const thinking = thinkingSummary(response);
  if (thinking) await logEvent({ runId, taskId, agent: "testing", kind: "thinking", title: "Razonando", detail: thinking });

  const refusal = refusalMessage(response);
  if (refusal) {
    await saveConversation(runId, taskId, "testing", messages, { turnsDelta: 1 });
    const passed = await recordVerdict(runId, taskId, attempt, { passed: false, summary: refusal, failures: [] }, []);
    return { done: true, passed };
  }

  const toolUses = response.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
  if (toolUses.length === 0) {
    const text = responseText(response);
    messages.push({
      role: "user",
      content: "Tu revisión no ha terminado: entrega el veredicto llamando a submit_report.",
    });
    await saveConversation(runId, taskId, "testing", messages, { turnsDelta: 1 });
    if (text) await logEvent({ runId, taskId, agent: "testing", kind: "message", title: "Comentario", detail: text });
    return { done: false };
  }

  const results: BetaToolResultBlockParam[] = [];
  let verdict: boolean | undefined;

  for (const toolUse of toolUses) {
    const reply = (content: string, isError = false) =>
      results.push({ type: "tool_result", tool_use_id: toolUse.id, content, ...(isError ? { is_error: true } : {}) });

    if (response.stop_reason === "max_tokens") {
      reply("Tu respuesta se cortó por el límite de tokens. Usa menos comprobaciones por llamada.", true);
      continue;
    }

    switch (toolUse.name) {
      case "list_files":
        reply(listing(files));
        await setAgent(runId, "testing", "working", "Listando archivos", { taskId, countAction: true });
        break;

      case "read_file": {
        const path = String((toolUse.input as { path?: unknown }).path ?? "");
        const result = applyEditorCommand(files, { command: "view", path });
        reply(result.output, result.isError);
        await logEvent({ runId, taskId, agent: "testing", kind: "tool", title: result.summary });
        await setAgent(runId, "testing", "working", result.summary, { taskId, countAction: true });
        break;
      }

      case "run_checks": {
        const parsed = ChecksInput.safeParse(toolUse.input);
        if (!parsed.success) {
          reply(`Entrada no válida: ${parsed.error.message}`, true);
          break;
        }
        const checkResults = runAgentChecks(files, parsed.data.checks);
        state.agentChecks = checkResults;
        const failed = checkResults.filter((c) => !c.passed).length;
        reply(checkResults.map((c) => `${c.passed ? "✔" : "✘"} ${c.description} — ${c.detail}`).join("\n"));
        await logEvent({
          runId,
          taskId,
          agent: "testing",
          kind: "test",
          title:
            failed === 0
              ? `Ejecuta ${checkResults.length} comprobaciones: todas pasan`
              : `Ejecuta ${checkResults.length} comprobaciones: ${failed} fallan`,
          detail: checkResults.map((c) => `${c.passed ? "✔" : "✘"} ${c.description}\n   ${c.detail}`).join("\n"),
        });
        await setAgent(runId, "testing", "working", `Ejecutó ${checkResults.length} comprobaciones`, {
          taskId,
          countAction: true,
        });
        break;
      }

      case "audit_site": {
        const audit = await auditSite(files);
        reply(summarizeChecks(audit));
        await setAgent(runId, "testing", "working", "Repitió la auditoría del sitio", { taskId, countAction: true });
        break;
      }

      case "submit_report": {
        const parsed = ReportInput.safeParse(toolUse.input);
        if (!parsed.success) {
          reply(`Entrada no válida: ${parsed.error.message}`, true);
          break;
        }
        const report = parsed.data;
        const audit = await auditSite(files);
        const auditFailures = audit.filter((c) => !c.passed);
        const agentChecks = state.agentChecks ?? [];
        const agentFailures = agentChecks.filter((c) => !c.passed);

        // The verdict must be backed by evidence; inconsistent reports go back to Testing.
        if (report.passed && agentChecks.length === 0) {
          reply("No puedes aprobar sin evidencias: ejecuta antes run_checks con una comprobación por criterio.", true);
          break;
        }
        if (report.passed && agentFailures.length > 0) {
          reply(`No puedes aprobar: tus comprobaciones fallan.\n${summarizeChecks(agentFailures)}`, true);
          break;
        }
        if (report.passed && auditFailures.length > 0) {
          reply(`No puedes aprobar: la auditoría automática falla.\n${summarizeChecks(auditFailures)}`, true);
          break;
        }
        if (!report.passed && report.failures.length === 0 && auditFailures.length === 0) {
          reply("Si la tarea no pasa, indica en failures qué falla exactamente.", true);
          break;
        }
        verdict = await recordVerdict(runId, taskId, attempt, report, [...audit, ...agentChecks]);
        reply("Informe registrado.");
        break;
      }

      default:
        reply(`Herramienta desconocida: ${toolUse.name}`, true);
    }
    if (verdict !== undefined) break;
  }

  // Every tool_use needs a tool_result, even those after the verdict.
  for (const toolUse of toolUses) {
    if (!results.some((r) => r.tool_use_id === toolUse.id)) {
      results.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Ignorado: la revisión ya terminó." });
    }
  }

  messages.push({ role: "user", content: results });
  await saveConversation(runId, taskId, "testing", messages, { turnsDelta: 1, state });
  return verdict === undefined ? { done: false } : { done: true, passed: verdict };
}

/** Stores Testing's verdict for this attempt and updates the task. Returns whether it passed. */
async function recordVerdict(
  runId: string,
  taskId: string,
  attempt: number,
  report: { passed: boolean; summary: string; failures: TestFailure[] },
  checks: CheckResult[],
): Promise<boolean> {
  await getDb().insert(testReports).values({
    taskId,
    attempt,
    passed: report.passed,
    summary: report.summary,
    failures: report.failures,
    checks,
  });
  await updateTask(taskId, {
    lastFeedback: report.passed ? null : formatFeedback(report.summary, report.failures, checks),
  });
  const failedChecks = checks.filter((c) => !c.passed).length;
  await logEvent({
    runId,
    taskId,
    agent: "testing",
    kind: "test",
    title: report.passed
      ? `Veredicto: la tarea pasa (${checks.length} comprobaciones en verde)`
      : `Veredicto: la tarea no pasa (${report.failures.length} problema(s), ${failedChecks} comprobación(es) en rojo)`,
    detail: formatFeedback(report.summary, report.failures, checks),
  });
  await setAgent(runId, "testing", "waiting", report.passed ? "Tarea validada" : "Fallos devueltos a Develop", { taskId });
  return report.passed;
}

/** Used when Testing ran out of turns without a verdict: the attempt counts as failed. */
export async function forceFailedVerdict(runId: string, taskId: string, attempt: number): Promise<boolean> {
  const files = await getSiteFiles(runId);
  const audit = await auditSite(files);
  return recordVerdict(
    runId,
    taskId,
    attempt,
    {
      passed: false,
      summary: "Testing no emitió un veredicto a tiempo; el intento se considera fallido.",
      failures: [],
    },
    audit,
  );
}
