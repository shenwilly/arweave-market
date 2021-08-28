import { BigNumber, BigNumberish } from "ethers";
import { ethers, network } from "hardhat";
import { USDC_ADDRESS, USDC_MINTER } from "../../constants";
import { ArweaveMarket } from "../../typechain";

export const getNextRequestId = async (
  arweaveMarket: ArweaveMarket
): Promise<BigNumber> => {
  return await arweaveMarket.getRequestsLength();
};

export const mintUsdc = async (amount: BigNumberish, to: string) => {
  const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [USDC_MINTER],
  });

  const usdcWalletSigner = await ethers.getSigner(USDC_MINTER);
  await usdc.connect(usdcWalletSigner).transfer(to, amount);
};

export const getCurrentTimestamp = async () => {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
};

export const fastForwardTo = async (expiryTimestamp: number) => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [expiryTimestamp]);
  await ethers.provider.send("evm_mine", []);
};
