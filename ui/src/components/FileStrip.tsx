import type { DiffFile, Finding } from '../lib/api';
import { SeverityDot } from './ds/Severity';

// The files of the chapter being read, one chip each: its name, what changed, and whether the review
// flagged anything in it. A click opens that file in the diff and brings it into view.
export function FileStrip({ files, findings, onJump }: { files: DiffFile[]; findings: Finding[]; onJump: (path: string) => void }) {
  if (files.length < 2) return null;
  return (
    <nav aria-label="Files of this chapter" className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
      {files.map((file) => {
        const mine = findings.filter((f) => f.path === file.path);
        const top = mine.find((f) => f.severity === 'critical') ?? mine.find((f) => f.severity === 'important') ?? mine[0];
        return (
          <button key={file.path} type="button" onClick={() => onJump(file.path)} title={file.path} className="touch-target inline-flex shrink-0 items-center gap-1.5 rounded-md bg-sunken px-2 py-1 text-xs ring-1 ring-inset ring-line transition-colors duration-150 hover:ring-line-strong">
            {top && <SeverityDot level={top.severity} />}
            <code className="max-w-[16rem] truncate font-mono">{file.path.split('/').slice(-2).join('/')}</code>
            {top && <span className="tabular-nums text-fg-muted"><span className="sr-only">{mine.length} finding{mine.length > 1 ? 's' : ''}, </span>{mine.length}</span>}
            <span className="font-mono tabular-nums text-ok-ink">+{file.additions}</span>
            <span className="font-mono tabular-nums text-fail">−{file.deletions}</span>
          </button>
        );
      })}
    </nav>
  );
}
