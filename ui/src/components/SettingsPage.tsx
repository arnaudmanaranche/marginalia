import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '../lib/toast';
import { RotateCcw } from 'lucide-react';
import { pollNow, saveSettings, type Settings } from '../lib/api';
import { inTime } from '../lib/utils';
import { keys } from '../lib/queryKeys';
import { arrive } from '../lib/motion';
import { AppearanceSettings } from './AppearanceSettings';
import { ProjectsSettings } from './ProjectsSettings';
import { SettingGroup, SettingRow } from './SettingRow';
import { Input } from './ds/Input';
import { Switch } from './ds/Switch';
import { Button } from './ui/Button';

type Draft = { pollIntervalMinutes: string; staleAfterDays: string; dailyBudgetUsd: string; allowedTargetBranches: string; excludeAuthors: string; showFullDiff: boolean };
type TextKey = Exclude<keyof Draft, 'showFullDiff'>;

const toDraft = (s: Settings): Draft => ({
  pollIntervalMinutes: String(s.pollIntervalMinutes),
  staleAfterDays: String(s.staleAfterDays),
  dailyBudgetUsd: String(s.dailyBudgetUsd),
  allowedTargetBranches: s.allowedTargetBranches.join(', '),
  excludeAuthors: s.excludeAuthors.join(', '),
  showFullDiff: s.showFullDiff,
});
const toList = (v: string) => [...new Set(v.split(/[,\s]+/).filter(Boolean))];

const FIELDS: { key: TextKey; label: string; hint: string; list?: boolean; decimal?: boolean; placeholder?: string }[] = [
  { key: 'pollIntervalMinutes', label: 'Poll every (minutes)', hint: 'How often the bot looks for new or updated MRs. 1 to 1440.' },
  { key: 'staleAfterDays', label: 'Skip MRs idle for (days)', hint: 'A poll does not review an MR with no push for this long (comments and approvals do not count): also how far back it catches up after a stop. 1 to 365.' },
  { key: 'dailyBudgetUsd', label: 'Daily budget (USD)', hint: 'What a day of automatic reviews and triages may cost; past it they wait until midnight. A mention or "Review again" always runs. 0 is no limit.', decimal: true },
  { key: 'allowedTargetBranches', label: 'Target branches', hint: 'Only MRs based on these branches are reviewed. Empty reviews all of them.', list: true, placeholder: 'develop, main' },
  { key: 'excludeAuthors', label: 'Excluded authors', hint: 'GitLab usernames (not emails) whose MRs are never touched. Drafts are always skipped.', list: true, placeholder: 'alice, bob' },
];

function patchOf(draft: Draft) {
  return {
    pollIntervalMinutes: Number(draft.pollIntervalMinutes),
    staleAfterDays: Number(draft.staleAfterDays),
    dailyBudgetUsd: Number(draft.dailyBudgetUsd),
    allowedTargetBranches: toList(draft.allowedTargetBranches),
    excludeAuthors: toList(draft.excludeAuthors),
    showFullDiff: draft.showFullDiff,
  };
}

// Everything in the bot group is read fresh by the bot on its next poll: no restart. Secrets, paths
// and the ALLOW_POSTING / ALLOW_PUSH gates stay in .env on purpose.
type Project = { key: string; kind: 'back' | 'front' | null; gitlabProjectId: string; url: string | null };

export function SettingsPage({ settings, defaults, projects = [], nextPollAt = null }: { settings: Settings | null; defaults: Settings | null; projects?: Project[]; nextPollAt?: string | null }) {
  const [draft, setDraft] = useState<Draft | null>(settings && toDraft(settings));
  const client = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reviews }),
  });
  const saving = saveMutation.isPending;
  // The server's values arrive after the first paint, and change when saved from elsewhere.
  const saved = settings ? JSON.stringify(toDraft(settings)) : null;
  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !settings || !defaults) return <div aria-busy="true" className="mx-auto h-64 max-w-3xl animate-pulse px-6 py-8 motion-reduce:animate-none" />;

  const dirty = JSON.stringify(draft) !== saved;
  const changes = (Object.keys(draft) as (keyof Draft)[]).filter((k) => draft[k] !== toDraft(settings)[k]).length;
  const defaultDraft = toDraft(defaults);
  const save = async (patch: Parameters<typeof saveSettings>[0], message: string) => {
    try {
      await saveMutation.mutateAsync(patch);
      // Say when it takes effect, and offer not to wait.
      toast.success(message, {
        description: nextPollAt ? `Applied on the bot's next poll, ${inTime(nextPollAt)}.` : 'Applied on the bot\'s next poll.',
        action: { label: 'Poll now', onClick: () => void pollNow().then(() => toast('The bot is polling'), (err: Error) => toast.error('Could not reach the bot', { description: err.message })) },
      });
    } catch (err) {
      toast.error('Could not save the settings', { description: (err as Error).message });
    }
  };

  return (
    <form
      className="mx-auto max-w-3xl px-6 pt-8 pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        void save(patchOf(draft), 'Settings saved');
      }}
    >
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-fg-muted">What the bot watches and how this studio looks to you.</p>

      <AppearanceSettings />

      <SettingGroup title="The bot" description={<>Saved to <code className="font-mono text-xs">settings.json</code>, read by the bot on its next poll, and each value overrides <code className="font-mono text-xs">.env</code>.{projects.length > 1 ? ` They apply to all ${projects.length} projects.` : ''}</>}>
        {FIELDS.map((f) => {
          const id = `setting-${f.key}`;
          const changedFromDefault = draft[f.key] !== defaultDraft[f.key];
          return (
            <SettingRow key={f.key} label={f.label} hint={f.hint} htmlFor={id} hintId={`${id}-hint`}>
              {changedFromDefault && (
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save({ [f.key]: null }, `${f.label} back to the .env default`)} title={`Back to the .env default (${defaultDraft[f.key] || 'empty'})`}>
                  <RotateCcw className="size-3.5" />Default
                </Button>
              )}
              <Input
                id={id} value={draft[f.key]} changed={draft[f.key] !== toDraft(settings)[f.key]}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                inputMode={f.list ? undefined : f.decimal ? 'decimal' : 'numeric'} placeholder={f.placeholder} aria-describedby={`${id}-hint`}
                className="sm:max-w-[12rem]"
              />
            </SettingRow>
          );
        })}
        <SettingRow label="Show the full diff in reviews" htmlFor="setting-showFullDiff" hintId="setting-showFullDiff-hint" hint="Off: a chapter shows only the files with a finding or a conversation, the main points. The agent reads every line, so you do not have to.">
          <Switch id="setting-showFullDiff" label="Show the full diff in reviews" describedBy="setting-showFullDiff-hint" checked={draft.showFullDiff} onChange={(on) => setDraft({ ...draft, showFullDiff: on })} />
        </SettingRow>
      </SettingGroup>

      <ProjectsSettings projects={projects} />

      {/* Appears only when something changed, over the page's foot: Save is the one primary action. */}
      <AnimatePresence initial={false}>
        {dirty && (
          <m.div {...arrive} role="region" aria-label="Unsaved changes" className="fixed inset-x-0 bottom-0 z-30 px-6 pb-4">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface px-4 py-3">
              <span className="text-sm"><span className="font-medium tabular-nums">{changes}</span> unsaved change{changes > 1 ? 's' : ''}</span>
              <span className="flex items-center gap-2">
                <Button variant="ghost" disabled={saving} onClick={() => setDraft(toDraft(settings))}>Discard</Button>
                <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </span>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </form>
  );
}
