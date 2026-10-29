import { spawn } from 'node:child_process';
import { basename } from 'node:path';

// One readable line per step of a run, for the studio's live panel: what the
// run says it is doing, and the tools it calls.
export function describeStep(block) {
  if (block.type === 'text') {
    const sentence = block.text.trim().split(/(?<=[.!?:])\s|\n/)[0]?.trim();
    return sentence ? sentence.slice(0, 140) : null;
  }
  if (block.type !== 'tool_use') return null;
  const input = block.input ?? {};
  const name = block.name.replace(/^mcp__[^_]+(?:-[^_]+)*__/, '');
  switch (name) {
    case 'Bash': return `$ ${String(input.command ?? '').split('\n')[0].slice(0, 120)}`;
    case 'Read': return `Reading ${basename(String(input.file_path ?? ''))}`;
    case 'Grep': return `Searching for "${String(input.pattern ?? '').slice(0, 60)}"`;
    case 'Glob': return `Listing ${String(input.pattern ?? '').slice(0, 60)}`;
    case 'Write':
    case 'Edit': return `Writing ${basename(String(input.file_path ?? ''))}`;
    case 'Skill': return `Loading ${input.skill ?? input.name ?? 'a skill'}`;
    case 'Agent': return `Starting a sub-agent: ${String(input.description ?? '').slice(0, 80)}`;
    case 'navigate_page':
    case 'new_page': return input.url ? `Opening ${input.url}` : 'Reloading the page';
    case 'click': return 'Clicking on the page';
    case 'fill':
    case 'fill_form':
    case 'type_text': return 'Typing in a field';
    case 'take_screenshot': return 'Taking a screenshot';
    case 'take_snapshot': return 'Reading the page';
    case 'wait_for': return 'Waiting for the page';
    default: return name;
  }
}

// `claude -p --output-format stream-json --verbose` prints one JSON event per
// line. Each assistant step goes to onStep, with `sub` when a sub-agent took it (its events carry
// the id of the Agent call that started it); every raw line goes to onEvent. The final "result"
// event is returned as the JSON the run would have printed with --output-format json.
/**
 * @param {(step: string, info: { sub: boolean }) => void} [onStep]
 * @param {(line: string) => void} [onEvent]
 */
export function runStreaming(
  bin: string,
  args: string[],
  options: Record<string, any>,
  onStep: (step: string, info: { sub: boolean }) => void = () => {},
  onEvent: (line: string) => void = () => {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    /** @type {any} */
    let result: any = null;
    const handle = (line) => {
      if (line.trim()) onEvent(line);
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === 'result') result = event;
      if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) {
          const step = describeStep(block);
          if (step) onStep(step, { sub: Boolean(event.parent_tool_use_id) });
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
      if (code !== 0) {
        reject(new Error(`${bin} exited with code ${code}: ${stderr.slice(0, 500) || result?.result?.slice(0, 500) || ''}`));
        return;
      }
      resolve({ stdout: result ? JSON.stringify(result) : '', stderr });
    });
  });
}
