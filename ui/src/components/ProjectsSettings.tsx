import { ArrowUpRight } from 'lucide-react';
import { contextRoute } from '../lib/contextApi';
import { Chip } from './ds/Chip';
import { SettingGroup } from './SettingRow';

type Project = { key: string; kind: 'back' | 'front' | null; gitlabProjectId: string; url: string | null };

// The projects this install watches, read only: which GitLab project, what kind, and the way to its
// context. Adding one or changing its repo is the config file's job, not this page's.
export function ProjectsSettings({ projects }: { projects: Project[] }) {
  if (!projects.length) return null;
  return (
    <SettingGroup title="Projects" description={<>Watched by this bot. Their repositories and commands are set in <code className="font-mono text-xs">config.json</code>.</>}>
      {projects.map((p) => (
        <div key={p.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
          <span className="font-medium">{p.key}</span>
          {p.kind && <Chip>{p.kind}-end</Chip>}
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted" title={p.gitlabProjectId}>{p.gitlabProjectId}</code>
          <a href={`#/${contextRoute(p.key)}`} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100">Context<ArrowUpRight className="size-3" aria-hidden /></a>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100">GitLab<ArrowUpRight className="size-3" aria-hidden /></a>}
        </div>
      ))}
    </SettingGroup>
  );
}
