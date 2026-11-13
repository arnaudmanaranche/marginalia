import { useContext } from 'react';
import { BookOpen, Check, RefreshCw } from 'lucide-react';
import { LinkContext, commitUrl } from '../lib/links';
import { useReviews } from '../lib/useReviews';
import type { ContextState, StoredContext } from '../lib/contextApi';
import { useContextActions, useProjectContext } from '../lib/contextApi';
import { toast } from '../lib/toast';
import { ContextSections } from './ContextSections';
import { SETTINGS_ROUTE } from '../lib/hashRoute';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Spinner } from './ds/Spinner';

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const approvedLine = (s: StoredContext) => `approved by ${s.approvedBy ?? 'someone'} on ${day(s.approvedAt)}`;

// One project's context: what the factory learned, which version reviews use, and the two
// decisions a person makes about it (approve the draft, learn again). Reviews never use a draft.
// `repo`: the project's address on GitLab, when known: paths and the commit learned link to it.
export function ProjectPage({ state, error, onRetry, busy, onApprove, onLearn, focusPath = null, repo = null }: {
  state: ContextState | null; error: string | null; onRetry: () => void; focusPath?: string | null; repo?: string | null;
  busy: 'approve' | 'learn' | null; onApprove: () => void; onLearn: () => void;
}) {
  // Ticket links come from the app; the repository ones from this project, at the commit learned.
  const links = useContext(LinkContext);
  if (error && !state) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-4 text-sm text-fg-muted">
          <span>The project context could not be loaded ({error}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!state) return <div aria-busy="true" className="mx-auto h-64 max-w-5xl animate-pulse px-6 py-8 motion-reduce:animate-none" />;
  const shown = state.draft ?? state.approved;
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Where this page lives: Settings, under Projects, which the top bar's Settings icon shows too. */}
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-fg-muted">
            <a href={`#/${SETTINGS_ROUTE}`} className="hover:text-zinc-900 dark:hover:text-zinc-100">Settings</a><span aria-hidden> › </span>Projects<span aria-hidden> › </span><span aria-current="page">{state.project}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{state.project}</h1>
            {state.draft ? <Badge tone="warning">Draft to approve</Badge> : state.approved ? <Badge tone="success">Approved</Badge> : <Badge>Not learned yet</Badge>}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {shown ? <>Learned at {repo ? <a href={commitUrl(repo, shown.commit)} target="_blank" rel="noreferrer" className="font-mono underline decoration-line-strong underline-offset-2 hover:text-fg">{shown.commit.slice(0, 8)}</a> : <span className="font-mono">{shown.commit.slice(0, 8)}</span>} on {day(shown.learnedAt)}{shown.state === 'approved' ? `, ${approvedLine(shown)}` : ''}.</> : 'What the factory knows about this project: its words, its stack, its features and what breaks the most.'}
          </p>
          {state.draft && state.approved && (
            <p className="mt-1 text-sm text-fg-muted">Reviews use the version {approvedLine(state.approved)} until you approve this draft.</p>
          )}
          {state.draft && !state.approved && <p className="mt-1 text-sm text-fg-muted">Reviews do not use it until you approve it.</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.draft && (
            <Button variant="primary" disabled={busy !== null} onClick={onApprove}>
              {busy === 'approve' ? <Spinner className="size-3.5" /> : <Check className="size-3.5" />}Approve draft
            </Button>
          )}
          <Button disabled={busy !== null || state.learning} onClick={onLearn} title="Read the repository and the team's tools again into a new draft. It runs as a job.">
            {state.learning || busy === 'learn' ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            {state.learning ? 'Learning…' : shown ? 'Learn again' : 'Learn the project'}
          </Button>
        </div>
      </div>
      {shown ? (
        <LinkContext.Provider value={{ ...links, projectUrl: repo, branch: shown.commit }}>
          <ContextSections context={shown.context} focusPath={focusPath} />
        </LinkContext.Provider>
      ) : (
        <div className="mt-16 flex flex-col items-center gap-2 text-center text-fg-muted">
          <BookOpen className="size-8" aria-hidden />
          Nothing learned yet. Learning reads the repository, the tracker, the docs and the chat, and costs about what a review does.
        </div>
      )}
    </div>
  );
}

// The page with its data and its two actions.
// `focusPath`: the critical path a link pointed at (a review's "Touches" chip).
export function ProjectView({ projectKey, focusPath = null }: { projectKey: string; focusPath?: string | null }) {
  const { state, error, retry } = useProjectContext(projectKey);
  const repo = useReviews().data?.projects?.find((p) => p.key === projectKey)?.url ?? null;
  const { approve, learn } = useContextActions(projectKey);
  const fail = (what: string) => (err: Error) => toast.error(`${what}: ${err.message}`);
  return (
    <ProjectPage
      state={state} error={error} onRetry={retry} focusPath={focusPath} repo={repo}
      busy={approve.isPending ? 'approve' : learn.isPending ? 'learn' : null}
      onApprove={() => approve.mutate(undefined, { onSuccess: () => toast.success('Approved: reviews use this context now'), onError: fail('Could not approve') })}
      onLearn={() => learn.mutate(undefined, { onSuccess: () => toast.success('Learning the project: it shows in the jobs'), onError: fail('Could not start learning') })}
    />
  );
}
