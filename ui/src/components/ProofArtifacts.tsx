import type { Artifact } from '../lib/api';

// What a browser reproduction kept (ADR 0010): the screenshot as a picture that opens full size, the
// logs as links to the text. Files are served by the API from the bot's own data, never from the project.
export function ProofArtifacts({ artifacts }: { artifacts?: Artifact[] }) {
  if (!artifacts?.length) return null;
  const shot = artifacts.find((a) => a.kind === 'screenshot');
  const logs = artifacts.filter((a) => a.kind !== 'screenshot');
  return (
    <div className="mt-2 flex flex-col gap-2">
      {shot && (
        <a href={shot.ref} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-md border border-line focus-visible:outline-2 focus-visible:outline-offset-2">
          <img src={shot.ref} alt="Screenshot the browser took while reproducing this finding" loading="lazy" className="max-h-56 max-w-full object-contain" />
        </a>
      )}
      {logs.length > 0 && (
        <p className="text-fg-muted">
          Seen in the browser:{' '}
          {logs.map((a, i) => (
            <span key={a.ref}>{i > 0 && ', '}<a href={a.ref} target="_blank" rel="noreferrer" className="underline underline-offset-2">{LABEL[a.name] ?? a.name}</a></span>
          ))}
        </p>
      )}
    </div>
  );
}

const LABEL: Record<string, string> = { 'console.txt': 'console', 'errors.txt': 'page errors', 'requests.txt': 'requests' };
