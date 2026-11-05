import { describe, expect, it } from 'vitest';
import { SUPPORTING_RANK, extractMeta, rankOf, splitSections } from './reviewSections';

describe('splitSections', () => {
  it('keeps what precedes the first heading as the intro', () => {
    const { intro, sections } = splitSections('hello\n\n## Summary\nbody\n### Critical\nbad');
    expect(intro).toBe('hello\n');
    expect(sections.map((s) => [s.title, s.body])).toEqual([['Summary', 'body'], ['Critical', 'bad']]);
  });

  it('does not split on a heading inside a fenced code block', () => {
    const { sections } = splitSections('## A\n```\n## not a heading\n```\n## B');
    expect(sections.map((s) => s.title)).toEqual(['A', 'B']);
  });

  it('gives each section a distinct id, even for the same title', () => {
    const { sections } = splitSections('## Notes\n## Notes');
    expect(new Set(sections.map((s) => s.id)).size).toBe(2);
  });
});

describe('rankOf', () => {
  it('reads what the MR does first, then what to act on, then the rest', () => {
    const order = ['Summary', 'At a Glance', 'Shape of the change', 'Critical issues', 'Important', 'Suggestions', 'Out of scope'].map(rankOf);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rankOf('Test plan')).toBe(SUPPORTING_RANK);
  });
});

describe('extractMeta', () => {
  const line = '**Branch:** feat/x | **Ticket:** ESD-12 (Jira not reachable) | **MR:** !4\n';
  it('pulls the meta line out and keeps only the ticket key, the rest is a note', () => {
    const { markdown, ticket } = extractMeta(`# T\n${line}text`);
    expect(markdown).toBe('# T\ntext');
    expect(ticket).toEqual({ key: 'ESD-12', note: 'ESD-12 (Jira not reachable)' });
  });

  it('has no note when the field is the bare key', () => {
    expect(extractMeta('**Branch:** b | **Ticket:** ESD-1 | **MR:** !1').ticket).toEqual({ key: 'ESD-1', note: null });
  });

  it('leaves a report without the line untouched', () => {
    expect(extractMeta('plain')).toEqual({ markdown: 'plain', ticket: null });
  });
});
