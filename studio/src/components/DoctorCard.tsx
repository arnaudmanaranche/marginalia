import { useState } from 'react';
import { toast } from '../lib/toast';
import { Loader2, RefreshCw, Stethoscope } from 'lucide-react';
import { startDoctor, type Doctor, type DoctorFix, type DoctorWhere, type Failure } from '../lib/api';
import { duration } from '../lib/runs';
import { useNow } from '../lib/useNow';
import { timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/badgeStyles';
import { Button } from './ui/Button';
import { NoteMarkdown } from './NoteMarkdown';
import { DoctorFixPanel } from './DoctorFixPanel';

const WHERE: Record<DoctorWhere, { label: string; tone: BadgeTone }> = {
  bot: { label: 'Fix in Marginalia', tone: 'violet' },
  agent: { label: 'Fix in the review instructions', tone: 'violet' },
  environment: { label: 'The machine or the container', tone: 'warning' },
  gitlab: { label: 'GitLab', tone: 'warning' },
  claude: { label: 'Claude', tone: 'warning' },
  repo: { label: 'The reviewed repository', tone: 'neutral' },
};

// What the doctor made of a failed run: why it failed, the evidence, whether a re-run would do, and
// what change would keep it from happening again. Started on its own after a failure that does not
// pass by itself; asked here for any other.
export function DoctorCard({ slug, runId, doctor, failure, fix, fixSource }: { slug: string; runId: string; doctor: Doctor | null; failure: Failure | null; fix: DoctorFix | null; fixSource: { available: boolean; why?: string } }) {
  const [asking, setAsking] = useState(false);
  const now = useNow(doctor?.state === 'running');
  const ask = async () => {
    setAsking(true);
    try {
      await startDoctor(slug, runId);
    } catch (e) {
      toast.error('Could not ask the doctor', { description: (e as Error).message });
    } finally {
      setAsking(false);
    }
  };
  const askButton = (label: string) => (
    <Button size="sm" disabled={asking} onClick={ask}>
      {asking ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" /> : label === 'Ask the doctor' ? <Stethoscope className="size-3.5" /> : <RefreshCw className="size-3.5" />}{label}
    </Button>
  );

  return (
    <section aria-label="Doctor" className="rounded-md border border-violet-500/30 bg-white p-3 text-sm dark:bg-zinc-900">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300"><Stethoscope className="size-3.5" aria-hidden />Doctor</p>
      {!doctor && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fg-muted">{failure?.transient ? 'This kind of failure passes by itself. Ask anyway if it keeps coming back.' : 'Not looked at yet. The doctor reads this run and the bot to find the cause (a few minutes, read only).'}</p>
          {askButton('Ask the doctor')}
        </div>
      )}
      {doctor?.state === 'running' && (
        <p role="status" className="flex items-center gap-2 text-fg-muted">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" aria-hidden />Reading the run and the bot's code…{doctor.startedAt && <span className="tabular-nums text-fg-subtle">{duration(now - new Date(doctor.startedAt).getTime())}</span>}
        </p>
      )}
      {doctor?.state === 'failed' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-red-700 dark:text-red-300">The doctor could not finish: {doctor.error}</p>
          {askButton('Try again')}
        </div>
      )}
      {doctor?.state === 'done' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {doctor.where && <Badge tone={WHERE[doctor.where].tone}>{WHERE[doctor.where].label}</Badge>}
            {doctor.confidence && <Badge tone="neutral">{doctor.confidence} confidence</Badge>}
            <Badge tone={doctor.retryWillWork ? 'success' : 'danger'}>{doctor.retryWillWork ? 'A re-run should work' : 'A re-run fails the same way'}</Badge>
          </div>
          <p className="font-medium">{doctor.summary}</p>
          <NoteMarkdown className="text-fg-muted">{doctor.cause ?? ''}</NoteMarkdown>
          {doctor.evidence && doctor.evidence.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-fg-muted">Evidence</p>
              <ul className="space-y-0.5 font-mono text-xs">
                {doctor.evidence.map((e, i) => <li key={i} className="break-words">{e}</li>)}
              </ul>
            </div>
          )}
          {doctor.fix?.what && (
            <div className="rounded-md bg-violet-500/5 p-2">
              <p className="text-xs font-medium text-fg-muted">{doctor.fix.inBot ? 'The change that keeps it from happening again' : 'What to do'}</p>
              <NoteMarkdown>{doctor.fix.what}</NoteMarkdown>
              {doctor.fix.files.length > 0 && <p className="mt-1 font-mono text-xs text-fg-muted">{doctor.fix.files.join(', ')}</p>}
              {doctor.fix.inBot && <div className="mt-2 border-t border-violet-500/20 pt-2"><DoctorFixPanel slug={slug} runId={runId} fix={fix} source={fixSource} /></div>}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
            <span>{doctor.sameAs ? 'Same failure as an earlier run: this diagnosis is from then.' : doctor.endedAt ? `Diagnosed ${timeAgo(doctor.endedAt)}.` : ''}</span>
            {askButton('Ask again')}
          </div>
        </div>
      )}
    </section>
  );
}
