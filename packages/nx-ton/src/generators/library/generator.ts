import * as path from 'path';

import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  Tree,
} from '@nrwl/devkit';
import { getRelativePathToRootTsConfig } from '@nrwl/workspace/src/utilities/typescript';

import { NxTonGeneratorSchema } from './schema';

interface NormalizedSchema extends NxTonGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
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
      test: {
        executor: '@nrwl/jest:jest',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        dependsOn: [
          {
            target: 'build',
            projects: 'self',
          },
        ],
        options: {
          jestConfig: `${normalizedOptions.projectRoot}/jest.config.ts`,
          passWithNoTests: true,
        },
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
  await formatFiles(tree);
}
