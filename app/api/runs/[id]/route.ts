import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRunState, isUuid } from "@/lib/runs/queries";
import { ITERABLE_RUN_STATUSES } from "@/lib/runs/repo";

export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const after = Number.parseInt(new URL(request.url).searchParams.get("after") ?? "0", 10);
  const [state, session] = await Promise.all([getRunState(id, Number.isFinite(after) ? after : 0), getSession()]);
  if (!state) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const { createdBy, ...run } = state.run;
  return NextResponse.json(
    {
      ...state,
      run,
      canCancel: session?.userId === createdBy,
      iterable: ITERABLE_RUN_STATUSES.includes(run.status),
      canIterate: Boolean(session) && ITERABLE_RUN_STATUSES.includes(run.status),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
