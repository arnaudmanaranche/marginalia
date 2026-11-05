// `marginalia understand [--project <key>]`: learn a project into a draft context.
// `marginalia context approve --project <key>`: approve that draft, so reviews use it.
// `marginalia context show --project <key>`: print the stored context, draft first.

async function pickProject(key?: string) {
  const { PROJECTS, projectByKey } = await import('../src/projects.ts');
  const project = key ? projectByKey(key) : PROJECTS[0];
  if (!project) console.error(key ? `No project "${key}". Known: ${PROJECTS.map((p: any) => p.key).join(', ')}` : 'No project configured: marginalia init');
  return project;
}

export async function runUnderstand({ project: key }: { project?: string }) {
  const project = await pickProject(key);
  if (!project) return 1;
  const { learnProject } = await import('../src/understand.ts');
  console.log(`Learning ${project.gitlabProjectId} (this can take a while)...`);
  try {
    const out = await learnProject(project, { onStep: (step) => console.log(`  ${step}`) });
    console.log(`\nDraft context at ${out.commit.slice(0, 8)} on ${out.branch}: ${out.path}${out.costUsd === null ? '' : ` ($${out.costUsd.toFixed(2)})`}`);
    console.log(`Read it, then: marginalia context approve --project ${project.key}`);
    return 0;
  } catch (err) {
    console.error(`\n${err.message}`);
    return 1;
  }
}

export async function runContext(action: string, { project: key }: { project?: string }) {
  const project = await pickProject(key);
  if (!project) return 1;
  const { DATA_DIR, GITLAB_USERNAME } = await import('../src/config.ts');
  const store = await import('../src/context-store.ts');
  if (action === 'approve') {
    const approved = await store.approveDraft(DATA_DIR, project.key, GITLAB_USERNAME);
    console.log(approved ? `Approved: reviews of ${project.key} now use the context learned at ${approved.commit.slice(0, 8)}.` : `No draft for ${project.key}: marginalia understand --project ${project.key}`);
    return approved ? 0 : 1;
  }
  const stored = (await store.readContext(DATA_DIR, project.key, 'draft')) ?? (await store.readContext(DATA_DIR, project.key, 'approved'));
  if (!stored) {
    console.log(`No context for ${project.key} yet: marginalia understand --project ${project.key}`);
    return 1;
  }
  console.log(JSON.stringify(stored, null, 2));
  return 0;
}
