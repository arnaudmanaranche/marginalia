// How a headless `claude -p` run is invoked and how its output is read. Pure, so
// the runner (claude-runner.mjs) stays about the flow.

// The run needs the connectors of your logged-in claude.ai account, not
// API-key billing, so ANTHROPIC_API_KEY (loaded from .env by dotenv) must
// never reach this subprocess even if it's still set. MR_REVIEW_BOT=1 stays
// for commands written against the original contract.
export function claudeEnv(env) {
  const { ANTHROPIC_API_KEY: _unused, ...rest } = env;
  return { ...rest, MR_REVIEW_BOT: '1' };
}

export function claudeArgs({ prompt, tools, systemPrompt }) {
  return [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--allowedTools', tools.join(' '),
    '--append-system-prompt', systemPrompt,
  ];
}

// The final `result` event of the run carries the final message, with the
// run's cost and usage. Anything else is treated as plain text.
export function parseRunOutput(stdout) {
  try {
    const out = JSON.parse(stdout);
    if (typeof out?.result !== 'string') return { text: stdout, stats: null };
    return {
      text: out.result,
      stats: {
        costUsd: Number(out.total_cost_usd ?? 0),
        outputTokens: out.usage?.output_tokens ?? 0,
        turns: out.num_turns ?? 0,
        durationMs: out.duration_ms ?? null,
      },
    };
  } catch {
    return { text: stdout, stats: null };
  }
}
