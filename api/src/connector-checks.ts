import { CONNECTORS } from './connector-tools.ts';

// What `claude mcp list` says of the connectors a run reads through, as preflight checks
// ({ label, level, detail }, see preflight-checks.ts). Pure: tested on the CLI's own output.
// A missing connector never stops a run: the agent goes without that source, and says so.

// One line per server: "<name>: <url> - ✔ Connected", "- ! Needs authentication", "- ✘ Failed …".
function statusOf(stdout: string, name: string) {
  const line = stdout.split('\n').find((l) => l.startsWith(`${name}: `));
  if (!line) return 'absent';
  if (/✔|connected/i.test(line) && !/failed/i.test(line)) return 'connected';
  if (/needs authentication/i.test(line)) return 'unauthenticated';
  return 'failed';
}

const DETAIL = {
  absent: (name: string) => `${name} is not set up on this account: the agent goes without it`,
  unauthenticated: (name: string) => `${name} needs a login (\`claude\`, then /mcp): the agent goes without it`,
  failed: (name: string) => `${name} does not answer: the agent goes without it`,
};

/** @param {{ stdout?: string, error?: string | null }} probe */
export function connectorChecks({ stdout = '', error = null }: { stdout?: string; error?: string | null }) {
  if (error && !stdout) return [{ label: 'Connectors', level: 'warn' as const, detail: `could not list them (${error.split('\n')[0].slice(0, 200)}): going on` }];
  return CONNECTORS.map(({ source, name }) => {
    const status = statusOf(stdout, name);
    const label = `${source} connector`;
    return status === 'connected'
      ? { label, level: 'ok' as const, detail: `${name} is connected (read-only)` }
      : { label, level: 'warn' as const, detail: DETAIL[status](name) };
  });
}
