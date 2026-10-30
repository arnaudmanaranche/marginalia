#!/usr/bin/env node
// A stand-in for `claude -p` in a command run (the project's own slash command): writes the report
// and the findings file the way the mode says, and records the arguments it was started with.
import { writeFileSync } from 'node:fs';

const mode = process.env.FAKE_AGENT_MODE;
writeFileSync(process.env.FAKE_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
const say = (text) => process.stdout.write(`${JSON.stringify({ type: 'result', result: text, session_id: 's', total_cost_usd: 0.02, num_turns: 3, usage: { output_tokens: 50 } })}\n`);

const review = {
  verdict: 'REQUEST_CHANGES',
  summary: 'A coupon above 100% makes the total negative.',
  overview: { before: 'A coupon was ignored.', after: 'A coupon takes its percentage off.' },
  tour: [{ title: 'A coupon takes its percentage off', summary: 'Check the floor.', files: ['src/pricing.mjs'], findings: ['neg-total'] }],
  findings: [{ id: 'neg-total', severity: 'important', title: 'Total can go negative', path: 'src/pricing.mjs', line: 1, body: 'A 150% coupon.', comment: 'Clamp at zero.' }],
};
if (mode === 'valid') {
  writeFileSync('.marginalia-report.md', '# Review\n\nOne finding.\n');
  writeFileSync('.marginalia-findings.json', JSON.stringify(review));
} else if (mode === 'no-overview') {
  writeFileSync('.marginalia-report.md', '# Review\n\nOne finding.\n');
  writeFileSync('.marginalia-findings.json', JSON.stringify({ ...review, overview: undefined }));
}
say(mode === 'garbage' ? 'I reviewed the change at length. '.repeat(20) : 'Done.');
