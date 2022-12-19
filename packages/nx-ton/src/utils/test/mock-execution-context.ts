import { ExecutorContext } from '@nrwl/devkit';

export function mockExecutorContext(command: string): ExecutorContext {
  const [projectName, targetName] = command.split(':');

  return {
    cwd: '/test',
    root: '/test',
    isVerbose: false,
    workspace: {
      npmScope: '@test',
      projects: {
        'test-app': {
          root: 'apps/test-app',
          projectType: 'application',
        },
        'test-lib': {
          root: 'libs/test-lib',
          projectType: 'library',
        },
      },
      version: 2,
    },
    projectName,
    targetName,
  };
}
