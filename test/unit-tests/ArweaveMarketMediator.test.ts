import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ArweaveMarketMediator,
  ArweaveMarketMediator__factory,
  MockArbitrator,
  MockArbitrator__factory,
  MockMarket,
  MockMarket__factory,
} from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  DUMMY_ETH_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "../../constants";
import {
  fastForwardTo,
  getCurrentTimestamp,
  getNextRequestId,
  getTxFee,
  mintUsdc,
} from "../helpers/utils";
import { Contract } from "@ethersproject/contracts";
import { parseEther, parseUnits } from "@ethersproject/units";
import { BigNumber } from "ethers";
import { DisputeWinner, RequestPeriod } from "../helpers/types";

const { expect } = chai;
chai.use(solidity);

describe("ArweaveMarketMediator", function () {
  let owner: SignerWithAddress;
  let requester: SignerWithAddress;
  let taker: SignerWithAddress;
  let ownerAddress: string;
  let requesterAddress: string;
  let takerAddress: string;

  let usdc: Contract;

  let arweaveMarket: MockMarket;
  let mediator: ArweaveMarketMediator;
  let arbitrator: MockArbitrator;
  let fulfillWindow: BigNumber;
  let validationWindow: BigNumber;
  let disputeWindow: BigNumber;

  let snapshotId: string; // EVM snapshot before each test

  const defaultFileHash = "sample-file-hash";
  const defaultArweaveTxId = "lOBCN7P_-hfZAXPNP92LLyek_h71I1KxrT2akqT-zfU";
  const AddressZero = ethers.constants.AddressZero;

  before("setup contracts", async () => {
    [owner, requester, taker] = await ethers.getSigners();
    ownerAddress = owner.address;
    requesterAddress = requester.address;
    takerAddress = taker.address;

    fulfillWindow = validationWindow = disputeWindow = BigNumber.from(100);

    const MockArbitratorFactory = <MockArbitrator__factory>(
      await ethers.getContractFactory("MockArbitrator")
    );
    arbitrator = await MockArbitratorFactory.deploy();

    const MarketMediatorFactory = <ArweaveMarketMediator__factory>(
      await ethers.getContractFactory("ArweaveMarketMediator")
    );
    mediator = await MarketMediatorFactory.deploy(
      arbitrator.address,
      "0x",
      disputeWindow
    );

    const MockMarketFactory = <MockMarket__factory>(
      await ethers.getContractFactory("MockMarket")
    );
    arweaveMarket = await MockMarketFactory.connect(owner).deploy();
    await mediator.connect(owner).initMarket(arweaveMarket.address);
    // await arweaveMarket.connect(owner).initMediator(mediator.address);

    usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("initMarket()", async () => {
    let arweaveMarket: MockMarket;
    let mediator: ArweaveMarketMediator;

    beforeEach(async () => {
      const MarketMediatorFactory = <ArweaveMarketMediator__factory>(
        await ethers.getContractFactory("ArweaveMarketMediator")
      );
      mediator = await MarketMediatorFactory.deploy(
        requesterAddress,
        "0x",
        disputeWindow
      );

      const MockMarketFactory = <MockMarket__factory>(
        await ethers.getContractFactory("MockMarket")
      );
      arweaveMarket = await MockMarketFactory.connect(owner).deploy();
    });

    it("should revert if sender is not owner", async () => {
      await expect(
        mediator.connect(requester).initMarket(arweaveMarket.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if mediator is already initialised", async () => {
      await mediator.connect(owner).initMarket(arweaveMarket.address);

      await expect(
        mediator.connect(owner).initMarket(arweaveMarket.address)
      ).to.be.revertedWith(
        "MarketMediator::initMarket:Market already initialised"
      );
    });
    it("should set market", async () => {
      const oldValue = await mediator.market();
      const newValue = mediator.address;
      expect(oldValue).to.be.not.eq(newValue);
      await mediator.connect(owner).initMarket(newValue);
      expect(await mediator.market()).to.be.eq(newValue);
    });
  });

  describe("createDispute()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("setDisputeWinner()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("escalateDispute()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("rule()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("resolveDispute()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("_ruleDispute()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("getArbitrationCost()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("getDisputeIdFromRequestId()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("getRequestIdFromDisputeId()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });

  describe("getMarket()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
  });
});
