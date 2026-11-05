import { describeStep } from './step-text.ts';
import { toolOf } from './tool-label.ts';

// The tool calls of one Claude run, each paired with its result: when it started and ended, whether
// it worked, and what it was, in the words the studio uses for a step. Pure: events and the clock
// come in, calls come out. `claude -p --output-format stream-json` sends a `tool_use` block in an
// assistant event, and later its `tool_result` (same id) in a user event.

export interface ToolCall {
  id: string;
  tool: string;          // short name for a chip: `read`, `git`, `jira.search` (tool-label.ts)
  what: string;          // the step's words: `Reading app.ts`, `$ git diff …`
  sub: boolean;          // taken by a sub-agent the run started
  startedAt: string;
  endedAt: string | null;
  ms: number | null;
  ok: boolean | null;    // null while it runs
  error: string | null;  // the first line of a failed result, short; it stays on this machine
}

const ERROR_MAX = 200;

const textOf = (content: unknown): string => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join(' ') : '');

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, ERROR_MAX) ?? '';

export function createCallTracker(now: () => number = Date.now) {
  const open = new Map<string, ToolCall>();
  const all: ToolCall[] = [];
  return {
    // The calls this event started or ended, in the order they did.
    feed(event: any): ToolCall[] {
      const changed: ToolCall[] = [];
      const blocks = Array.isArray(event?.message?.content) ? event.message.content : [];
      if (event?.type === 'assistant') {
        for (const block of blocks) {
          if (block?.type !== 'tool_use' || typeof block.id !== 'string') continue;
          const call: ToolCall = {
            id: block.id, tool: toolOf(block) ?? 'tool', what: describeStep(block) ?? block.name ?? 'tool',
            sub: Boolean(event.parent_tool_use_id), startedAt: new Date(now()).toISOString(),
            endedAt: null, ms: null, ok: null, error: null,
          };
          open.set(call.id, call);
          all.push(call);
          changed.push(call);
        }
      }
      if (event?.type === 'user') {
        for (const block of blocks) {
          const call = block?.type === 'tool_result' ? open.get(block.tool_use_id) : undefined;
          if (!call) continue;
          const end = now();
          Object.assign(call, {
            endedAt: new Date(end).toISOString(), ms: end - Date.parse(call.startedAt), ok: !block.is_error,
            error: block.is_error ? firstLine(textOf(block.content)) || 'The tool gave an error' : null,
          });
          open.delete(call.id);
          changed.push({ ...call });
        }
      }
      return changed;
    },
    // Every call so far; the ones still open when the run ends never got a result.
    calls: () => all.map((c) => ({ ...c })),
  };
}
