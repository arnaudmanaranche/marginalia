import { AsyncLocalStorage } from 'node:async_hooks';
import { gitlab as defaultGitlab } from '../gitlab-api.ts';
import { PROJECTS } from '../projects.ts';

// Who a studio request is for. In local mode nobody is signed in, there is no scope, and the
// studio sees every watched project and speaks to GitLab as the bot's token. Signed in (hosted
// mode), the middleware runs the request inside a scope: the person, the projects they may use,
// and a GitLab client carrying their own token, so what they post is theirs.
export interface Scope { user: { username: string; name: string }; projects: string[]; gitlab: any }
const store = new AsyncLocalStorage<Scope>();

export const runInScope = <T>(scope: Scope, fn: () => T): T => store.run(scope, fn);
export const currentScope = (): Scope | undefined => store.getStore();

// The watched projects this request may see.
export const visibleProjects = () => {
  const scope = currentScope();
  return scope ? PROJECTS.filter((p) => scope.projects.includes(p.key)) : PROJECTS;
};

// The GitLab seam the routes talk to: the signed-in person's when there is one, else `fallback`.
export const scopedGitlab = (fallback = defaultGitlab): typeof defaultGitlab => new Proxy(fallback, {
  get: (target, name) => (...args) => ((currentScope()?.gitlab ?? target) as any)[name](...args),
});
