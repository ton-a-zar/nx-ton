import child_process from 'child_process';
import fs from 'fs';
import process from 'process';
import path from 'path';

import semver from 'semver';
import chalk from 'chalk';
import glob from 'fast-glob';
import { Cell } from 'ton';
import { ExecutorContext } from '@nrwl/devkit';

import { BuildExecutorSchema } from './schema';
import { crc32 } from '../../utils/crc32';

export default async function runExecutor(
  options: BuildExecutorSchema,
  ctx: ExecutorContext
) {
  const projectRoot = ctx.workspace.projects[ctx.projectName as string].root;
  const minSupportFunc = '0.2.0';

  console.log(chalk.dim`running build in ${projectRoot}`);

  try {
    const funcVersion = child_process
      .execSync('func -V')
      .toString()
      .match(/semantic version: v([0-9.]+)/)?.[1];

    if (!semver.gte(semver.coerce(funcVersion) ?? '', minSupportFunc)) {
      console.log(
        chalk.red`FATAL ERROR: 'func' with version >= ${minSupportFunc} executable is not found, is it installed and in path?`
      );
      throw new Error('Nonexistent func version or outdated');
    }

    // make sure fift cli is available
    const fiftVersion = child_process.execSync('fift -V').toString();

    if (!fiftVersion.includes('Fift build information')) {
      console.log(
        chalk.stderr`\nFATAL ERROR: 'fift' executable is not found, is it installed and in path?`
      );
      throw new Error('Nonexistent fift version or outdated');
    }

    const rootContracts = glob.sync([
      `${projectRoot}/src/*.fc`,
      `${projectRoot}/src/*.func`,
    ]);

    if (fs.existsSync(`${projectRoot}/build`))
      fs.rmSync(`${projectRoot}/build`, {
        force: true,
        recursive: true,
      });
    fs.mkdirSync(`${projectRoot}/build`);

    for (const rootContract of rootContracts) {
      // compile a new root contract

      console.log(
        `\n* Found root contract '${rootContract}' - let's compile it:`
      );
      const contractName = path.parse(rootContract).name;

      // delete existing build artifacts
      const fiftArtifact = `${projectRoot}/build/${contractName}.fif`;
      if (fs.existsSync(fiftArtifact)) {
        console.log(` - Deleting old build artifact '${fiftArtifact}'`);
        fs.unlinkSync(fiftArtifact);
      }
      const mergedFuncArtifact = `${projectRoot}/build/${contractName}.merged.fc`;
      if (fs.existsSync(mergedFuncArtifact)) {
        console.log(` - Deleting old build artifact '${mergedFuncArtifact}'`);
        fs.unlinkSync(mergedFuncArtifact);
      }
      const fiftCellArtifact = `${projectRoot}/build/${contractName}.cell.fif`;
      if (fs.existsSync(fiftCellArtifact)) {
        console.log(` - Deleting old build artifact '${fiftCellArtifact}'`);
        fs.unlinkSync(fiftCellArtifact);
      }
      const cellArtifact = `${projectRoot}/build/${contractName}.cell`;
      if (fs.existsSync(cellArtifact)) {
        console.log(` - Deleting old build artifact '${cellArtifact}'`);
        fs.unlinkSync(cellArtifact);
      }
      const hexArtifact = `${projectRoot}/build/${contractName}.compiled.json`;
      if (fs.existsSync(hexArtifact)) {
        console.log(` - Deleting old build artifact '${hexArtifact}'`);
        fs.unlinkSync(hexArtifact);
      }

      // check if we have a tlb file
      const tlbFile = `${projectRoot}/src/${contractName}.tlb`;
      if (fs.existsSync(tlbFile)) {
        console.log(
          chalk.dim` - TL-B file '${tlbFile}' found, calculating crc32 on all ops..`
        );
        const tlbContent = fs.readFileSync(tlbFile).toString();
        const tlbOpMessages =
          tlbContent.match(/^(\w+).*=\s*InternalMsgBody$/gm) ?? [];
        for (const tlbOpMessage of tlbOpMessages) {
          const crc = crc32(tlbOpMessage);
          const asQuery = `0x${(crc & 0x7fffffff).toString(16)}`;
          const asResponse = `0x${((crc | 0x80000000) >>> 0).toString(16)}`;
          console.log(
            chalk.dim`   op '${
              tlbOpMessage.split(' ')[0]
            }': '${asQuery}' as query (&0x7fffffff), '${asResponse}' as response (|0x80000000)`
          );
        }
      } else {
        console.log(
          chalk.yellow` - Warning: TL-B file for contract '${tlbFile}' not found, are your op consts according to standard?`
        );
      }

      // run the func compiler to create a fif file
      console.log(
        chalk.dim` - Trying to compile '${rootContract}' with 'func' compiler..`
      );
      let buildErrors: string;
      try {
        buildErrors = child_process
          .execSync(
            `func -APS -o ${projectRoot}/build/${contractName}.fif ${rootContract} 2>&1 1>node_modules/.tmpfunc`
          )
          .toString();
      } catch (e) {
        buildErrors = e.stdout.toString();
      }
      if (buildErrors.length > 0) {
        console.log(
          chalk.red` - OH NO! Compilation Errors! The compiler output was:`
        );
        console.log(chalk.red`\n${buildErrors}`);
        throw new Error('Could not compile func');
      } else {
        console.log(chalk.green` - FunC Compilation successful!`);
      }

      // make sure fif build artifact was created
      if (!fs.existsSync(fiftArtifact)) {
        console.log(
          chalk.red` - For some reason '${fiftArtifact}' was not created!`
        );
        process.exit(1);
      } else {
        console.log(chalk.dim` - Build artifact created '${fiftArtifact}'`);
      }

      // create a temp cell.fif that will generate the cell
      let fiftCellSource = '"Asm.fif" include\n';
      fiftCellSource += `${fs.readFileSync(fiftArtifact).toString()}\n`;
      fiftCellSource += `boc>B "${cellArtifact}" B>file`;
      fs.writeFileSync(fiftCellArtifact, fiftCellSource);

      // run fift cli to create the cell
      console.log(
        chalk.dim` - Trying to compile '${fiftCellArtifact}' with 'fift' compiler..`
      );
      try {
        child_process.execSync(
          `fift -I ./node_modules/@ton-a-z/nx-ton/fiftlib ${fiftCellArtifact}`
        );
      } catch (e) {
        console.log(
          chalk.red`FATAL ERROR: 'fift' executable failed, is FIFTPATH env variable defined?`
        );
        throw new Error('Could not compile fift');
      }

      // Remove intermediary
      fs.unlinkSync(fiftCellArtifact);

      // make sure cell build artifact was created
      if (!fs.existsSync(cellArtifact)) {
        console.log(
          ` - For some reason, intermediary file '${cellArtifact}' was not created!`
        );
        process.exit(1);
      }

      fs.writeFileSync(
        hexArtifact,
        JSON.stringify({
          hex: Cell.fromBoc(fs.readFileSync(cellArtifact))[0]
            .toBoc()
            .toString('hex'),
        })
      );

      // Remove intermediary
      fs.unlinkSync(cellArtifact);

      // make sure hex artifact was created
      if (!fs.existsSync(hexArtifact)) {
        console.log(` - For some reason '${hexArtifact}' was not created!`);
        process.exit(1);
      } else {
        console.log(` - Build artifact created '${hexArtifact}'`);
      }
    }

    return {
      success: true,
    };
  } catch (err) {
    console.log(chalk.red`executor exited with message: ${err?.message}`);
    return {
      success: false,
      message: err?.message,
    };
  }
}
