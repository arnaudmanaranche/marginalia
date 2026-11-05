import { spawn } from 'node:child_process';
import { captureAi, type AiContext } from './ai-observability.ts';
import { describeStep } from './step-text.ts';
import { toolOf } from './tool-label.ts';
import { createCallTracker, type ToolCall } from './tool-calls.ts';

// `claude -p --output-format stream-json --verbose` prints one JSON event per
// line. Each assistant step goes to onStep, with `sub` when a sub-agent took it (its events carry
// the id of the Agent call that started it); every raw line goes to onEvent; each tool call goes to
// onCall when it starts and again when its result comes (tool-calls.ts). The final "result" event is
// returned as the JSON the run would have printed with --output-format json, with the model.
/**
 * @param {(step: string, info: { sub: boolean, tool: string | null }) => void} [onStep]
 * @param {(line: string) => void} [onEvent]
 */
export function runStreaming(
  bin: string,
  args: string[],
  options: Record<string, any>,
  onStep: (step: string, info: { sub: boolean; tool: string | null }) => void = () => {},
  onEvent: (line: string) => void = () => {},
  ai: AiContext = { name: 'claude' },
  onCall: (call: ToolCall) => void = () => {},
): Promise<{ stdout: string; stderr: string; model: string | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    /** @type {any} */
    let result: any = null;
    const calls = createCallTracker();
    let model: string | null = null;
    const handle = (line: string) => {
      if (line.trim()) onEvent(line);
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === 'result') result = event;
      for (const call of calls.feed(event)) onCall(call);
      if (event.type === 'assistant') {
        if (typeof event.message?.model === 'string') model = event.message.model;
        for (const block of event.message?.content ?? []) {
          const tool = toolOf(block);
          const step = describeStep(block);
          if (step) onStep(step, { sub: Boolean(event.parent_tool_use_id), tool });
        }
      }
    };
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(handle);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (buffer) handle(buffer);
      const error = code !== 0 ? `${bin} exited with code ${code}: ${stderr.slice(0, 500) || result?.result?.slice(0, 500) || ''}` : null;
      captureAi({ ctx: ai, args, model, result, calls: calls.calls(), failed: code !== 0, error });
      if (error) return reject(new Error(error));
      resolve({ stdout: result ? JSON.stringify(result) : '', stderr, model });
    });
  });
}
