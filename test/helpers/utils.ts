import { BigNumber } from "ethers";
import { ArweaveMarket } from "../../typechain";

export const getNextRequestId = async (
  arweaveMarket: ArweaveMarket
): Promise<BigNumber> => {
  return await arweaveMarket.getRequestsLength();
};
