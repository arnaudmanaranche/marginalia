import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_BIN, ROOT } from './config.ts';
import { claudeArgs, parseRunOutput } from './claude-cli.ts';
import { DOCTOR_TOOLS, doctorPrompt, parseDoctorAnswer } from './doctor-prompt.ts';
import { logger } from './logger.ts';
import { runStreaming } from './progress.ts';
import { listTraces, readRunPart, readTrace, readTranscript, saveRunPart } from './run-journal.ts';
import { runEnv, runSettings } from './run-settings.ts';
import { appendRun } from './runlog.ts';

const TIMEOUT_MS = 10 * 60_000;
const SYSTEM = "You are Marginalia's doctor. Marginalia is a bot that reviews GitLab merge requests with headless Claude runs. You diagnose one failed run from its trace and the code. You only read; you change nothing.";

// Diagnoses being written, one per run at most.
const running = new Set();

// Where the instructions a run followed live: the reviewed repo's .claude, in the user's clone and
// in the bot's worktree.
const agentDirs = (project: any) => [project.repoPath, project.worktreeDir].filter(Boolean).map((d) => join(d, '.claude')).filter((d) => existsSync(d));

// A failure the doctor already explained on one of the last runs of this review (same error):
// its diagnosis is reused rather than paid for again, the MR being retried every poll.
async function sameAsBefore(project: any, fileSlug: string, trace: any) {
  const key = String(trace.error ?? '').slice(0, 300);
  for (const r of (await listTraces(project.key, fileSlug, { limit: 4 })).filter((r) => r.id !== trace.id)) {
    if (r.outcome !== 'failed' || String(r.error ?? '').slice(0, 300) !== key) continue;
    const found = await readRunPart(project.key, fileSlug, r.id, 'doctor');
    if (found?.state === 'done') return { ...found, sameAs: r.id };
  }
  return null;
}

// Starts the doctor on a failed run, in the background; its answer lands in <id>.doctor.json.
// `auto`: started by the poller after a failure, so a repeat of a known one reuses its diagnosis.
/** @param {{ project: any, fileSlug: string, runId: string, auto?: boolean }} input */
export async function startDoctor({ project, fileSlug, runId, auto = false }: { project: any; fileSlug: string; runId: string; auto?: boolean }) {
  const key = `${project.key}/${fileSlug}/${runId}`;
  if (running.has(key)) return { ok: false, status: 409, error: 'the doctor is already on this run' };
  const trace = await readTrace(project.key, fileSlug, runId);
  if (!trace) return { ok: false, status: 404, error: 'no such run' };
  if (trace.outcome !== 'failed') return { ok: false, status: 409, error: 'this run did not fail' };
  if (auto) {
    const known = await sameAsBefore(project, fileSlug, trace);
    if (known) {
      await saveRunPart(project.key, fileSlug, runId, 'doctor', known);
      return { ok: true };
    }
  }
  running.add(key);
  await saveRunPart(project.key, fileSlug, runId, 'doctor', { state: 'running', startedAt: new Date().toISOString() });
  void diagnose(project, fileSlug, trace).finally(() => running.delete(key));
  return { ok: true };
}

async function diagnose(project: any, fileSlug: string, trace: any) {
  const startedAt = new Date().toISOString();
  const save = (data: any) => saveRunPart(project.key, fileSlug, trace.id, 'doctor', { startedAt, endedAt: new Date().toISOString(), ...data });
  try {
    const dirs = agentDirs(project);
    const prompt = doctorPrompt({ trace, transcript: await readTranscript(project.key, fileSlug, trace.id, { maxBytes: 60_000 }), sourceDir: ROOT, agentDirs: dirs });
    const args = [...claudeArgs({ prompt, tools: DOCTOR_TOOLS, systemPrompt: SYSTEM, settings: runSettings(project) }), ...dirs.flatMap((d) => ['--add-dir', d])];
    const { stdout } = await runStreaming(CLAUDE_BIN, args, { cwd: ROOT, timeout: TIMEOUT_MS, env: runEnv() });
    const { text, stats } = parseRunOutput(stdout);
    if (stats) await appendRun({ project: project.key, iid: trace.iid, kind: 'doctor', command: 'doctor', ...stats });
    const answer = parseDoctorAnswer(text);
    await save(answer ? { state: 'done', ...answer, cost: stats ? stats.costUsd : null } : { state: 'failed', error: 'The doctor gave no usable answer.', raw: text.slice(0, 2000) });
  } catch (err) {
    logger.warn({ err }, 'The doctor failed');
    await save({ state: 'failed', error: String(err.message ?? err).slice(0, 1000) }).catch(() => {});
  }
}
