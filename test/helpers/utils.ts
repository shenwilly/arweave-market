import { BigNumber, BigNumberish, ContractReceipt } from "ethers";
import { ethers, network } from "hardhat";
import { USDC_ADDRESS, USDC_MINTER } from "../../constants";
import { ArweaveMarket, ArweaveMarketMediator } from "../../typechain";

export const getNextRequestId = async (
  arweaveMarket: ArweaveMarket
): Promise<BigNumber> => {
  return await arweaveMarket.getRequestsLength();
};

export const getNextDisputeId = async (
  mediator: ArweaveMarketMediator
): Promise<BigNumber> => {
  return await mediator.getDisputesLength();
};

export const getDisputeDeadlineTimestamp = async (
  mediator: ArweaveMarketMediator,
  disputeId: BigNumber
): Promise<number> => {
  const dispute = await mediator.disputes(disputeId);
  const deadline: BigNumber = dispute[2];
  return deadline.toNumber();
};

export const getArbitratorDisputeID = async (
  mediator: ArweaveMarketMediator,
  disputeId: BigNumber
): Promise<BigNumber> => {
  const dispute = await mediator.disputes(disputeId);
  return dispute[4];
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

export const getCurrentTimestamp = async (): Promise<BigNumber> => {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
};

export const fastForwardTo = async (expiryTimestamp: number) => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [expiryTimestamp]);
  await ethers.provider.send("evm_mine", []);
};

export const getTxFee = async (
  receipt: ContractReceipt
): Promise<BigNumber> => {
  return receipt.gasUsed.mul(receipt.effectiveGasPrice);
};
