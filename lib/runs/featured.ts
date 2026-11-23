import { and, asc, eq, gt, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { runs, tasks, testReports } from "@/lib/db/schema";

/** Select a stable, public example that proves a retry on the very same task. */
export async function getFeaturedCorrection() {
  const failed = alias(testReports, "failed");
  const passed = alias(testReports, "passed");
  const [match] = await getDb()
    .select({ runId: runs.id, taskId: tasks.id, failedAttempt: failed.attempt, passedAttempt: passed.attempt })
    .from(runs)
    .innerJoin(tasks, and(eq(tasks.runId, runs.id), eq(tasks.status, "done")))
    .innerJoin(failed, and(eq(failed.taskId, tasks.id), eq(failed.passed, false)))
    .innerJoin(passed, and(
      eq(passed.taskId, tasks.id),
      eq(passed.passed, true),
      gt(passed.attempt, failed.attempt),
      lte(passed.attempt, tasks.attempts),
    ))
    .where(eq(runs.status, "completed"))
    .orderBy(asc(runs.createdAt), asc(runs.id), asc(tasks.position), asc(failed.attempt), asc(passed.attempt))
    .limit(1);
  return match ?? null;
}
