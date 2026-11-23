import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/runs/queries";
import { getRun, isTerminal, logEvent, setAllAgents, setRunStatus } from "@/lib/runs/repo";

export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (run.createdBy !== session.userId) return NextResponse.json({ error: "No puedes cancelar esta ejecución." }, { status: 403 });
  if (isTerminal(run.status)) return NextResponse.json({ ok: true });

  // The workflow checks this flag before every step and stops cleanly.
  await setRunStatus(id, "cancelled", { finishedAt: new Date() });
  await setAllAgents(id, "idle", "Cancelando…");
  await logEvent({ runId: id, agent: "system", kind: "status", title: `${session.username} ha cancelado la ejecución` });
  return NextResponse.json({ ok: true });
}
