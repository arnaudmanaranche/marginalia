// What `marginalia update` does, decided without touching anything. Pure.
// A git clone is updated with git (we never run git pull for the user); a packaged
// install with `npm install -g`.
export function updatePlan({ isClone, packageName }: { isClone: boolean, packageName: string }) {
  if (isClone) {
    return { run: null, message: 'This is a git clone: update it with `git pull && npm install && npm run studio:build`, then restart the service (`marginalia service install`).' };
  }
  return { run: ['npm', ['install', '-g', `${packageName}@latest`]] as [string, string[]], message: `Updating ${packageName} with npm...` };
}
