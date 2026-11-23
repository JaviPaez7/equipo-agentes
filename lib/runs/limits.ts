import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const MAX_REQUEST_LENGTH = 600;

const limitMessages = {
  active: "Ya tienes una ejecución en marcha. Espera a que termine o cancélala.",
  user_daily: "Has alcanzado el límite de ejecuciones de las últimas 24 horas.",
  global_daily: "La demo ha alcanzado el límite diario de ejecuciones. Puedes revisar las ejecuciones anteriores.",
};

export async function reserveRun(
  userId: string, request: string, model: string,
): Promise<{ id: string } | { error: string }> {
  const db = getDb();
  // Separate statements in a READ COMMITTED transaction: after waiting for the lock,
  // the admission query sees the run committed by the previous caller.
  const [, , result] = await db.batch([
    db.execute(sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`),
    db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('equipo-agentes:admission', 0))`),
    db.execute<{ id: string | null; reason: keyof typeof limitMessages | null }>(sql`
      WITH quota AS (
        SELECT CASE
          WHEN EXISTS (SELECT FROM runs WHERE created_by = ${userId} AND status IN ('queued', 'planning', 'running'))
            THEN 'active'
          WHEN count(*) FILTER (WHERE created_by = ${userId}) >= ${envInt("MAX_RUNS_PER_USER_PER_DAY", 10)}
            THEN 'user_daily'
          WHEN count(*) >= ${envInt("MAX_RUNS_PER_DAY", 30)} THEN 'global_daily'
        END AS reason
        FROM runs WHERE created_at >= now() - interval '24 hours'
      ), reserved AS (
        INSERT INTO runs (created_by, request, model)
        SELECT ${userId}, ${request}, ${model} FROM quota WHERE reason IS NULL
        RETURNING id
      )
      SELECT (SELECT id FROM reserved) AS id, reason FROM quota
    `),
  ]);
  const row = result.rows[0];
  if (row?.reason) return { error: limitMessages[row.reason] } as const;
  if (!row?.id) throw new Error("No se pudo reservar la ejecución.");
  return { id: row.id } as const;
}
