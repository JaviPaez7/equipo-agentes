import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { SQLWrapper } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { reserveRun } from "@/lib/runs/limits";
import { addUsage, cancelRun, getRun, getTasks, setAgent, setRunStatus, updateTask, writeSiteFile } from "@/lib/runs/repo";
import { planTasks } from "@/lib/agents/orchestrator";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/agents/claude", () => ({
  agentModel: () => "test",
  callClaude: async () => ({ usage: { input_tokens: 10, output_tokens: 5 } }),
  responseText: () => JSON.stringify({
    analysis: "Una tarea verificable", rejected_reason: null,
    tasks: [{ title: "Horario", develop_brief: "Añadir el horario", test_plan: ["Muestra el horario"] }],
  }),
  thinkingSummary: () => "", refusalMessage: () => null,
}));

// Set TEST_LOCAL_POSTGRES_URL to a local PostgreSQL database with CREATE SCHEMA rights.
// Each suite only writes its own randomly named schema; it never reads DATABASE_URL.
const url = process.env.TEST_LOCAL_POSTGRES_URL;
if (url && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("TEST_LOCAL_POSTGRES_URL must point to localhost.");
}

describe.skipIf(!url)("PostgreSQL run admission and cancellation", () => {
  const namespace = "run_test_" + randomUUID().replaceAll("-", "");
  let pool: Pool;
  let control: Pool;
  const users = Array.from({ length: 4 }, () => randomUUID());

  beforeAll(async () => {
    control = new Pool({ connectionString: url });
    await control.query(`CREATE SCHEMA "${namespace}"`);
    pool = new Pool({ connectionString: url, options: `-c search_path=${namespace},public` });
    const migration = await readFile(new URL("../drizzle/0000_init.sql", import.meta.url), "utf8");
    await pool.query(migration.replaceAll('"public".', `"${namespace}".`));
    for (const id of users) {
      await pool.query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, 'test')", [id, id]);
    }
    const db = drizzle(pool, { schema });
    // Neon HTTP runs its batch in one transaction. Here each invocation has its
    // own local PostgreSQL connection, so concurrent requests contend for real locks.
    const local = Object.assign(db, {
      batch: (statements: SQLWrapper[]) => db.transaction(async (tx) => {
        const results = [];
        for (const query of statements) results.push(await tx.execute(query));
        return results;
      }),
    });
    vi.mocked(getDb).mockReturnValue(local as unknown as ReturnType<typeof getDb>);
  });

  beforeEach(async () => {
    vi.unstubAllEnvs();
    await pool.query("DELETE FROM runs");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (pool) await pool.end();
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
      await control.end();
    }
  });

  it("allows one active run from simultaneous submissions on the same account", async () => {
    const results = await Promise.all(users.map(() => reserveRun(users[0], "Nueva página de contacto", "test")));
    expect(results.filter((r) => "id" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r && r.error.includes("en marcha"))).toHaveLength(users.length - 1);
  });

  it("reserves the final global slot and the per-user 24-hour allowance atomically", async () => {
    vi.stubEnv("MAX_RUNS_PER_DAY", "1");
    const results = await Promise.all(users.map((user) => reserveRun(user, "Nueva página de contacto", "test")));
    expect(results.filter((r) => "id" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r && r.error.includes("límite diario"))).toHaveLength(users.length - 1);
    vi.stubEnv("MAX_RUNS_PER_DAY", "6");
    vi.stubEnv("MAX_RUNS_PER_USER_PER_DAY", "1");
    const { rows: [run] } = await pool.query("SELECT id, created_by FROM runs");
    await cancelRun(run.id, "Evaluador");
    expect(await reserveRun(run.created_by, "Petición nueva", "test")).toEqual({
      error: expect.stringContaining("últimas 24 horas"),
    });
    await pool.query("UPDATE runs SET created_at = now() - interval '25 hours'");
    expect(await reserveRun(run.created_by, "Petición nueva", "test")).toEqual({ id: expect.any(String) });
  });

  it("keeps cancellation terminal and discards late work while recording the billed response", async () => {
    const { rows: [run] } = await pool.query(
      "INSERT INTO runs (request, model, status) VALUES ('Nueva página', 'test', 'running') RETURNING id",
    );
    const { rows: [task] } = await pool.query(
      `INSERT INTO tasks (run_id, position, title, develop_brief, test_plan, status)
       VALUES ($1, 1, 'Formulario', 'Añadirlo', '[]', 'testing') RETURNING id`, [run.id],
    );
    await pool.query("INSERT INTO run_agents (run_id, agent, status) VALUES ($1, 'testing', 'working')", [run.id]);
    await Promise.all([cancelRun(run.id, "Evaluador"), cancelRun(run.id, "Evaluador")]);
    expect(await setRunStatus(run.id, "running")).toBe(false);
    expect(await setRunStatus(run.id, "completed")).toBe(false);
    expect(await addUsage(run.id, "test", { input_tokens: 10, output_tokens: 5 })).toBe(false);
    await updateTask(task.id, { status: "done" });
    await setAgent(run.id, "testing", "working", "No debe reactivarse");
    await writeSiteFile(run.id, "tarde.html", "Cambios tardíos", "develop");
    expect(await getRun(run.id)).toMatchObject({ status: "cancelled", inputTokens: 10, outputTokens: 5 });
    expect((await pool.query("SELECT status FROM tasks")).rows).toEqual([{ status: "cancelled" }]);
    expect((await pool.query("SELECT status FROM run_agents")).rows).toEqual([{ status: "idle" }]);
    expect((await pool.query("SELECT * FROM events")).rowCount).toBe(1);
    expect((await pool.query("SELECT * FROM run_files")).rowCount).toBe(0);
  });

  it("publishes the plan and its tasks together and reuses them on a retry", async () => {
    const reserved = await reserveRun(users[0], "Añade el horario", "test");
    if ("error" in reserved) throw new Error(reserved.error);
    const plan = await planTasks(reserved.id);
    expect(plan.taskIds).toHaveLength(1);
    expect(await getTasks(reserved.id)).toMatchObject([{ title: "Horario", testPlan: ["Muestra el horario"] }]);
    expect(await getRun(reserved.id)).toMatchObject({ status: "running", analysis: "Una tarea verificable" });
    expect(await planTasks(reserved.id)).toEqual(plan);
  });
});
