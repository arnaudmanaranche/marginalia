// The verify tools, spoken over MCP on stdio (newline-delimited JSON-RPC): what the verify stage's
// agent sees as `mcp__verify__run` and `mcp__verify__write_file`. Pure: a message in, an answer out;
// the container and the files are behind the handlers (bin/verify-mcp.ts).

export const SERVER_NAME = 'verify';
export const TOOL_NAMES = [`mcp__${SERVER_NAME}__run`, `mcp__${SERVER_NAME}__write_file`];

const TOOLS = [
  {
    name: 'run',
    description: 'Run one command in the disposable runner, from the project root. It must be a step of the approved recipe, optionally followed by arguments (a file or a test name); no chaining, pipes or redirects. Returns the exit code and the output.',
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
  {
    name: 'write_file',
    description: 'Create a NEW file in the runner\'s copy of the project (a throwaway test or script that reproduces the finding). An existing file cannot be changed. The path is relative to the project root.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
];

export interface Handlers {
  run: (command: string) => Promise<{ code: number; output: string; timedOut: boolean; refused?: string }>;
  writeFile: (path: string, content: string) => Promise<{ ok: boolean; error?: string }>;
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], isError });

async function callTool(name: string, args: any, h: Handlers) {
  if (name === 'run') {
    const r = await h.run(String(args?.command ?? ''));
    if (r.refused) return text(`Refused: ${r.refused}.`, true);
    if (r.timedOut) return text(`Out of time: the verification is over. Output so far:\n${r.output}`, true);
    return text(`exit code ${r.code}\n${r.output}`, r.code !== 0 && !r.output);
  }
  if (name === 'write_file') {
    const r = await h.writeFile(String(args?.path ?? ''), String(args?.content ?? ''));
    return r.ok ? text(`Created ${args.path}.`) : text(`Not created: ${r.error}.`, true);
  }
  return text(`No tool named ${name}.`, true);
}

const reply = (id: unknown, result: object) => ({ jsonrpc: '2.0', id, result });
const failure = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

// null for a notification: nothing is answered.
export async function handleMessage(msg: any, h: Handlers) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return failure(msg?.id ?? null, -32600, 'not a JSON-RPC request');
  if (msg.id === undefined || msg.id === null) return null;
  switch (msg.method) {
    case 'initialize':
      return reply(msg.id, { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: '1.0.0' } });
    case 'ping': return reply(msg.id, {});
    case 'tools/list': return reply(msg.id, { tools: TOOLS });
    case 'tools/call': return reply(msg.id, await callTool(msg.params?.name, msg.params?.arguments, h));
    default: return failure(msg.id, -32601, `no method ${msg.method}`);
  }
}
