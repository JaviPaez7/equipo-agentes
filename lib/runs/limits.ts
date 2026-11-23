/** Guards that keep a public demo from burning through the API budget. */
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { runs, type RunStatus } from "@/lib/db/schema";

const ACTIVE: RunStatus[] = ["queued", "planning", "running"];

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const MAX_REQUEST_LENGTH = 600;

export async function checkRunLimits(userId: string): Promise<string | null> {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [active] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.createdBy, userId), inArray(runs.status, ACTIVE)));
  if (active.n > 0) return "Ya tienes una ejecución en marcha. Espera a que termine o cancélala.";

  const [mine] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.createdBy, userId), gte(runs.createdAt, since)));
  if (mine.n >= envInt("MAX_RUNS_PER_USER_PER_DAY", 10)) {
    return "Has alcanzado el límite de ejecuciones de las últimas 24 horas.";
  }

  const [all] = await db.select({ n: count() }).from(runs).where(gte(runs.createdAt, since));
  if (all.n >= envInt("MAX_RUNS_PER_DAY", 30)) {
    return "La demo ha alcanzado el límite diario de ejecuciones. Puedes revisar las ejecuciones anteriores.";
  }

  return null;
}
