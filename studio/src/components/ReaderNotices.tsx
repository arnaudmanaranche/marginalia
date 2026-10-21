// Why a report reads the way it does: an old version on screen.
export function ReaderNotices({ viewingOld, onBackToLatest }: { viewingOld: boolean; onBackToLatest: () => void }) {
  if (!viewingOld) return null;
  return (
    <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      You are reading an earlier version of this review. Comments can't be posted from it.{' '}
      <button className="underline" onClick={onBackToLatest}>Back to the latest</button>
    </p>
  );
}
