import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  ArweaveMarketMediator__factory,
  ArweaveMarket__factory,
} from "../typechain";

async function main() {
  const FULFILL_WINDOW = BigNumber.from(86400);
  const VALIDATION_WINDOW = BigNumber.from(86400);
  const BOND = parseEther("0.1");
  const ARBITRATOR_ADDRESS = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
  const ARBITRATOR_EXTRADATA =
    "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003";
  const DISPUTE_WINDOW = BigNumber.from(86400);

  const ArweaveMarketFactory = <ArweaveMarket__factory>(
    await ethers.getContractFactory("ArweaveMarket")
  );
  const arweaveMarket = await ArweaveMarketFactory.deploy(
    FULFILL_WINDOW,
    VALIDATION_WINDOW,
    BOND
  );
  await arweaveMarket.deployed();
  console.log("ArweaveMarket deployed to:", arweaveMarket.address);

  const MarketMediatorFactory = <ArweaveMarketMediator__factory>(
    await ethers.getContractFactory("ArweaveMarketMediator")
  );
  const mediator = await MarketMediatorFactory.deploy(
    ARBITRATOR_ADDRESS,
    ARBITRATOR_EXTRADATA,
    DISPUTE_WINDOW
  );
  await mediator.deployed();
  console.log("Mediator deployed to:", mediator.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
