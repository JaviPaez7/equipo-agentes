import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { agentModel } from "@/lib/agents/claude";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { reserveRun, MAX_REQUEST_LENGTH } from "@/lib/runs/limits";
import { listRuns } from "@/lib/runs/queries";
import {
  getRun,
  getRunLineage,
  initRunAgents,
  ITERABLE_RUN_STATUSES,
  MAX_LINEAGE,
  setRunStatus,
} from "@/lib/runs/repo";
import { agentTeamWorkflow } from "@/workflows/agent-team";

const Body = z.object({
  request: z.string().trim().min(8, "Describe un poco más lo que quieres.").max(MAX_REQUEST_LENGTH),
  /** Iterate on this finished run's website instead of starting from the sample site. */
  parentRunId: z.string().uuid("La ejecución de la que quieres partir no es válida.").optional(),
});

export async function GET() {
  const items = await listRuns(30);
  return NextResponse.json({ runs: items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión para lanzar una ejecución." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Petición no válida." }, { status: 400 });
  }

  const { parentRunId = null } = parsed.data;
  if (parentRunId) {
    const parent = await getRun(parentRunId);
    if (!parent) return NextResponse.json({ error: "La ejecución de la que quieres partir no existe." }, { status: 404 });
    if (!ITERABLE_RUN_STATUSES.includes(parent.status)) {
      return NextResponse.json({ error: "Solo se puede seguir iterando sobre una ejecución completada." }, { status: 409 });
    }
    if ((await getRunLineage(parentRunId)).length >= MAX_LINEAGE) {
      return NextResponse.json({ error: `Una web admite como mucho ${MAX_LINEAGE} iteraciones seguidas.` }, { status: 409 });
    }
  }

  const run = await reserveRun(session.userId, parsed.data.request, agentModel(), parentRunId);
  if ("error" in run) return NextResponse.json({ error: run.error }, { status: 429 });
  const db = getDb();
  let workflowRun;
  try {
    await initRunAgents(run.id);
    workflowRun = await start(agentTeamWorkflow, [run.id]);
  } catch (error) {
    await setRunStatus(run.id, "failed", { error: "No se pudo arrancar el workflow.", finishedAt: new Date() });
    console.error("workflow start failed", error);
    return NextResponse.json({ error: "No se pudo arrancar la ejecución." }, { status: 500 });
  }
  // A started workflow owns this run. Losing its optional cancellation handle
  // cannot move the run to 'failed': its durable DB cancellation guard still applies.
  try {
    const [saved] = await db.update(runs).set({ workflowRunId: workflowRun.runId })
      .where(eq(runs.id, run.id)).returning({ status: runs.status });
    if (saved?.status === "cancelled") await workflowRun.cancel();
  } catch {
    console.error("No se pudo registrar o cancelar el workflow ya iniciado.", run.id);
  }

  return NextResponse.json({ id: run.id }, { status: 201 });
}
