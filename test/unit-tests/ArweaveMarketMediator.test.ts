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
  fastForwardTo,
  getCurrentTimestamp,
  getNextDisputeId,
} from "../helpers/utils";
import { BigNumber } from "ethers";
import { DisputeWinner } from "../helpers/types";

const { expect } = chai;
chai.use(solidity);

describe("ArweaveMarketMediator", function () {
  let owner: SignerWithAddress;
  let requester: SignerWithAddress;
  let taker: SignerWithAddress;
  let ownerAddress: string;
  let requesterAddress: string;
  let takerAddress: string;

  let arweaveMarket: MockMarket;
  let mediator: ArweaveMarketMediator;
  let arbitrator: MockArbitrator;
  let disputeWindow: BigNumber;

  let snapshotId: string; // EVM snapshot before each test

  before("setup contracts", async () => {
    [owner, requester, taker] = await ethers.getSigners();
    ownerAddress = owner.address;
    requesterAddress = requester.address;
    takerAddress = taker.address;

    disputeWindow = BigNumber.from(100);

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
    it("should revert if sender is not market", async () => {
      await expect(mediator.connect(owner).createDispute(0)).to.be.revertedWith(
        "MarketMediator::onlyMarket:Sender is not market"
      );
    });
    it("should create dispute", async () => {
      const disputeId = await mediator.getDisputesLength();
      const requestId = 0;
      await expect(
        arweaveMarket
          .connect(requester)
          .createDispute(requestId, mediator.address)
      )
        .to.emit(mediator, "DisputeCreated")
        .withArgs(disputeId, requestId);

      const dispute = await mediator.disputes(disputeId);
      const now = await getCurrentTimestamp();

      expect(dispute[0]).to.be.eq(disputeId);
      expect(dispute[1]).to.be.eq(requestId);
      expect(dispute[2]).to.be.eq(now.add(disputeWindow));
      expect(dispute[3]).to.be.eq(false);
      expect(dispute[4]).to.be.eq(0);
      expect(dispute[5]).to.be.eq(false);
      expect(dispute[6]).to.be.eq(0);
      expect(dispute[7]).to.be.eq(false);

      expect(await mediator.requestToDispute(requestId)).to.be.eq(disputeId);
    });
  });

  describe("setDisputeWinner()", async () => {
    let disputeId: BigNumber;

    beforeEach(async () => {
      disputeId = await getNextDisputeId(mediator);
      await arweaveMarket.connect(requester).createDispute(0, mediator.address);
    });

    it("should revert if dispute doesn't exist", async () => {
      const requestsLength = await mediator.getDisputesLength();
      await expect(
        mediator
          .connect(owner)
          .setDisputeWinner(requestsLength.add(1), DisputeWinner.None)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if sender is not owner", async () => {
      await expect(
        mediator
          .connect(requester)
          .setDisputeWinner(disputeId, DisputeWinner.None)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if dispute is already resolved", async () => {
      const request = await mediator.disputes(disputeId);
      const deadline: BigNumber = request[2];
      const deadlineTimestamp = deadline.toNumber();
      await fastForwardTo(deadlineTimestamp);

      await mediator.connect(owner).resolveDispute(disputeId);
      await expect(
        mediator.connect(owner).setDisputeWinner(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::setDisputeWinner:Dispute already resolved"
      );
    });
    it("should revert if dispute deadline has been reached", async () => {
      const dispute = await mediator.disputes(disputeId);
      const deadline: BigNumber = dispute[2];
      const deadlineTimestamp = deadline.toNumber();
      await fastForwardTo(deadlineTimestamp);

      await expect(
        mediator.connect(owner).setDisputeWinner(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::setDisputeWinner:Deadline has been reached"
      );
    });
    it("should revert if dispute has been escalated to arbitrator", async () => {
      const arbitrationCost = await mediator.getArbitrationCost();
      await mediator.connect(requester).escalateDispute(disputeId, {
        value: arbitrationCost,
      });
      await expect(
        mediator.connect(owner).setDisputeWinner(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::setDisputeWinner:Dispute has been escalated to arbitrator"
      );
    });
    it("should set the dispute winner", async () => {
      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.Taker);
      const dispute1 = await mediator.disputes(disputeId);
      expect(dispute1[6]).to.be.eq(DisputeWinner.Taker);

      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.None);
      const dispute2 = await mediator.disputes(disputeId);
      expect(dispute2[6]).to.be.eq(DisputeWinner.None);
    });
  });

  describe("escalateDispute()", async () => {
    it("should revert if dispute is already resolved", async () => {
      // TODO
    });
    it("should revert if dispute deadline has been reached", async () => {
      // TODO
    });
    it("should revert if dispute has been escalated to arbitrator", async () => {
      // TODO
    });
    it("should revert if sent ETH doesn't equal arbitration cost", async () => {
      // TODO
    });
    it("should escalate dispute", async () => {
      // TODO
    });
  });

  describe("rule()", async () => {
    it("should revert if sender is not arbitrator", async () => {
      // TODO
    });
    it("should rule escalated dispute", async () => {
      // TODO
    });
  });

  describe("resolveDispute()", async () => {
    it("should revert if dispute is already resolved", async () => {
      // TODO
    });
    it("should revert if dispute deadline has not been reached", async () => {
      // TODO
    });
    it("should revert if arbitrator has not given ruling yet (only escalated)", async () => {
      // TODO
    });
    it("should resolve dispute", async () => {
      // TODO
    });
  });

  describe("_ruleDispute()", async () => {
    it("should revert if dispute is not escalated", async () => {
      // TODO
    });
    it("should revert if dispute is already ruled", async () => {
      // TODO
    });
  });

  describe("getArbitrationCost()", async () => {
    it("should return arbitration cost", async () => {
      // TODO
    });
  });

  describe("getDisputeIdFromRequestId()", async () => {
    it("should return requestId", async () => {
      // TODO
    });
  });

  describe("getRequestIdFromDisputeId()", async () => {
    it("should return requestId", async () => {
      // TODO
    });
  });

  describe("getMarket()", async () => {
    it("should return market address", async () => {
      // TODO
    });
  });
});
