# @ton-a-z/nx-ton

Nx plugin for `generating`, `building`, `testing` and `deploying` func smart contracts.

## Installation
For yarn
```shell
yarn add -D @ton-a-z/nx-ton
```
for npm
```shell
npm i --save-dev @ton-a-z/nx-ton
```

## Generators
### Library 
Run `nx generate @ton-a-z/nx-ton:library mylib` to generate the library with func smart contracts

## Executors

### Build

Run `nx build mylib` to compile func -> fift -> json containing BoC

### Test

Run `nx test mylib` run test files

### Deploy

Run `nx deploy mylib` run test files


| Param          | Equivalent ENV Variable  | Description                                     | Default Value           |
|----------------|--------------------------|-------------------------------------------------|-------------------------|
| isTestnet      | TON_A_Z_DEPLOY_TESTNET   | Specifies which network to use for deployment   | true                    |
| workchain      | TON_A_Z_DEPLOY_WORKCHAIN | Specifies which workchain to use for deployment | 0                       |
| deployMnemonic | TON_A_Z_DEPLOY_MNEMONIC  | Specifies which mnemonic to use for deployment  | generated if not passed |

NOTE: env variables override params passed form `project.json`, this was done to simplify deployment through CI/CD 

NOTE: don't pass `deployMnemonic` in `project.json` for mainnet deployment, rather use `TON_A_Z_DEPLOY_MNEMONIC`
