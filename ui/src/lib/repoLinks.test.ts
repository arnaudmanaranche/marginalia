import { describe, expect, it } from 'vitest';
import { commitUrl, repoUrl } from './links';

const ctx = { projectUrl: 'https://gl/acme/web', branch: '196490cc', mrWebUrl: null };

describe('repository links', () => {
  it('opens a file as a file and a folder as a folder, at the commit given', () => {
    expect(repoUrl(ctx, 'src/routes.ts')).toBe('https://gl/acme/web/-/blob/196490cc/src/routes.ts');
    expect(repoUrl(ctx, 'src/app/[pages]/(timeline)/')).toBe('https://gl/acme/web/-/tree/196490cc/src/app/%5Bpages%5D/(timeline)');
  });
  it('opens a file without an extension as a file when the caller says it is one', () => {
    expect(repoUrl(ctx, 'Dockerfile', true)).toBe('https://gl/acme/web/-/blob/196490cc/Dockerfile');
    expect(repoUrl(ctx, 'Dockerfile')).toBe('https://gl/acme/web/-/tree/196490cc/Dockerfile');
  });
  it('leaves a pattern, or a project without an address, unlinked', () => {
    expect(repoUrl(ctx, 'src/**/*.spec.ts')).toBeNull();
    expect(repoUrl({ ...ctx, projectUrl: null }, 'src/routes.ts')).toBeNull();
  });
  it('links a commit', () => {
    expect(commitUrl('https://gl/acme/web', '196490cc')).toBe('https://gl/acme/web/-/commit/196490cc');
  });
});
