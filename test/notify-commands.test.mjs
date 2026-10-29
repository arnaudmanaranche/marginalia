import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyCommands, openCommand } from '../api/src/notify-commands.mjs';

const base = { title: 'Review "ready"', message: 'MR !12', logoPath: '/l/logo.png' };

test('macOS tries terminal-notifier (clickable), then osascript', () => {
  const [first, second] = notifyCommands({ ...base, platform: 'darwin', click: 'echo hi' });
  assert.equal(first[0], 'terminal-notifier');
  assert.deepEqual(first[1].slice(-2), ['-execute', 'echo hi']);
  assert.ok(first[1].includes('-appIcon'));
  assert.equal(second[0], 'osascript');
});

test('title and message reach osascript as arguments, never inside the script', () => {
  const [, [, args]] = notifyCommands({ ...base, platform: 'darwin' });
  assert.deepEqual(args.slice(-2), ['Review "ready"', 'MR !12']);
  assert.ok(!args.slice(0, -2).some((a) => a.includes('Review')));
});

test('without a click action terminal-notifier gets no -execute', () => {
  const [[, args]] = notifyCommands({ ...base, platform: 'darwin' });
  assert.ok(!args.includes('-execute'));
});

test('Linux uses notify-send with the logo as icon', () => {
  const cmds = notifyCommands({ ...base, platform: 'linux' });
  assert.equal(cmds.length, 1);
  assert.deepEqual(cmds[0], ['notify-send', ['--app-name=marginalia', '--icon=/l/logo.png', 'Review "ready"', 'MR !12']]);
});

test('other platforms have no notifier: log only', () => {
  assert.deepEqual(notifyCommands({ ...base, platform: 'win32' }), []);
});

test('the click command opens the studio, else VS Code, with the right opener per platform', () => {
  const args = { openPath: '/r/.claude/reviews/feat-x.md', port: '4477', vscodeBin: 'code' };
  const mac = openCommand({ ...args, platform: 'darwin' });
  assert.match(mac, /curl -sf -m 1 -o \/dev\/null http:\/\/127\.0\.0\.1:4477\/api\/reviews && open 'http:\/\/localhost:4477\/#\/feat-x' \|\| code '\/r\/\.claude\/reviews\/feat-x\.md'/);
  assert.match(openCommand({ ...args, platform: 'linux' }), /&& xdg-open /);
});

test('a quote in the path cannot break out of the click command', () => {
  const cmd = openCommand({ openPath: "/r/it's.md", port: '1', vscodeBin: 'code', platform: 'linux' });
  assert.match(cmd, /code '\/r\/it'\\''s\.md'/);
});
