import type { RunState } from "@/lib/runs/queries";

/** What a value looks like after JSON.stringify + JSON.parse. */
type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type RunJson = Jsonify<Omit<RunState["run"], "createdBy">>;
export type AgentJson = Jsonify<RunState["agents"][number]>;
export type TaskJson = Jsonify<RunState["tasks"][number]>;
export type EventJson = Jsonify<RunState["events"][number]>;
export type FileJson = Jsonify<RunState["files"][number]>;
export type LineageJson = Jsonify<RunState["lineage"][number]>;
export type ChildRunJson = Jsonify<RunState["children"][number]>;

export interface RunStateJson {
  run: RunJson;
  agents: AgentJson[];
  tasks: TaskJson[];
  events: EventJson[];
  files: FileJson[];
  lineage: LineageJson[];
  children: ChildRunJson[];
  canCancel: boolean;
  /** Finished with a usable site, so a new run can build on it. */
  iterable: boolean;
  /** iterable, and the viewer is signed in. */
  canIterate: boolean;
}
