import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { agentModel } from "@/lib/agents/claude";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { checkRunLimits, MAX_REQUEST_LENGTH } from "@/lib/runs/limits";
import { listRuns } from "@/lib/runs/queries";
import { initRunAgents } from "@/lib/runs/repo";
import { agentTeamWorkflow } from "@/workflows/agent-team";

const Body = z.object({
  request: z.string().trim().min(8, "Describe un poco más lo que quieres.").max(MAX_REQUEST_LENGTH),
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

  const limitError = await checkRunLimits(session.userId);
  if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

  const db = getDb();
  const [run] = await db
    .insert(runs)
    .values({ request: parsed.data.request, model: agentModel(), createdBy: session.userId })
    .returning({ id: runs.id });
  await initRunAgents(run.id);

  try {
    const workflowRun = await start(agentTeamWorkflow, [run.id]);
    await db.update(runs).set({ workflowRunId: workflowRun.runId }).where(eq(runs.id, run.id));
  } catch (error) {
    await db
      .update(runs)
      .set({ status: "failed", error: "No se pudo arrancar el workflow.", finishedAt: new Date() })
      .where(eq(runs.id, run.id));
    console.error("workflow start failed", error);
    return NextResponse.json({ error: "No se pudo arrancar la ejecución." }, { status: 500 });
  }

  return NextResponse.json({ id: run.id }, { status: 201 });
}
