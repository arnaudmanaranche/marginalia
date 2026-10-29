
// Stacks of 2+ MRs from status.json, layers bottom to top. A layer without a
// review file yet has slug null.
export function buildStacks(status) {
  const byId = new Map();
  for (const mr of status?.mrs ?? []) {
    if (mr.kind !== 'review' || !mr.stack) continue;
    const id = `${mr.project}/${mr.stack.id}`;
    if (!byId.has(id)) byId.set(id, { id, baseBranch: mr.stack.baseBranch, layers: [] });
    byId.get(id).layers.push({
      iid: mr.iid,
      title: mr.title,
      webUrl: mr.web_url,
      slug: mr.reviewPath ? `${mr.project}/${mr.reviewPath.split('/').pop().replace(/\.md$/, '')}` : null,
      status: mr.status,
      parentIid: mr.stack.parentIid,
      position: mr.stack.position,
    });
  }
  return [...byId.values()].map((st) => ({ ...st, layers: st.layers.sort((a, b) => a.position - b.position) }));
}
