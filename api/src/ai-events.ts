import { eventUuid, errorKind } from './run-events.ts';

// PostHog AI Observability events for one Claude call (a `claude -p` run): a `$ai_generation` with the
// model, tokens, cost and latency, and a `$ai_span` per tool it used. Pure, so what leaves the machine
// is tested. The call's trace is its JOB's (a review job makes several calls: one trace, a generation
// per stage); content (the prompt and the answer) only when `includeContent` is on, never a tool's
// input or output.
const CONTENT_MAX = 100_000;
const clip = (text: string) => (text.length > CONTENT_MAX ? `${text.slice(0, CONTENT_MAX)}\n[cut at ${CONTENT_MAX} characters]` : text);
// PostHog ids allow a limited alphabet.
export const aiId = (value: string) => value.replace(/[^A-Za-z0-9_~.@()!'|:-]/g, '_');

export interface AiCall {
  traceId: string;
  name: string;
  kind?: string;
  project?: string | null;
  reviewer: string;
  model: string | null;
  at: string;
  result: any;
  failed: boolean;
  error?: string | null;
  tools: string[];
  prompt: string;
  systemPrompt: string;
  includeContent: boolean;
  version?: string;
}

const number = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);

/** @returns the events of one call, generation first. */
export function aiEvents(call: AiCall) {
  const { result, traceId } = call;
  const sessionId = typeof result?.session_id === 'string' ? aiId(result.session_id) : null;
  const usage = result?.usage ?? {};
  const base = {
    $process_person_profile: false,
    $lib: 'marginalia',
    marginalia_version: call.version ?? null,
    marginalia_kind: call.kind ?? null,
    marginalia_project: call.project ?? null,
    $ai_trace_id: aiId(traceId),
    $ai_session_id: sessionId,
  };
  const distinct_id = `marginalia:${call.reviewer}`;
  const generation = {
    event: '$ai_generation',
    distinct_id,
    uuid: eventUuid(`ai|${traceId}|${call.name}|${call.at}`),
    timestamp: call.at,
    properties: {
      ...base,
      $ai_span_name: call.name,
      $ai_model: call.model ?? 'claude-code',
      $ai_provider: 'anthropic',
      $ai_input_tokens: number(usage.input_tokens),
      $ai_output_tokens: number(usage.output_tokens),
      $ai_cache_read_input_tokens: number(usage.cache_read_input_tokens),
      $ai_cache_creation_input_tokens: number(usage.cache_creation_input_tokens),
      $ai_total_cost_usd: number(result?.total_cost_usd),
      $ai_latency: number(result?.duration_ms) === undefined ? undefined : result.duration_ms / 1000,
      marginalia_turns: number(result?.num_turns),
      marginalia_tool_calls: call.tools.length,
      ...(call.failed && { $ai_is_error: true, $ai_error: errorKind(call.error ?? '') }),
      ...(call.includeContent && {
        $ai_input: [{ role: 'system', content: clip(call.systemPrompt) }, { role: 'user', content: clip(call.prompt) }],
        ...(!call.failed && typeof result?.result === 'string' && { $ai_output_choices: [{ role: 'assistant', content: clip(result.result) }] }),
      }),
    },
  };
  const spans = call.tools.map((tool, i) => ({
    event: '$ai_span',
    distinct_id,
    uuid: eventUuid(`ai|${traceId}|${call.name}|${call.at}|span|${i}`),
    timestamp: call.at,
    properties: { ...base, $ai_span_id: aiId(`${traceId}:${call.name}:${i}`), $ai_parent_id: aiId(traceId), $ai_span_name: tool },
  }));
  return [generation, ...spans];
}
