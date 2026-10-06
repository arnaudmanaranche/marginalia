import { ExternalLink, Loader2, PanelRight, RefreshCw, Send, Sparkles } from 'lucide-react';
import type { ReviewItem, ReviewVersion } from '../lib/api';
import { cn } from '../lib/utils';
import { VerdictBadge } from './VerdictBadge';
import { Button } from './ui/Button';

// Title, verdict and the actions on a review.
export function ReaderHeader({ item, showSubmit, draftCount, onSubmit, versions, versionId, onVersion, locked, onRerun, semantic, onSemantic, panelOpen, onPanel }: {
  item: ReviewItem | undefined;
  showSubmit: boolean;
  draftCount: number;
  onSubmit: () => void;
  versions: ReviewVersion[];
  versionId: string | null;
  onVersion: (id: string | null) => void;
  locked: boolean;
  onRerun: () => void;
  semantic: boolean;
  onSemantic: () => void;
  panelOpen: boolean;
  onPanel: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{item?.title ?? 'Review'}</h1>
        <div className="mt-2">
          <VerdictBadge verdict={item?.verdict ?? null} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {showSubmit && (
          <Button variant="primary" onClick={onSubmit}>
            <Send className="size-3.5" />Submit review ({draftCount})
          </Button>
        )}
        {versions.length > 0 && (
          <select
            value={versionId ?? ''}
            onChange={(e) => onVersion(e.target.value || null)}
            aria-label="Review version"
            className="touch-target rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">Latest review</option>
            {versions.map((v) => <option key={v.id} value={v.id}>{new Date(v.at).toLocaleString()}</option>)}
          </select>
        )}
        {item?.tracked && item.kind !== 'retro' && (
          <Button disabled={locked} onClick={onRerun} title="Run the review again on the current head of the MR">
            {locked ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" /> : <RefreshCw className="size-3.5" />}Re-run review
          </Button>
        )}
        <button
          onClick={onSemantic}
          aria-pressed={semantic}
          title="Typography that follows meaning (semfont): colour for sentiment, weight for importance, slant for hedges"
          className={cn('touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', semantic ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400')}
        >
          <Sparkles className="size-3.5" />Semantic type
        </button>
        {item?.webUrl && (
          <a href={item.webUrl} target="_blank" rel="noreferrer" className="touch-target inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
            Open in GitLab<ExternalLink className="size-3.5" />
          </a>
        )}
        <button
          onClick={onPanel}
          aria-pressed={panelOpen}
          aria-label="Toggle side panel"
          title="Toggle side panel"
          className={cn('hidden rounded-lg border p-1.5 lg:block', panelOpen ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800' : 'border-zinc-200 bg-white text-fg-muted dark:border-zinc-800 dark:bg-zinc-900')}
        >
          <PanelRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
