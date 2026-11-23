import { NextResponse } from "next/server";
import { getRun as getWorkflowRun } from "workflow/api";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/runs/queries";
import { cancelRun, getRun, isTerminal } from "@/lib/runs/repo";

export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (run.createdBy !== session.userId) return NextResponse.json({ error: "No puedes cancelar esta ejecución." }, { status: 403 });
  if (!isTerminal(run.status)) await cancelRun(id, session.username);
  const stopped = await getRun(id);
  if (stopped?.status === "cancelled" && stopped.workflowRunId) {
    // The DB guard also stops the next step if the workflow service is unavailable.
    await getWorkflowRun(stopped.workflowRunId).cancel().catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
