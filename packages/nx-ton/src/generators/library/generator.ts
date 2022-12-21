import * as path from 'path';

import {
  addProjectConfiguration,
  ensurePackage,
  formatFiles,
  generateFiles,
  GeneratorCallback,
  getWorkspaceLayout,
  joinPathFragments,
  names,
  offsetFromRoot,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import { getRelativePathToRootTsConfig } from '@nrwl/workspace/src/utilities/typescript';
import { nxVersion } from 'nx/src/utils/versions';
import { Linter, lintProjectGenerator } from '@nrwl/linter';
import { jestProjectGenerator } from '@nrwl/jest';

import { NxTonGeneratorSchema } from './schema';

interface NormalizedSchema extends NxTonGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

function addLint(
  tree: Tree,
  options: NormalizedSchema
): Promise<GeneratorCallback> {
  return lintProjectGenerator(tree, {
    project: options.projectName,
    unitTestRunner: 'jest',
    linter: Linter.EsLint,
    skipFormat: true,
    tsConfigPaths: [
      joinPathFragments(options.projectRoot, 'tsconfig.lib.json'),
    ],
    eslintFilePatterns: [`${options.projectRoot}/**/*.ts`],
  });
}

async function addJest(
  tree: Tree,
  options: NormalizedSchema
): Promise<GeneratorCallback> {
  await ensurePackage(tree, '@nrwl/jest', nxVersion);
  return await jestProjectGenerator(tree, {
    ...options,
    project: options.projectName,
    setupFile: 'none',
    supportTsx: false,
    skipSerializers: true,
    testEnvironment: 'node',
    skipFormat: true,
    compiler: 'tsc',
  });
}

function normalizeOptions(
  tree: Tree,
  options: NxTonGeneratorSchema
): NormalizedSchema {
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(tree).libsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    rootTsConfigPath: getRelativePathToRootTsConfig(tree, options.projectRoot),
    template: '',
  };

  generateFiles(
    tree,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (tree: Tree, options: NxTonGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  addProjectConfiguration(tree, normalizedOptions.projectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'library',
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    targets: {
      build: {
        executor: '@ton-a-z/nx-ton:build',
      },
      deploy: {
        executor: '@ton-a-z/nx-ton:deploy',
        dependsOn: [
          {
            target: 'build',
            projects: 'self',
          },
        ],
        options: {
          workchain: 0,
          isTestnet: true,
        },
      },
    },
    tags: normalizedOptions.parsedTags,
  });

  addFiles(tree, normalizedOptions);

  await addJest(tree, normalizedOptions);
  await addLint(tree, normalizedOptions);
  const projectFinalConfiguration = readProjectConfiguration(
    tree,
    normalizedOptions.projectName
  );

  updateProjectConfiguration(tree, normalizedOptions.projectName, {
    ...projectFinalConfiguration,
    targets: {
      ...projectFinalConfiguration.targets,
      test: {
        ...projectFinalConfiguration.targets.test,
        dependsOn: [
          {
            target: 'build',
            projects: 'self',
          },
        ],
      },
    },
  });

  await formatFiles(tree);
}
