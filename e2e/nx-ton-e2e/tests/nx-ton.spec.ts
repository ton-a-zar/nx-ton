import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';

describe('nx-ton e2e', () => {
  // Setting up individual workspaces per
  // test can cause e2e runs to take a long time.
  // For this reason, we recommend each suite only
  // consumes 1 workspace. The tests should each operate
  // on a unique project in the workspace, such that they
  // are not dependant on one another.
  beforeAll(() => {
    ensureNxProject('@ton-a-z/nx-ton', 'dist/packages/nx-ton');
  });

  afterAll(() => {
    // `nx reset` kills the daemon, and performs
    // some work which can help clean up e2e leftovers
    runNxCommandAsync('reset');
  });

  it('should create and build library', async () => {
    const project = uniq('nx-ton');
    await runNxCommandAsync(`generate @ton-a-z/nx-ton:library ${project}`);
    const result = await runNxCommandAsync(`build ${project}`);
    expect(result.stdout).toContain(
      'NX   Successfully ran target build for project'
    );
  }, 120000);

  it('should deploy library', async () => {
    const project = uniq('nx-ton');
    await runNxCommandAsync(`generate @ton-a-z/nx-ton:library ${project}`);
    const result = await runNxCommandAsync(`deploy ${project}`, {
      env: {
        TON_A_Z_DEPLOY_MNEMONIC: process.env.TON_A_Z_DEPLOY_MNEMONIC,
      },
    });
    expect(result.stdout).toContain(
      'NX   Successfully ran target deploy for project'
    );
  }, 120000);
});
