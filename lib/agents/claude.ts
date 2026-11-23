/**
 * Thin wrapper over the Anthropic SDK shared by the three agents.
 *
 * - The model is configurable with AGENT_MODEL (default Claude Opus 5.5).
 * - Server-side refusal fallbacks are on ("default" routing).
 * - Thinking is adaptive with summaries, so the UI can show what each agent is reasoning about.
 * - Errors are translated into Workflow retry semantics: transient errors retry, the rest fail fast.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaJSONOutputFormat,
  BetaMessage,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { FatalError, RetryableError } from "workflow";
import type { AgentName } from "@/lib/db/schema";

export type Effort = "low" | "medium" | "high";

const DEFAULT_EFFORT: Record<AgentName, Effort> = {
  orchestrator: "medium",
  develop: "medium",
  testing: "low",
};

export function agentModel(): string {
  return process.env.AGENT_MODEL?.trim() || "claude-opus-5-5";
}

export function effortFor(agent: AgentName): Effort {
  const value = process.env[`AGENT_EFFORT_${agent.toUpperCase()}`]?.trim();
  return value === "low" || value === "medium" || value === "high" ? value : DEFAULT_EFFORT[agent];
}

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new FatalError("Falta ANTHROPIC_API_KEY en el entorno del servidor.");
  }
  // The SDK reads ANTHROPIC_API_KEY itself; maxRetries covers short blips before Workflow retries the step.
  client ??= new Anthropic({ maxRetries: 2, timeout: 240_000 });
  return client;
}

export interface CallOptions {
  agent: AgentName;
  system: string;
  messages: BetaMessageParam[];
  tools?: BetaToolUnion[];
  outputFormat?: BetaJSONOutputFormat;
  effort?: Effort;
  maxTokens?: number;
  /**
   * Prompt caching for multi-turn conversations (default true). Single-shot calls turn it off:
   * a cache write costs 1.25× the input price and nothing would ever read it back.
   */
  cache?: boolean;
}

export async function callClaude(options: CallOptions): Promise<BetaMessage> {
  try {
    return await getClient().beta.messages.create({
      model: agentModel(),
      max_tokens: options.maxTokens ?? 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: {
        effort: options.effort ?? effortFor(options.agent),
        ...(options.outputFormat ? { format: options.outputFormat } : {}),
      },
      // Caches the growing prefix (system + tools + history) between turns.
      ...(options.cache === false ? {} : { cache_control: { type: "ephemeral" as const } }),
      system: options.system,
      ...(options.tools ? { tools: options.tools } : {}),
      messages: options.messages,
    });
  } catch (error) {
    throw translateError(error);
  }
}

function translateError(error: unknown): Error {
  if (error instanceof FatalError || error instanceof RetryableError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new RetryableError("Límite de peticiones de la API de Claude; reintentando.", { retryAfter: "30s" });
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new FatalError("La clave de la API de Claude no es válida o no tiene permisos.");
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new FatalError(`Petición rechazada por la API de Claude: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new RetryableError("Sin conexión con la API de Claude; reintentando.", { retryAfter: "10s" });
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) return new FatalError("La cuenta de la API de Claude no tiene saldo.");
    return new RetryableError(`Error temporal de la API de Claude (${error.status}); reintentando.`, {
      retryAfter: "15s",
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Concatenated text blocks of a response. */
export function responseText(message: BetaMessage): string {
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
}

/** Readable thinking summaries of a response (empty when the model did not think aloud). */
export function thinkingSummary(message: BetaMessage): string {
  return message.content
    .flatMap((block) => (block.type === "thinking" && block.thinking ? [block.thinking] : []))
    .join("\n\n")
    .trim();
}

export function refusalMessage(message: BetaMessage): string | null {
  if (message.stop_reason !== "refusal") return null;
  const category = message.stop_details?.category;
  return `Claude ha rechazado continuar${category ? ` (categoría: ${category})` : ""}.`;
}
