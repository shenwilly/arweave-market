# Arweave Market

Proof-of-concept [Arweave](https://github.com/ArweaveTeam) storage marketplace on EVM, allowing anyone to use Arweave by paying ETH or any ERC20 tokens.

Users can request the service by first uploading the file to IPFS, then submitting the hash to the contract. Anyone can fulfill the request by depositing a bond. They will then upload the file to Arweave and submit the tx id so it can be verified. After a period of time has passed and no dispute is raised, the payment and bond will be released to the uploader.

In case of dispute, a market mediator (default is contract owner) can be called to rule on the dispute. To prevent mediator misconduct, a decentralised arbitrator (such as [Kleros](https://github.com/kleros)) can be called by anyone to overrule the mediator.


## Installation

```
yarn && yarn install
yarn prepare
```

## Available Functionalities

### Clean and compile contracts
```
yarn build
```

### Run test
```
yarn test
```

### Check test coverage
```
yarn coverage
```

### Run script
```
yarn hardhat run PATH_TO_SCRIPT
```

### Run task
```
yarn hardhat HARDHAT_TASK
```

### Etherscan verification
Deploy your contract address first before verifying.

```
yarn hardhat run --network ropsten scripts/deploy.ts
yarn verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello"
```
