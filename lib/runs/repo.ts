/** Database helpers shared by the agents and the API. */
import { and, asc, eq, exists, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  AGENTS,
  conversations,
  events,
  runAgents,
  runFiles,
  runs,
  tasks,
  type AgentName,
  type AgentStatus,
  type ConversationState,
  type EventKind,
  type RunStatus,
  type TaskStatus,
} from "@/lib/db/schema";
import { costFor, type Usage } from "@/lib/agents/pricing";
import { SITE_TEMPLATE } from "@/lib/site/template";
import type { SiteFiles } from "@/lib/site/editor";

const MAX_DETAIL = 6000;
const ACTIVE: RunStatus[] = ["queued", "planning", "running"];

export async function logEvent(input: {
  runId: string;
  taskId?: string | null;
  agent: AgentName | "system";
  kind: EventKind;
  title: string;
  detail?: string | null;
}) {
  const detail = input.detail ? input.detail.slice(0, MAX_DETAIL) : null;
  await getDb()
    .insert(events)
    .values({
      runId: input.runId,
      taskId: input.taskId ?? null,
      agent: input.agent,
      kind: input.kind,
      title: input.title.slice(0, 300),
      detail,
    });
}

export async function setAgent(
  runId: string,
  agent: AgentName,
  status: AgentStatus,
  activity: string,
  options: { taskId?: string | null; countAction?: boolean } = {},
) {
  await getDb()
    .update(runAgents)
    .set({
      status,
      activity: activity.slice(0, 200),
      ...(options.taskId !== undefined ? { taskId: options.taskId } : {}),
      ...(options.countAction ? { actions: sql`${runAgents.actions} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(runAgents.runId, runId), eq(runAgents.agent, agent),
      exists(getDb().select({ id: runs.id }).from(runs)
        .where(and(eq(runs.id, runId), inArray(runs.status, ACTIVE))).for("share")),
    ));
}

export async function setAllAgents(runId: string, status: AgentStatus, activity: string) {
  await getDb()
    .update(runAgents)
    .set({ status, activity, taskId: null, updatedAt: new Date() })
    .where(eq(runAgents.runId, runId));
}

export async function getRun(runId: string) {
  const [run] = await getDb().select().from(runs).where(eq(runs.id, runId));
  return run ?? null;
}

export async function setRunStatus(runId: string, status: RunStatus, extra: Partial<typeof runs.$inferInsert> = {}) {
  const changed = await getDb()
    .update(runs)
    .set({ ...extra, status })
    .where(and(eq(runs.id, runId), inArray(runs.status, ACTIVE)))
    .returning({ id: runs.id });
  return changed.length > 0;
}

export function isTerminal(status: RunStatus) {
  return !ACTIVE.includes(status);
}

/** The run, unfinished tasks, agent cards and cancellation event change together. */
export async function cancelRun(runId: string, username: string) {
  await getDb().execute(sql`
    WITH cancelled AS (
      UPDATE runs SET status = 'cancelled', finished_at = now()
      WHERE id = ${runId} AND status IN ('queued', 'planning', 'running') RETURNING id
    ), stop_tasks AS (
      UPDATE tasks SET status = 'cancelled', updated_at = now()
      WHERE run_id IN (SELECT id FROM cancelled) AND status NOT IN ('done', 'failed', 'cancelled')
    ), stop_agents AS (
      UPDATE run_agents SET status = 'idle', activity = 'Ejecución cancelada', task_id = NULL, updated_at = now()
      WHERE run_id IN (SELECT id FROM cancelled)
    )
    INSERT INTO events (run_id, agent, kind, title)
    SELECT id, 'system', 'status', ${username + " ha cancelado la ejecución"} FROM cancelled
  `);
}

export async function addUsage(runId: string, model: string, usage: Usage) {
  const cost = costFor(model, usage);
  const [run] = await getDb()
    .update(runs)
    .set({
      inputTokens: sql`${runs.inputTokens} + ${usage.input_tokens}`,
      outputTokens: sql`${runs.outputTokens} + ${usage.output_tokens}`,
      cacheReadTokens: sql`${runs.cacheReadTokens} + ${usage.cache_read_input_tokens ?? 0}`,
      cacheWriteTokens: sql`${runs.cacheWriteTokens} + ${usage.cache_creation_input_tokens ?? 0}`,
      costUsd: sql`${runs.costUsd} + ${cost}`,
    })
    .where(eq(runs.id, runId))
    .returning({ status: runs.status });
  // A response already paid for is still counted when cancellation wins the race.
  return !!run && !isTerminal(run.status);
}

export async function getTask(taskId: string) {
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Tarea ${taskId} no encontrada`);
  return task;
}

export async function getTasks(runId: string) {
  return getDb().select().from(tasks).where(eq(tasks.runId, runId)).orderBy(asc(tasks.position));
}

export async function updateTask(taskId: string, values: Partial<typeof tasks.$inferInsert> & { status?: TaskStatus }) {
  await getDb()
    .update(tasks)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), ne(tasks.status, "cancelled")));
}

// ---------- Virtual file system ----------

/**
 * Seeds a run's site: the sample site, or the parent run's final site when the
 * run iterates on another one. `originalContent` is that starting point, so the
 * diffs and the "Antes" preview show only what this run changed.
 */
export async function initRunFiles(runId: string, parentRunId: string | null = null) {
  const db = getDb();
  const existing = await db.select({ path: runFiles.path }).from(runFiles).where(eq(runFiles.runId, runId));
  if (existing.length > 0) return; // idempotent: the step may be retried
  const start = parentRunId ? await getSiteFiles(parentRunId) : SITE_TEMPLATE;
  if (Object.keys(start).length === 0) throw new Error("La ejecución anterior no tiene archivos de los que partir.");
  await db.insert(runFiles).values(
    Object.entries(start).map(([path, content]) => ({
      runId,
      path,
      content,
      originalContent: content,
      updatedBy: "system" as const,
    })),
  );
}

/** The site as it was when the run started (its parent's result, or the sample site). */
export async function getBaseSiteFiles(runId: string): Promise<SiteFiles> {
  const rows = await getDb()
    .select({ path: runFiles.path, content: runFiles.originalContent })
    .from(runFiles)
    .where(eq(runFiles.runId, runId));
  return Object.fromEntries(rows.flatMap((r) => (r.content === null ? [] : [[r.path, r.content]])));
}

export const MAX_LINEAGE = 20;

/** Only finished runs whose site the agents completed can be iterated on. */
export const ITERABLE_RUN_STATUSES: readonly RunStatus[] = ["completed", "completed_with_failures"];

/**
 * The chain of runs that led to this one, oldest first and ending with the run
 * itself. Bounded so a corrupt cycle can never loop forever.
 */
export async function getRunLineage(runId: string) {
  const result = await getDb().execute<{
    id: string;
    request: string;
    status: RunStatus;
    summary: string | null;
  }>(sql`
    WITH RECURSIVE chain AS (
      SELECT id, parent_run_id, request, status, summary, 0 AS depth FROM runs WHERE id = ${runId}
      UNION ALL
      SELECT r.id, r.parent_run_id, r.request, r.status, r.summary, chain.depth + 1
      FROM runs r JOIN chain ON r.id = chain.parent_run_id
      WHERE chain.depth < ${MAX_LINEAGE}
    )
    SELECT id, request, status, summary FROM chain ORDER BY depth DESC
  `);
  return result.rows;
}

export async function getSiteFiles(runId: string): Promise<SiteFiles> {
  const rows = await getDb()
    .select({ path: runFiles.path, content: runFiles.content })
    .from(runFiles)
    .where(eq(runFiles.runId, runId));
  return Object.fromEntries(rows.map((r) => [r.path, r.content]));
}

export type FileChange = "new" | "modified" | "unchanged";

export async function getFileSummaries(runId: string) {
  const rows = await getDb()
    .select()
    .from(runFiles)
    .where(eq(runFiles.runId, runId))
    .orderBy(asc(runFiles.path));
  return rows.map((row) => ({
    path: row.path,
    bytes: Buffer.byteLength(row.content, "utf8"),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    change: (row.originalContent === null
      ? "new"
      : row.originalContent === row.content
        ? "unchanged"
        : "modified") as FileChange,
  }));
}

export async function writeSiteFile(runId: string, path: string, content: string, agent: AgentName) {
  await getDb().execute(sql`
    WITH active AS (
      SELECT id FROM runs WHERE id = ${runId} AND status = 'running' FOR SHARE
    )
    INSERT INTO run_files (run_id, path, content, updated_by)
    SELECT id, ${path}, ${content}, ${agent} FROM active
    ON CONFLICT (run_id, path) DO UPDATE
    SET content = excluded.content, updated_by = excluded.updated_by, updated_at = now()
  `);
}

// ---------- Conversations ----------

export async function getConversation(taskId: string, agent: AgentName) {
  const [row] = await getDb()
    .select()
    .from(conversations)
    .where(and(eq(conversations.taskId, taskId), eq(conversations.agent, agent)));
  return row ?? null;
}

export async function saveConversation(
  runId: string,
  taskId: string,
  agent: AgentName,
  messages: unknown[],
  options: { turnsDelta?: number; state?: ConversationState } = {},
) {
  const turnsDelta = options.turnsDelta ?? 0;
  await getDb()
    .insert(conversations)
    .values({ runId, taskId, agent, messages, turns: turnsDelta, state: options.state ?? {} })
    .onConflictDoUpdate({
      target: [conversations.taskId, conversations.agent],
      set: {
        messages,
        turns: sql`${conversations.turns} + ${turnsDelta}`,
        ...(options.state ? { state: options.state } : {}),
        updatedAt: new Date(),
      },
    });
}

export async function initRunAgents(runId: string) {
  await getDb()
    .insert(runAgents)
    .values(AGENTS.map((agent) => ({ runId, agent })))
    .onConflictDoNothing();
}
