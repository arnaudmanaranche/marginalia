import { randomUUID } from 'node:crypto';
import { aiEvents } from './ai-events.ts';
import { GITLAB_USERNAME } from './config.ts';
import { RUNNING_VERSION } from './config-team.ts';
import { logger } from './logger.ts';
import { posthogFromEnv } from './posthog.ts';
import type { ToolCall } from './tool-calls.ts';

// Sends what a Claude call did to PostHog AI Observability (ai-events.ts), off unless POSTHOG_KEY and
// POSTHOG_HOST are set (MARGINALIA_TELEMETRY=off turns it off whatever else is set). Fire and forget:
// a slow or unreachable PostHog never delays or fails a run, and a failure of the capture itself is
// only logged at debug. The prompt and the answer go with the call only when MARGINALIA_AI_CONTENT=on.

// What a caller says about the call: its name (a stage, "chat", "doctor"), and the job it belongs to
// so the calls of one job are one trace.
export interface AiContext {
  name: string;
  traceId?: string;
  kind?: string;
  project?: string | null;
}

const argAfter = (args: string[], flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] ?? '' : '');

export function captureAi({ ctx, args, model, result, calls, failed, error = null }: { ctx: AiContext; args: string[]; model: string | null; result: any; calls: ToolCall[]; failed: boolean; error?: string | null }): void {
  try {
    const { client } = posthogFromEnv(process.env);
    if (!client) return;
    const events = aiEvents({
      traceId: ctx.traceId ?? randomUUID(),
      name: ctx.name,
      kind: ctx.kind,
      project: ctx.project,
      reviewer: GITLAB_USERNAME || 'unknown',
      model,
      at: new Date().toISOString(),
      result: result ?? {},
      failed,
      error,
      calls,
      prompt: argAfter(args, '-p'),
      systemPrompt: argAfter(args, '--append-system-prompt'),
      version: RUNNING_VERSION,
      includeContent: process.env.MARGINALIA_AI_CONTENT === 'on',
    });
    void client.send(events).catch((err: unknown) => logger.debug({ err }, 'Could not send the AI observability events'));
  } catch (err) {
    logger.debug({ err }, 'Could not build the AI observability events');
  }
}
