import { describe, expect, it } from 'vitest';
import { palettePages } from './palettePages';

describe('palettePages', () => {
  it('lists every screen, and each project context under its project name', () => {
    const pages = palettePages([{ key: 'webapp' }, { key: 'api' }]);
    expect(pages.map((p) => [p.label, p.route])).toEqual([
      ['Home', null],
      ['Approvals', 'approvals'],
      ['Settings', 'settings'],
      ['webapp context', 'context:webapp'],
      ['api context', 'context:api'],
    ]);
  });

  it('finds a project context by the words a person types', () => {
    const [ctx] = palettePages([{ key: 'webapp' }]).filter((p) => p.route === 'context:webapp');
    expect(ctx.keywords).toEqual(expect.arrayContaining(['project', 'critical paths', 'glossary']));
  });
});
