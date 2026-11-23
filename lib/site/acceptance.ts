import type { CheckResult } from "@/lib/db/schema";
import { runAgentChecks, type AgentCheck, type SiteFiles } from "./checks";
import { runBrowserChecks, type BrowserCheck } from "./browser-checks";

export type CheckDefinition =
  | { kind: "static"; check: AgentCheck & { criterionId: number } }
  | { kind: "browser"; check: BrowserCheck };

/** A follow-up tool call can correct one criterion without discarding all the other evidence. */
export function mergeCriterionChecks(previous: CheckResult[], results: CheckResult[]): CheckResult[] {
  const replaced = new Set(results.map((entry) => `${entry.kind}:${entry.criterionId}`));
  return [...previous.filter((entry) => !replaced.has(`${entry.kind}:${entry.criterionId}`)), ...results];
}

/** The planner labels interactions. Older or unlabelled plans can still describe an explicit action. */
export function needsBrowser(criterion: string): boolean {
  return /\[navegador\]|\b(?:al|tras|despu[eé]s de)\s+(?:hacer\s+(?:clic|click)|pulsar|enviar|rellenar|marcar|desmarcar|seleccionar|escribir|abrir|cerrar)\b|\b(?:hacer\s+(?:clic|click)|env[ií]o del formulario|validaci[oó]n nativa)\b/iu.test(criterion);
}

export function coverageProblem(plan: string[], checks: CheckResult[]): string | undefined {
  if (plan.length === 0) return "Falta el plan de pruebas de la tarea.";
  const evidence = checks.filter((entry) => entry.source === "agent");
  if (evidence.some(({ criterionId }) => typeof criterionId !== "number" || !Number.isInteger(criterionId) || criterionId < 1 || criterionId > plan.length)) {
    return "Alguna comprobación carece de un número de criterio válido. Repite las comprobaciones con su criterionId.";
  }
  const seenGroups = new Map<string, number>();
  for (const [index, criterion] of plan.entries()) {
    const selected = evidence.filter((entry) => entry.criterionId === index + 1);
    if (!selected.length) return `Falta evidencia del criterio ${index + 1}: ${criterion}`;
    if (needsBrowser(criterion) && !selected.some((entry) => entry.kind === "browser")) {
      return `El criterio ${index + 1} requiere una interacción comprobada con run_browser_checks: ${criterion}`;
    }
    // Criteria can share individual assertions, but identical suites only demonstrate one condition.
    const signatures = selected.flatMap(({ definition }) => definition ? [JSON.stringify(definition, (key, value) =>
      key === "criterionId" || key === "description" ? undefined : value)] : []);
    if (signatures.length) {
      const group = JSON.stringify([...new Set(signatures)].sort());
      const other = seenGroups.get(group);
      if (other) return `Los criterios ${other} y ${index + 1} tienen las mismas comprobaciones. Añade evidencia específica: ${criterion}`;
      seenGroups.set(group, index + 1);
    }
  }
}

/** Keep each result attached to the precise input that produced it, including the plan criterion. */
export async function evaluateDefinitions(files: SiteFiles, definitions: CheckDefinition[]): Promise<CheckResult[]> {
  const staticInputs = definitions.filter((entry) => entry.kind === "static");
  const browserInputs = definitions.filter((entry) => entry.kind === "browser");
  const staticResults = runAgentChecks(files, staticInputs.map(({ check }) => check));
  const browserResults = browserInputs.length ? await runBrowserChecks(files, browserInputs.map(({ check }) => check)) : [];
  return [...staticInputs, ...browserInputs].map((definition, index) => {
    const result = index < staticInputs.length ? staticResults[index] : browserResults[index - staticInputs.length];
    return {
      ...(result ?? {
        source: "agent" as const, passed: false, description: definition.check.description,
        detail: "El ejecutor no devolvió un resultado para esta comprobación.",
      }),
      criterionId: definition.check.criterionId,
      kind: definition.kind,
      definition,
    };
  });
}

export function approvalProblem(plan: string[], checks: CheckResult[], failureCount: number): string | undefined {
  if (failureCount > 0) return "Un informe aprobado no puede incluir problemas pendientes.";
  const coverage = coverageProblem(plan, checks);
  if (coverage) return coverage;
  const failed = checks.filter((entry) => !entry.passed);
  if (failed.length) return failed.map((entry) => `${entry.description}: ${entry.detail}`).join("\n");
}

/** Re-evaluates the original assertions on the last version of the site, never their cached decisions. */
export async function finalChecks(files: SiteFiles, plan: string[], original: CheckResult[], audit: CheckResult[]): Promise<CheckResult[]> {
  const definitions = original.flatMap((entry) => entry.definition ? [entry.definition] : []);
  const actual = await evaluateDefinitions(files, definitions);
  const coverage = coverageProblem(plan, actual);
  const checks = [...audit, ...actual];
  if (coverage) checks.push({ source: "auto", description: "Cobertura del plan en la versión final", passed: false, detail: coverage });
  return checks.map((entry) => {
    const result = { ...entry, stage: "final" as const };
    delete result.definition;
    return result;
  });
}
