import {
  type AnyPgColumn,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** The three agents of the team. */
export const AGENTS = ["orchestrator", "develop", "testing"] as const;
export type AgentName = (typeof AGENTS)[number];

/** Lifecycle of a whole run (one user request). */
export const RUN_STATUSES = [
  "queued",
  "planning",
  "running",
  "completed",
  "completed_with_failures",
  "rejected",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Lifecycle of one task the orchestrator created. */
export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "testing",
  "changes_requested",
  "done",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** What an agent is doing right now, shown on its card. */
export const AGENT_STATUSES = ["idle", "working", "waiting", "done", "error"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const EVENT_KINDS = [
  "status",
  "plan",
  "thinking",
  "tool",
  "message",
  "test",
  "error",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    request: text("request").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    /** Orchestrator's analysis of the request (why it split it like it did). */
    analysis: text("analysis"),
    /** Orchestrator's closing summary once everything finished. */
    summary: text("summary"),
    error: text("error"),
    model: text("model").notNull(),
    workflowRunId: text("workflow_run_id"),
    /**
     * Run this one iterates on: it starts from that run's final website instead
     * of the sample site. Runs stay immutable; iterating creates a new run.
     */
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => runs.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_created_at_idx").on(t.createdAt), index("runs_parent_run_id_idx").on(t.parentRunId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    /** Instructions the orchestrator handed to Develop. */
    developBrief: text("develop_brief").notNull(),
    /** Acceptance criteria the orchestrator handed to Testing. */
    testPlan: jsonb("test_plan").$type<string[]>().notNull(),
    status: text("status").$type<TaskStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Develop's own summary of its last change. */
    developSummary: text("develop_summary"),
    /** Testing's feedback from the last failed attempt. */
    lastFeedback: text("last_feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_run_idx").on(t.runId, t.position)],
);

/** One verdict from Testing per attempt of a task. */
export const testReports = pgTable(
  "test_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    passed: boolean("passed").notNull(),
    summary: text("summary").notNull(),
    failures: jsonb("failures").$type<TestFailure[]>().notNull(),
    /** Results of the deterministic checks that backed the verdict. */
    checks: jsonb("checks").$type<CheckResult[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("test_reports_task_idx").on(t.taskId, t.attempt)],
);

export const runAgents = pgTable(
  "run_agents",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    agent: text("agent").$type<AgentName>().notNull(),
    status: text("status").$type<AgentStatus>().notNull().default("idle"),
    activity: text("activity").notNull().default("En espera"),
    taskId: uuid("task_id"),
    actions: integer("actions").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.agent] })],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    agent: text("agent").$type<AgentName | "system">().notNull(),
    kind: text("kind").$type<EventKind>().notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_run_idx").on(t.runId, t.id)],
);

/** The run's copy of the target website (a small virtual file system). */
export const runFiles = pgTable(
  "run_files",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    /** Content when the run started, so the UI can show a diff. Null for new files. */
    originalContent: text("original_content"),
    updatedBy: text("updated_by").$type<AgentName | "system">().notNull().default("system"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.path] })],
);

/**
 * Message history of one agent working on one task. Stored append-only and
 * replayed verbatim on every turn, which keeps prompt caching and thinking
 * blocks valid.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    agent: text("agent").$type<AgentName>().notNull(),
    messages: jsonb("messages").$type<unknown[]>().notNull(),
    /** Per-attempt scratch state (e.g. the checks Testing ran in the current attempt). */
    state: jsonb("state").$type<ConversationState>().notNull().default({}),
    turns: integer("turns").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_task_agent_idx").on(t.taskId, t.agent)],
);

export interface ConversationState {
  attempt?: number;
  /** Latest independently executed static and browser checks for this attempt. */
  agentChecks?: CheckResult[];
}

export interface TestFailure {
  criterion: string;
  problem: string;
  suggestion: string;
}

export interface CheckResult {
  description: string;
  passed: boolean;
  detail: string;
  /** "auto" = site-wide audit the system always runs; "agent" = check Testing chose. */
  source: "auto" | "agent";
  /** Position in the task's acceptance plan, starting at 1. Absent in historical reports. */
  criterionId?: number;
  kind?: "static" | "browser";
  stage?: "final";
  /** Executable input retained with the original evidence for final regression checks. */
  definition?: import("@/lib/site/acceptance").CheckDefinition;
}

export type Run = typeof runs.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TestReport = typeof testReports.$inferSelect;
export type RunAgent = typeof runAgents.$inferSelect;
export type RunEvent = typeof events.$inferSelect;
export type RunFile = typeof runFiles.$inferSelect;
