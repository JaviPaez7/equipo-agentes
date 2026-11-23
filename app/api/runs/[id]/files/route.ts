import { NextResponse } from "next/server";
import { getRunFile, isUuid } from "@/lib/runs/queries";

export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/files">) {
  const { id } = await ctx.params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!isUuid(id) || !path) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const file = await getRunFile(id, path);
  if (!file) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json(
    {
      path: file.path,
      content: file.content,
      originalContent: file.originalContent,
      updatedBy: file.updatedBy,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
