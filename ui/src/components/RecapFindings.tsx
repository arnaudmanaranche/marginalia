import type { RecapFinding, Recap } from '../lib/recapApi';
import { freshGroups, whereOf } from '../lib/recapText';

function List({ findings }: { findings: RecapFinding[] }) {
  return (
    <ul className="space-y-0.5">
      {findings.map((f) => (
        <li key={f.id} className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate" title={f.title}>{f.title}</span>
          {whereOf(f) && <code className="max-w-[50%] shrink-0 truncate text-fg-muted" title={whereOf(f)!}>{whereOf(f)}</code>}
        </li>
      ))}
    </ul>
  );
}

// What the bot says now that it did not before: new findings, those on code the author changed first,
// those on older code folded away; and the ones that may be an earlier finding said differently.
export function RecapFindings({ recap }: { recap: Pick<Recap, 'newFindings' | 'reworded'> }) {
  const { changed, older } = freshGroups(recap.newFindings);
  return (
    <>
      {recap.newFindings.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">New</h3>
          {changed.length > 0 && <List findings={changed} />}
          {older.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-fg-muted">On older code the bot only raised now ({older.length})</summary>
              <div className="mt-1"><List findings={older} /></div>
            </details>
          )}
        </div>
      )}
      {recap.reworded.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Reworded?</h3>
          <ul className="space-y-0.5">
            {recap.reworded.map((p) => (
              <li key={`${p.was.id}>${p.now.id}`} className="min-w-0 truncate" title={`${p.was.title} → ${p.now.title}`}>
                <span className="text-fg-muted">{p.was.title}</span> → {p.now.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
