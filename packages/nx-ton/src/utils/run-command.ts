import * as cp from 'child_process';

import { ExecutorContext } from '@nrwl/devkit';
import chalk from 'chalk';

export function runCommand(
  command: string,
  args: string[],
  ctx: ExecutorContext
) {
  console.log(chalk.dim`> ${command} ${args.join(' ')}`);

  return new Promise<void>((resolve, reject) => {
    cp.spawn(command, args, {
      cwd: ctx.root,
      shell: true,
      stdio: 'inherit',
    })
      .on('error', reject)
      .on('close', (code) => {
        if (code) reject(new Error(`${command} failed with exit code ${code}`));
        else resolve();
      });
  });
}
