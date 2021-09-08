import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ArweaveMarketMediator,
  ArweaveMarketMediator__factory,
  MockArbitrator,
  MockArbitrator__factory,
  MockMarket,
  MockMarket__factory,
  MockMediatorWrapper,
  MockMediatorWrapper__factory,
} from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  fastForwardTo,
  getArbitrationExtraData,
  getArbitratorDisputeID,
  getCurrentTimestamp,
  getDisputeDeadlineTimestamp,
  getNextDisputeId,
} from "../helpers/utils";
import { BigNumber } from "ethers";
import { DisputeWinner } from "../helpers/types";
import { parseEther } from "@ethersproject/units";

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
  let arbitrationCost: BigNumber;

  let snapshotId: string; // EVM snapshot before each test

  before("setup contracts", async () => {
    [owner, requester, taker] = await ethers.getSigners();
    ownerAddress = owner.address;
    requesterAddress = requester.address;
    takerAddress = taker.address;

    disputeWindow = BigNumber.from(100);
    const extraData = getArbitrationExtraData("0", 3);

    const MockArbitratorFactory = <MockArbitrator__factory>(
      await ethers.getContractFactory("MockArbitrator")
    );
    arbitrator = await MockArbitratorFactory.deploy(parseEther("0.1"));
    arbitrationCost = await arbitrator.arbitrationCost("0x");

    const MarketMediatorFactory = <ArweaveMarketMediator__factory>(
      await ethers.getContractFactory("ArweaveMarketMediator")
    );
    mediator = await MarketMediatorFactory.deploy(
      arbitrator.address,
      extraData,
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
      const deadlineTimestamp = await getDisputeDeadlineTimestamp(
        mediator,
        disputeId
      );
      await fastForwardTo(deadlineTimestamp);

      await mediator.connect(owner).resolveDispute(disputeId);
      await expect(
        mediator.connect(owner).setDisputeWinner(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::setDisputeWinner:Dispute already resolved"
      );
    });
    it("should revert if dispute deadline has been reached", async () => {
      const deadlineTimestamp = await getDisputeDeadlineTimestamp(
        mediator,
        disputeId
      );
      await fastForwardTo(deadlineTimestamp);

      await expect(
        mediator.connect(owner).setDisputeWinner(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::setDisputeWinner:Deadline has been reached"
      );
    });
    it("should revert if dispute has been escalated to arbitrator", async () => {
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
    let disputeId: BigNumber;

    beforeEach(async () => {
      disputeId = await getNextDisputeId(mediator);
      await arweaveMarket.connect(requester).createDispute(0, mediator.address);
    });

    it("should revert if dispute doesn't exist", async () => {
      const requestsLength = await mediator.getDisputesLength();
      await expect(
        mediator.connect(owner).escalateDispute(requestsLength.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if dispute is already resolved", async () => {
      const deadlineTimestamp = await getDisputeDeadlineTimestamp(
        mediator,
        disputeId
      );
      await fastForwardTo(deadlineTimestamp);

      await mediator.connect(owner).resolveDispute(disputeId);
      await expect(
        mediator.connect(owner).escalateDispute(disputeId)
      ).to.be.revertedWith(
        "MarketMediator::escalateDispute:Dispute already resolved"
      );
    });
    it("should revert if dispute deadline has been reached", async () => {
      const deadlineTimestamp = await getDisputeDeadlineTimestamp(
        mediator,
        disputeId
      );
      await fastForwardTo(deadlineTimestamp);

      await expect(
        mediator.connect(owner).escalateDispute(disputeId)
      ).to.be.revertedWith(
        "MarketMediator::escalateDispute:Deadline has been reached"
      );
    });
    it("should revert if dispute has been escalated to arbitrator", async () => {
      await mediator.connect(owner).escalateDispute(disputeId, {
        value: arbitrationCost,
      });

      await expect(
        mediator.connect(owner).escalateDispute(disputeId)
      ).to.be.revertedWith(
        "MarketMediator::escalateDispute:Dispute has been escalated to arbitrator"
      );
    });
    it("should revert if sent ETH doesn't equal arbitration cost", async () => {
      await expect(
        mediator.connect(owner).escalateDispute(disputeId, {
          value: arbitrationCost.add(1),
        })
      ).to.be.revertedWith("MarketMediator::escalateDispute:Invalid msg.value");
    });
    it("should escalate dispute", async () => {
      await expect(
        mediator.connect(owner).escalateDispute(disputeId, {
          value: arbitrationCost,
        })
      )
        .to.emit(mediator, "DisputeEscalated")
        .withArgs(disputeId);

      const dispute = await mediator.disputes(disputeId);
      expect(dispute[3]).to.be.eq(true);
    });
  });

  describe("rule()", async () => {
    let disputeId: BigNumber;
    let arbitratorDisputeId: BigNumber;

    beforeEach(async () => {
      disputeId = await getNextDisputeId(mediator);
      await arweaveMarket.connect(requester).createDispute(0, mediator.address);
      await mediator.escalateDispute(disputeId, {
        value: arbitrationCost,
      });

      arbitratorDisputeId = await getArbitratorDisputeID(mediator, disputeId);
    });

    it("should revert if sender is not arbitrator", async () => {
      await expect(mediator.connect(requester).rule(0, 0)).to.be.revertedWith(
        "MarketMediator::onlyArbitrator:Sender is not arbitrator"
      );
    });
    it("should rule escalated dispute", async () => {
      const ruling = 1;

      await expect(
        arbitrator
          .connect(requester)
          .giveRuling(mediator.address, arbitratorDisputeId, ruling)
      )
        .to.emit(mediator, "Ruling")
        .withArgs(arbitrator.address, arbitratorDisputeId, ruling);
    });
  });

  describe("resolveDispute()", async () => {
    let disputeId: BigNumber;
    let deadlineTimestamp: number;

    beforeEach(async () => {
      disputeId = await getNextDisputeId(mediator);
      await arweaveMarket.connect(requester).createDispute(0, mediator.address);
      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.Taker);

      deadlineTimestamp = await getDisputeDeadlineTimestamp(
        mediator,
        disputeId
      );
    });

    it("should revert if dispute doesn't exist", async () => {
      const requestsLength = await mediator.getDisputesLength();
      await expect(
        mediator.connect(owner).resolveDispute(requestsLength.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if dispute is already resolved", async () => {
      await fastForwardTo(deadlineTimestamp);
      await mediator.connect(owner).resolveDispute(disputeId);
      await expect(
        mediator.connect(owner).resolveDispute(disputeId)
      ).to.be.revertedWith(
        "MarketMediator::resolveDispute:Dispute already resolved"
      );
    });
    it("should revert if dispute deadline has not been reached", async () => {
      await expect(
        mediator.connect(owner).resolveDispute(disputeId)
      ).to.be.revertedWith(
        "MarketMediator::resolveDispute:Deadline has not been reached"
      );
    });
    it("should revert if arbitrator has not given ruling yet (only escalated)", async () => {
      await mediator.connect(owner).escalateDispute(disputeId, {
        value: arbitrationCost,
      });

      await fastForwardTo(deadlineTimestamp);

      await expect(
        mediator.connect(owner).resolveDispute(disputeId)
      ).to.be.revertedWith(
        "MarketMediator::resolveDispute:Arbitrator has not ruled yet"
      );
    });
    it("should resolve dispute (None)", async () => {
      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.None);
      await fastForwardTo(deadlineTimestamp);

      await expect(mediator.connect(owner).resolveDispute(disputeId))
        .to.emit(mediator, "DisputeResolved")
        .withArgs(disputeId, DisputeWinner.None);
    });
    it("should resolve dispute (Requester)", async () => {
      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.Requester);
      await fastForwardTo(deadlineTimestamp);

      await expect(mediator.connect(owner).resolveDispute(disputeId))
        .to.emit(mediator, "DisputeResolved")
        .withArgs(disputeId, DisputeWinner.Requester);
    });
    it("should resolve dispute (Taker)", async () => {
      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.Taker);
      await fastForwardTo(deadlineTimestamp);

      await expect(mediator.connect(owner).resolveDispute(disputeId))
        .to.emit(mediator, "DisputeResolved")
        .withArgs(disputeId, DisputeWinner.Taker);
    });
    it("should resolve escalated dispute", async () => {
      await mediator
        .connect(owner)
        .setDisputeWinner(disputeId, DisputeWinner.Taker);
      await mediator.connect(taker).escalateDispute(disputeId, {
        value: arbitrationCost,
      });
      const arbitratorDisputeId = await getArbitratorDisputeID(
        mediator,
        disputeId
      );
      await arbitrator
        .connect(taker)
        .giveRuling(
          mediator.address,
          arbitratorDisputeId,
          DisputeWinner.Requester
        );
      await fastForwardTo(deadlineTimestamp);

      await expect(mediator.connect(owner).resolveDispute(disputeId))
        .to.emit(mediator, "DisputeResolved")
        .withArgs(disputeId, DisputeWinner.Requester);
    });
  });

  describe("_ruleDispute()", async () => {
    let disputeId: BigNumber;
    let mediator: MockMediatorWrapper;

    beforeEach(async () => {
      const MockArbitratorFactory = <MockArbitrator__factory>(
        await ethers.getContractFactory("MockArbitrator")
      );
      const arbitrator = await MockArbitratorFactory.deploy(parseEther("0.1"));

      const MarketMediatorFactory = <MockMediatorWrapper__factory>(
        await ethers.getContractFactory("MockMediatorWrapper")
      );
      mediator = await MarketMediatorFactory.deploy(
        arbitrator.address,
        "0x",
        disputeWindow
      );
      await mediator.initMarket(arweaveMarket.address);

      disputeId = await mediator.getDisputesLength();
      await arweaveMarket.connect(requester).createDispute(0, mediator.address);
    });

    it("should revert if dispute doesn't exist", async () => {
      const requestsLength = await mediator.getDisputesLength();
      await expect(
        mediator
          .connect(owner)
          .ruleDispute(requestsLength.add(1), DisputeWinner.None)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if dispute is not escalated", async () => {
      await expect(
        mediator.connect(owner).ruleDispute(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::_ruleDispute:Dispute is not escalated"
      );
    });
    it("should revert if dispute is already ruled", async () => {
      await mediator.connect(taker).escalateDispute(disputeId, {
        value: arbitrationCost,
      });
      await mediator.connect(owner).ruleDispute(disputeId, DisputeWinner.Taker);
      await expect(
        mediator.connect(owner).ruleDispute(disputeId, DisputeWinner.None)
      ).to.be.revertedWith(
        "MarketMediator::_ruleDispute:Dispute is already ruled"
      );
    });
    it("should rule dispute", async () => {
      const disputePre = await mediator.disputes(disputeId);
      expect(disputePre[5]).to.be.eq(false);
      expect(disputePre[6]).to.be.eq(DisputeWinner.None);

      await mediator.connect(taker).escalateDispute(disputeId, {
        value: arbitrationCost,
      });
      await mediator.connect(owner).ruleDispute(disputeId, DisputeWinner.Taker);

      const disputePost = await mediator.disputes(disputeId);
      expect(disputePost[5]).to.be.eq(true);
      expect(disputePost[6]).to.be.eq(DisputeWinner.Taker);
    });
  });

  describe("setArbitrationExtraData()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        mediator.connect(requester).setArbitrationExtraData("0x")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should set new arbitrationExtraData", async () => {
      const oldExtraData = await mediator.arbitrationExtraData();
      const newExtraData = getArbitrationExtraData("0", 5);
      expect(oldExtraData).to.not.be.eq(newExtraData);
      await mediator.connect(owner).setArbitrationExtraData(newExtraData);
      expect(await mediator.arbitrationExtraData()).to.be.eq(newExtraData);
    });
  });

  describe("getArbitrationCost()", async () => {
    it("should return arbitration cost", async () => {
      const arbitrationCost = await arbitrator.arbitrationCost("0x");
      expect(await mediator.getArbitrationCost()).to.be.eq(arbitrationCost);
    });
  });

  describe("getDisputeIdFromRequestId()", async () => {
    it("should return requestId", async () => {
      const requestId = 10;
      const disputeId = await getNextDisputeId(mediator);
      await arweaveMarket.createDispute(requestId, mediator.address);
      expect(await mediator.getDisputeIdFromRequestId(requestId)).to.be.eq(
        disputeId
      );
    });
  });

  describe("getRequestIdFromDisputeId()", async () => {
    it("should return requestId", async () => {
      const requestId = 10;
      const disputeId = await getNextDisputeId(mediator);
      await arweaveMarket.createDispute(requestId, mediator.address);
      expect(await mediator.getRequestIdFromDisputeId(disputeId)).to.be.eq(
        requestId
      );
    });
  });

  describe("getMarket()", async () => {
    it("should return market address", async () => {
      expect(await mediator.getMarket()).to.be.eq(arweaveMarket.address);
    });
  });
});
