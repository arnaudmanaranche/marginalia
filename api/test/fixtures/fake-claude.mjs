#!/usr/bin/env node
// A stand-in for `claude -p` in the staged pipeline tests: answers each stage from its prompt, in
// stream-json, as the real CLI does. The second chapter first answers off contract, to exercise the
// correction round (--resume). A fix stage really edits a file, and commits it although told not
// to, as an agent may: the bot folds that commit into its own. A conflict stage settles the file.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const prompt = args[args.indexOf('-p') + 1] ?? '';
const resumed = args.includes('--resume');
const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const step = (name, input) => say({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const answer = (value) => say({ type: 'result', result: typeof value === 'string' ? value : `Done.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``, session_id: 'sess-1', total_cost_usd: 0.01, num_turns: 2, usage: { output_tokens: 100 } });

if (resumed) {
  answer({ findings: [], verified: 'The tests cover the rounding.' });
} else if (prompt.includes('Your stage: map the change')) {
  step('Bash', { command: 'git diff b HEAD -- src/pricing.ts' });
  answer({
    overview: { before: 'A coupon typed at checkout was ignored.', after: 'A coupon takes its percentage off the total.' },
    risk: { level: 'medium', rationale: 'It changes how totals are computed.', factors: ['payments'] },
    chapters: [
      { title: 'A coupon takes its percentage off', summary: 'The total applies the coupon.', files: ['src/pricing.mjs'], check: 'The total never goes below zero.' },
      { title: 'Tests for the coupon', summary: 'Covers the percentage.', files: ['src/pricing.test.mjs'], check: 'A coupon larger than the order.' },
    ],
  });
} else if (prompt.includes('Your stage: review chapter 1')) {
  step('Read', { file_path: '/w/src/pricing.mjs' });
  answer({ findings: [{ id: 'neg-total', severity: 'important', title: 'The total can go below zero', path: 'src/pricing.mjs', line: 2, body: 'A 150% coupon gives a negative total.', comment: 'A coupon above 100% makes the total negative. I would clamp it at zero.' }], verified: 'Rounding is right.' });
} else if (prompt.includes('Your stage: review chapter 2')) {
  answer('I looked and everything is fine.');
} else if (prompt.includes('Your stage: weigh each open reviewer comment')) {
  const ids = [...prompt.matchAll(/### Thread ([0-9a-f]+)/g)].map((m) => m[1]);
  answer({ threads: [
    { thread: ids[0], verdict: 'fix', why: 'A real gap.', plan: 'Clamp the total at zero.' },
    { thread: ids[1], verdict: 'answer', why: 'A question.', reply: 'It reads the coupon from the cart, so there is one place to check.' },
  ] });
} else if (prompt.includes('Your stage: fix one reviewer comment')) {
  step('Edit', { file_path: '/w/src/pricing.mjs' });
  appendFileSync('src/pricing.mjs', 'export const clamp = (t) => Math.max(0, t);\n');
  execFileSync('git', ['add', '-A']);
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fix: clamp the total']);
  answer({ changed: true, what: 'Clamped the total at zero.', reply: 'Good catch, the total is clamped at zero now.' });
} else if (prompt.includes('Your stage: settle the conflicts')) {
  step('Read', { file_path: '/w/src/pricing.mjs' });
  writeFileSync('src/pricing.mjs', 'export const total = (items, coupon = 0) => items.reduce((a, b) => a + b, 0) * (1 - coupon / 100) + 0;\nexport const clamp = (t) => Math.max(0, t);\n');
  answer({ settled: true, how: 'develop added a shipping fee, the MR a coupon: kept both.' });
} else {
  answer('unknown stage');
}
