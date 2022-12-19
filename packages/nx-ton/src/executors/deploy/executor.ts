import fs from 'fs';
import path from 'path';

import {
  Address,
  Cell,
  CellMessage,
  CommonMessageInfo,
  contractAddress,
  fromNano,
  InternalMessage,
  SendMode,
  StateInit,
  toNano,
  TonClient,
  WalletContract,
  WalletV3R2Source,
} from 'ton';
import glob from 'fast-glob';
import { ExecutorContext } from '@nrwl/devkit';
import { mnemonicNew, mnemonicToWalletKey } from 'ton-crypto';
import chalk, { redBright } from 'chalk';
import axios from 'axios';
import axiosThrottle from 'axios-request-throttle';
import { get } from 'env-var';

import { DeployExecutorSchema } from './schema';

axiosThrottle.use(axios, { requestsPerSecond: 0.5 });

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('ts-node').register({});

export default async function runExecutor(
  options: DeployExecutorSchema,
  ctx: ExecutorContext
) {
  const envConfig: Partial<DeployExecutorSchema> = {
    isTestnet: get('TON_A_Z_DEPLOY_TESTNET').asBool(),
    workchain: get('TON_A_Z_DEPLOY_WORKCHAIN').asInt(),
    deployMnemonic: get('TON_A_Z_DEPLOY_MNEMONIC').asString(),
  };

  const envConfigFiltered = Object.entries(envConfig)
    .filter(([_, v]) => v !== undefined)
    .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {} as DeployExecutorSchema);
  const mergedConfig = {
    ...options,
    ...envConfigFiltered,
  };
  const { isTestnet, workchain } = mergedConfig;
  let { deployMnemonic } = mergedConfig;
  console.log(deployMnemonic);
  const projectRoot = ctx.workspace.projects[ctx.projectName as string].root;

  console.log(
    chalk.dim`=================================================================`
  );
  console.log(
    chalk.dim`Deploy script running, let's find some contracts to deploy..`
  );

  // check input arguments (given through environment variables)
  if (isTestnet) {
    console.log(
      chalk.dim`* deploying to`,
      chalk.whiteBright` TESTNET (https://t.me/testgiver_ton_bot will give you test TON)`
    );
  } else {
    console.log(chalk.yellowBright`* deploying to 'mainnet'`);
  }

  // initialize globals
  const client = new TonClient({
    endpoint: `https://${
      isTestnet ? 'testnet.' : ''
    }toncenter.com/api/v2/jsonRPC`,
  });

  const newContractFunding = toNano(0.02); // this will be (almost in full) the balance of a new deployed contract and allow it to pay rent

  console.log(
    chalk.dim`* deploying to workchain: `,
    chalk.whiteBright`${workchain}`
  );

  // make sure we have a wallet mnemonic to deploy from (or create one if not found)

  if (!deployMnemonic) {
    if (isTestnet) {
      console.log(
        chalk.yellowBright`* creating wallet mnemonic for 'testnet' deployment `,
        chalk.bgRedBright`!!!!DONT USE THIS MNEMONIC FOR MAINNET!!!!`
      );
      deployMnemonic = (await mnemonicNew(24)).join(' ');
      console.log(
        chalk.yellowBright`* created mnemonic (save this for future test runs): ${deployMnemonic}`,
        chalk.bgRedBright`!!!!SERIOUSLY DONT USE THIS FOR MAINNET!!!!`
      );
    } else {
      console.log(
        chalk.redBright`could not find deployMnemonic neither options nor in process.env.TON_A_Z_DEPLOY_MNEMONIC and deployment target is not 'testnet'`
      );
      throw new Error('deployMnemonic is required for deploying to mainnet');
    }
  }

  // open the wallet and make sure it has enough TON
  const walletKey = await mnemonicToWalletKey(deployMnemonic.split(' '));
  const walletContract = WalletContract.create(
    client,
    WalletV3R2Source.create({ publicKey: walletKey.publicKey, workchain })
  );

  console.log(
    chalk.dim` - Wallet address used to deploy from is: `,
    chalk.whiteBright`${walletContract.address.toFriendly()}`
  );

  const walletBalance = await client.getBalance(walletContract.address);
  if (walletBalance.lt(toNano(0.2))) {
    console.log(
      chalk.redBright` - ERROR: Wallet has less than 0.2 TON for gas (${fromNano(
        walletBalance
      )} TON), please send some TON for gas first`
    );
    throw new Error('Insufficient balance on Wallet address');
  } else {
    console.log(
      chalk.yellowBright` - Wallet balance is ${fromNano(
        walletBalance
      )} TON, which will be used for gas`
    );
  }

  // go over all the contracts we have deploy scripts for
  const rootContracts = glob.sync([`${projectRoot}/deploy/*.deploy.ts`]);
  console.log(
    chalk.dim`\nFound ${rootContracts.length} contracts to be deployed`
  );
  for (const rootContract of rootContracts) {
    // deploy a new root contract
    console.log(chalk.dim`* deploying '${rootContract}`);
    const contractName = path.parse(path.parse(rootContract).name).name;

    // prepare the init data cell
    console.log(
      chalk.dim` - importing ${path.resolve(
        ctx.root,
        projectRoot,
        'deploy',
        path.parse(rootContract).name
      )}`
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const deployInitScript = require(path.resolve(
      ctx.root,
      projectRoot,
      'deploy',
      path.parse(rootContract).name
    ));

    if (typeof deployInitScript.initData !== 'function') {
      console.log(
        chalk.red` - ERROR: '${rootContract}' does not have 'initData()' function`
      );
      throw new Error('Invalid deploy script');
    }

    const initDataCell = deployInitScript.initData() as Cell;

    // prepare the init message
    if (typeof deployInitScript.initMessage !== 'function') {
      console.log(
        chalk.red` - ERROR: '${rootContract}' does not have 'initMessage()' function`
      );
      throw new Error('Invalid deploy script');
    }
    const initMessageCell = deployInitScript.initMessage() as Cell | null;

    // prepare the init code cell
    const hexArtifact = `${projectRoot}/build/${contractName}.compiled.json`;
    if (!fs.existsSync(hexArtifact)) {
      console.log(
        chalk.red` - ERROR: '${hexArtifact}' not found, did you build?`
      );
      throw new Error('Could not find build info');
    }

    const initCodeCell = Cell.fromBoc(
      JSON.parse(fs.readFileSync(hexArtifact).toString()).hex
    )[0];

    // make sure the contract was not already deployed
    const newContractAddress = contractAddress({
      workchain,
      initialData: initDataCell,
      initialCode: initCodeCell,
    });
    console.log(
      chalk.dim` - Based on your init code+data, your new contract address is: `,
      chalk.whiteBright(newContractAddress.toFriendly())
    );

    if (await client.isContractDeployed(newContractAddress)) {
      console.log(
        chalk.yellow` - Looks like the contract is already deployed in this address, skipping deployment`
      );

      await performPostDeploymentTest(
        rootContract,
        deployInitScript,
        walletContract,
        walletKey.secretKey,
        newContractAddress
      );
      continue;
    }

    // deploy by sending an internal message to the deploying wallet
    console.log(
      chalk.dim` - Deploying contract: `,
      chalk.whiteBright`${newContractAddress.toFriendly()}`,
      chalk.dim`on chain: `,
      chalk.whiteBright`${workchain}`,
      chalk.dim` in net: `,
      chalk.whiteBright`${isTestnet ? 'TESTNET' : 'MAINNET'}`
    );

    const seqno = await walletContract.getSeqNo();
    const transfer = walletContract.createTransfer({
      secretKey: walletKey.secretKey,
      seqno: seqno,
      sendMode: SendMode.PAY_GAS_SEPARATLY + SendMode.IGNORE_ERRORS,
      order: new InternalMessage({
        to: newContractAddress,
        value: newContractFunding,
        bounce: false,
        body: new CommonMessageInfo({
          stateInit: new StateInit({ data: initDataCell, code: initCodeCell }),
          body:
            initMessageCell !== null ? new CellMessage(initMessageCell) : null,
        }),
      }),
    });

    console.log(chalk.dim`seqno: ${seqno}`);
    try {
      await client.sendExternalMessage(walletContract, transfer);
    } catch (err) {
      console.log(err);
      throw err;
    }
    console.log(chalk.greenBright` - Deploy transaction sent successfully`);

    // make sure that the contract was deployed
    console.log(
      chalk.dim` - Block explorer link: https://${
        process.env.TESTNET ? 'test.' : ''
      }tonwhales.com/explorer/address/${newContractAddress.toFriendly()}`
    );
    console.log(
      chalk.dim` - Waiting up to 20 seconds to check if the contract was actually deployed..`
    );
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(2000);
      const seqnoAfter = await walletContract.getSeqNo();
      if (seqnoAfter > seqno) break;
    }

    if (await client.isContractDeployed(newContractAddress)) {
      console.log(
        chalk.greenBright` - SUCCESS! Contract deployed successfully to address: `,
        chalk.whiteBright`${newContractAddress.toFriendly()}`
      );

      const contractBalance = await client.getBalance(newContractAddress);

      console.log(
        chalk.dim` - New contract balance is now ${fromNano(
          contractBalance
        )} TON, make sure it has enough to pay rent`
      );

      await performPostDeploymentTest(
        rootContract,
        deployInitScript,
        walletContract,
        walletKey.secretKey,
        newContractAddress
      );
    } else {
      console.log(
        redBright` - FAILURE! Contract address still looks uninitialized: ${newContractAddress.toFriendly()}`
      );
      throw new Error('Failed to deploy contract');
    }
  }

  return {
    success: true,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performPostDeploymentTest(
  rootContract: string,
  deployInitScript: any,
  walletContract: WalletContract,
  secretKey: Buffer,
  newContractAddress: Address
) {
  if (typeof deployInitScript.postDeployTest !== 'function') {
    console.log(
      chalk.yellow` - Not running a post deployment test, '${rootContract}' does not have 'postDeployTest()' function`
    );
    return;
  }
  console.log(chalk.dim` - Running a post deployment test:`);

  await deployInitScript.postDeployTest(
    walletContract,
    secretKey,
    newContractAddress
  );
}
