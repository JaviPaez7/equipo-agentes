/** Read models for the UI. */
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { events, runAgents, runFiles, runs, tasks, testReports, users } from "@/lib/db/schema";
import { getFileSummaries, getRunLineage } from "./repo";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export async function listRuns(limit = 20) {
  const db = getDb();
  const parent = alias(runs, "parent");
  const rows = await db
    .select({
      id: runs.id,
      request: runs.request,
      status: runs.status,
      model: runs.model,
      costUsd: runs.costUsd,
      createdAt: runs.createdAt,
      finishedAt: runs.finishedAt,
      startedAt: runs.startedAt,
      createdBy: users.username,
      parentRunId: runs.parentRunId,
      parentRequest: parent.request,
    })
    .from(runs)
    .leftJoin(users, eq(users.id, runs.createdBy))
    .leftJoin(parent, eq(parent.id, runs.parentRunId))
    .orderBy(desc(runs.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const counts = await db
    .select({
      runId: tasks.runId,
      total: count(),
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')`.mapWith(Number),
    })
    .from(tasks)
    .where(inArray(tasks.runId, rows.map((r) => r.id)))
    .groupBy(tasks.runId);
  const byRun = new Map(counts.map((c) => [c.runId, c]));
  return rows.map((row) => ({
    ...row,
    tasksTotal: byRun.get(row.id)?.total ?? 0,
    tasksDone: byRun.get(row.id)?.done ?? 0,
    tasksFailed: byRun.get(row.id)?.failed ?? 0,
  }));
}

export async function getRunState(runId: string, afterEventId = 0) {
  const db = getDb();
  const [run] = await db
    .select({
      id: runs.id,
      request: runs.request,
      status: runs.status,
      analysis: runs.analysis,
      summary: runs.summary,
      error: runs.error,
      model: runs.model,
      createdBy: runs.createdBy,
      createdByName: users.username,
      inputTokens: runs.inputTokens,
      outputTokens: runs.outputTokens,
      cacheReadTokens: runs.cacheReadTokens,
      cacheWriteTokens: runs.cacheWriteTokens,
      costUsd: runs.costUsd,
      createdAt: runs.createdAt,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
    })
    .from(runs)
    .leftJoin(users, eq(users.id, runs.createdBy))
    .where(eq(runs.id, runId));
  if (!run) return null;

  const [agents, taskRows, newEvents, files, lineage, children] = await Promise.all([
    db.select().from(runAgents).where(eq(runAgents.runId, runId)),
    db.select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.position)),
    db
      .select()
      .from(events)
      .where(and(eq(events.runId, runId), gt(events.id, afterEventId)))
      .orderBy(asc(events.id))
      .limit(300),
    getFileSummaries(runId),
    getRunLineage(runId),
    db
      .select({ id: runs.id, request: runs.request, status: runs.status })
      .from(runs)
      .where(eq(runs.parentRunId, runId))
      .orderBy(asc(runs.createdAt)),
  ]);

  const reports =
    taskRows.length === 0
      ? []
      : await db
          .select()
          .from(testReports)
          .where(inArray(testReports.taskId, taskRows.map((t) => t.id)))
          .orderBy(asc(testReports.attempt));

  return {
    run,
    agents,
    tasks: taskRows.map((task) => ({
      ...task,
      reports: reports.filter((r) => r.taskId === task.id),
    })),
    events: newEvents,
    files,
    /** Runs this one builds on, oldest first, ending with this run. */
    lineage: lineage.map(({ id, request, status }) => ({ id, request, status })),
    /** Runs that iterate on this one. */
    children,
  };
}

export type RunState = NonNullable<Awaited<ReturnType<typeof getRunState>>>;

export async function getRunFile(runId: string, path: string) {
  const [row] = await getDb()
    .select()
    .from(runFiles)
    .where(and(eq(runFiles.runId, runId), eq(runFiles.path, path)));
  return row ?? null;
}
