/** Database helpers shared by the agents and the API. */
import { and, asc, eq, sql } from "drizzle-orm";
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
    .where(and(eq(runAgents.runId, runId), eq(runAgents.agent, agent)));
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
  await getDb()
    .update(runs)
    .set({ status, ...extra })
    .where(eq(runs.id, runId));
}

const TERMINAL: RunStatus[] = ["completed", "completed_with_failures", "rejected", "failed", "cancelled"];

export function isTerminal(status: RunStatus) {
  return TERMINAL.includes(status);
}

export async function addUsage(runId: string, model: string, usage: Usage) {
  const cost = costFor(model, usage);
  await getDb()
    .update(runs)
    .set({
      inputTokens: sql`${runs.inputTokens} + ${usage.input_tokens}`,
      outputTokens: sql`${runs.outputTokens} + ${usage.output_tokens}`,
      cacheReadTokens: sql`${runs.cacheReadTokens} + ${usage.cache_read_input_tokens ?? 0}`,
      cacheWriteTokens: sql`${runs.cacheWriteTokens} + ${usage.cache_creation_input_tokens ?? 0}`,
      costUsd: sql`${runs.costUsd} + ${cost}`,
    })
    .where(eq(runs.id, runId));
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
    .where(eq(tasks.id, taskId));
}

// ---------- Virtual file system ----------

export async function initRunFiles(runId: string) {
  const db = getDb();
  const existing = await db.select({ path: runFiles.path }).from(runFiles).where(eq(runFiles.runId, runId));
  if (existing.length > 0) return; // idempotent: the step may be retried
  await db.insert(runFiles).values(
    Object.entries(SITE_TEMPLATE).map(([path, content]) => ({
      runId,
      path,
      content,
      originalContent: content,
      updatedBy: "system" as const,
    })),
  );
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
  await getDb()
    .insert(runFiles)
    .values({ runId, path, content, originalContent: null, updatedBy: agent })
    .onConflictDoUpdate({
      target: [runFiles.runId, runFiles.path],
      set: { content, updatedBy: agent, updatedAt: new Date() },
    });
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
