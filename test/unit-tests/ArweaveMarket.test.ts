import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ArweaveMarket,
  ArweaveMarket__factory,
  MockMediator,
  MockMediator__factory,
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
import { RequestPeriod } from "../helpers/types";
import { request } from "http";

const { expect } = chai;
chai.use(solidity);

describe("ArweaveMarket", function () {
  let owner: SignerWithAddress;
  let requester: SignerWithAddress;
  let taker: SignerWithAddress;
  let ownerAddress: string;
  let requesterAddress: string;
  let takerAddress: string;

  let usdc: Contract;

  let arweaveMarket: ArweaveMarket;
  let fulfillWindow: BigNumber;
  let validationWindow: BigNumber;

  let snapshotId: string; // EVM snapshot before each test

  const defaultFileHash = "sample-file-hash";
  const defaultArweaveTxId = "lOBCN7P_-hfZAXPNP92LLyek_h71I1KxrT2akqT-zfU";
  const AddressZero = ethers.constants.AddressZero;

  before("setup contracts", async () => {
    [owner, requester, taker] = await ethers.getSigners();
    ownerAddress = owner.address;
    requesterAddress = requester.address;
    takerAddress = taker.address;

    fulfillWindow = validationWindow = BigNumber.from(100);

    const MockMediatorFactory = <MockMediator__factory>(
      await ethers.getContractFactory("MockMediator")
    );
    const mediator = await MockMediatorFactory.deploy();

    const ArweaveMarketFactory = <ArweaveMarket__factory>(
      await ethers.getContractFactory("ArweaveMarket")
    );
    arweaveMarket = await ArweaveMarketFactory.connect(owner).deploy(
      fulfillWindow,
      validationWindow
    );
    await mediator.connect(owner).initMarket(arweaveMarket.address);
    await arweaveMarket.connect(owner).initMediator(mediator.address);

    usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("createRequest()", async () => {
    it("should revert if token is address(0)", async () => {
      await expect(
        arweaveMarket
          .connect(requester)
          .createRequest(defaultFileHash, AddressZero, 1)
      ).to.be.revertedWith(
        "Transaction reverted: function call to a non-contract account"
      );
    });
    it("should revert if payment token is not approved", async () => {
      await expect(
        arweaveMarket
          .connect(requester)
          .createRequest(defaultFileHash, USDC_ADDRESS, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });
    it("should revert if payment token balance is not enough", async () => {
      await usdc.connect(requester).approve(arweaveMarket.address, 1);
      await expect(
        arweaveMarket
          .connect(requester)
          .createRequest(defaultFileHash, USDC_ADDRESS, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
    it("should create a request (token payment)", async () => {
      const requestId = await getNextRequestId(arweaveMarket);

      const amount = parseUnits("100", USDC_DECIMALS);
      await usdc.connect(requester).approve(arweaveMarket.address, amount);
      await mintUsdc(amount, requesterAddress);

      const balanceBefore = await usdc.balanceOf(requesterAddress);

      await expect(
        arweaveMarket
          .connect(requester)
          .createRequest(defaultFileHash, USDC_ADDRESS, amount)
      )
        .to.emit(arweaveMarket, "RequestCreated")
        .withArgs(requestId, requesterAddress, defaultFileHash);

      const balanceAfter = await usdc.balanceOf(requesterAddress);
      expect(balanceBefore.sub(balanceAfter)).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[0]).to.be.eq(requestId);
      expect(request[1]).to.be.eq(defaultFileHash);
      expect(request[2]).to.be.eq("");
      expect(request[3]).to.be.eq(requesterAddress);
      expect(request[4]).to.be.eq(AddressZero);
      expect(request[5]).to.be.eq(usdc.address);
      expect(request[6]).to.be.eq(amount);
      expect(request[7]).to.be.eq(0);
      expect(request[8]).to.be.eq(0);
      expect(request[9]).to.be.eq(RequestPeriod.Waiting);
    });
    it("should create a request (ETH payment)", async () => {
      const requestId = await getNextRequestId(arweaveMarket);

      const amount = parseEther("0.15");
      const balanceBefore = await ethers.provider.getBalance(
        arweaveMarket.address
      );

      await expect(
        arweaveMarket
          .connect(requester)
          .createRequest(defaultFileHash, DUMMY_ETH_ADDRESS, 0, {
            value: amount,
          })
      )
        .to.emit(arweaveMarket, "RequestCreated")
        .withArgs(requestId, requesterAddress, defaultFileHash);

      const balanceAfter = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      expect(balanceAfter.sub(balanceBefore)).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[0]).to.be.eq(requestId);
      expect(request[1]).to.be.eq(defaultFileHash);
      expect(request[2]).to.be.eq("");
      expect(request[3]).to.be.eq(requesterAddress);
      expect(request[4]).to.be.eq(AddressZero);
      expect(request[5]).to.be.eq(DUMMY_ETH_ADDRESS);
      expect(request[6]).to.be.eq(amount);
      expect(request[7]).to.be.eq(0);
      expect(request[8]).to.be.eq(0);
      expect(request[9]).to.be.eq(RequestPeriod.Waiting);
    });
  });

  describe("takeRequest()", async () => {
    let requestId: BigNumber;
    const amount = 0;

    beforeEach(async () => {
      requestId = await getNextRequestId(arweaveMarket);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, amount);
    });

    it("should revert if request doesn't exist", async () => {
      const requestsLength = await arweaveMarket.getRequestsLength();
      await expect(
        arweaveMarket.connect(taker).takeRequest(requestsLength.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if request is not in waiting period", async () => {
      await arweaveMarket.connect(taker).takeRequest(requestId);
      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.not.be.eq(RequestPeriod.Waiting);
      await expect(
        arweaveMarket.connect(taker).takeRequest(requestId)
      ).to.be.revertedWith("ArweaveMarket::onlyPeriod:Invalid Period");
    });
    it("should take request", async () => {
      await expect(arweaveMarket.connect(taker).takeRequest(requestId))
        .to.emit(arweaveMarket, "RequestTaken")
        .withArgs(requestId, takerAddress);
      const now = await getCurrentTimestamp();

      const request = await arweaveMarket.requests(requestId);
      expect(request[4]).to.be.eq(takerAddress);
      expect(request[7]).to.be.eq(now.add(fulfillWindow));
      expect(request[9]).to.be.eq(RequestPeriod.Processing);
    });
  });

  describe("fulfillRequest()", async () => {
    let requestId: BigNumber;
    const amount = 0;

    beforeEach(async () => {
      requestId = await getNextRequestId(arweaveMarket);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, amount);
      await arweaveMarket.connect(taker).takeRequest(requestId);
    });

    it("should revert if request doesn't exist", async () => {
      const requestsLength = await arweaveMarket.getRequestsLength();
      await expect(
        arweaveMarket
          .connect(taker)
          .fulfillRequest(requestsLength.add(1), defaultArweaveTxId)
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if request is not in processing period", async () => {
      requestId = await getNextRequestId(arweaveMarket);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, 0);
      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.not.be.eq(RequestPeriod.Processing);
      await expect(
        arweaveMarket
          .connect(taker)
          .fulfillRequest(requestId, defaultArweaveTxId)
      ).to.be.revertedWith("ArweaveMarket::onlyPeriod:Invalid Period");
    });
    it("should revert if sender is not taker", async () => {
      await expect(
        arweaveMarket
          .connect(requester)
          .fulfillRequest(requestId, defaultArweaveTxId)
      ).to.be.revertedWith("ArweaveMarket::fulfillRequest:Sender is not taker");
    });
    it("should fulfill request", async () => {
      await expect(
        arweaveMarket
          .connect(taker)
          .fulfillRequest(requestId, defaultArweaveTxId)
      )
        .to.emit(arweaveMarket, "RequestFulfilled")
        .withArgs(requestId, defaultArweaveTxId);
      const now = await getCurrentTimestamp();

      const request = await arweaveMarket.requests(requestId);
      expect(request[2]).to.be.eq(defaultArweaveTxId);
      expect(request[8]).to.be.eq(now.add(validationWindow));
      expect(request[9]).to.be.eq(RequestPeriod.Validating);
    });
  });

  describe("disputeRequest()", async () => {
    // TODO
  });

  describe("resolveDispute()", async () => {
    // TODO
  });

  describe("finishRequest()", async () => {
    let requestId: BigNumber;
    let validationDeadlineTimestamp: number;
    const amount = parseUnits("100", USDC_DECIMALS);

    beforeEach(async () => {
      requestId = await getNextRequestId(arweaveMarket);

      await usdc.connect(requester).approve(arweaveMarket.address, amount);
      await mintUsdc(amount, requesterAddress);

      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, amount);
      await arweaveMarket.connect(taker).takeRequest(requestId);
      await arweaveMarket
        .connect(taker)
        .fulfillRequest(requestId, defaultFileHash);

      const request = await arweaveMarket.requests(requestId);
      const validationDeadline: BigNumber = request[8];
      validationDeadlineTimestamp = validationDeadline.toNumber();
    });

    it("should revert if request doesn't exist", async () => {
      const requestsLength = await arweaveMarket.getRequestsLength();
      await expect(
        arweaveMarket.connect(requester).finishRequest(requestsLength.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if request is not in validating period", async () => {
      requestId = await getNextRequestId(arweaveMarket);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, 0);
      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.not.be.eq(RequestPeriod.Validating);
      await expect(
        arweaveMarket.connect(requester).finishRequest(requestId)
      ).to.be.revertedWith("ArweaveMarket::onlyPeriod:Invalid Period");
    });
    it("should revert if request is validation deadline has not been reached", async () => {
      await expect(
        arweaveMarket.connect(requester).finishRequest(requestId)
      ).to.be.revertedWith(
        "ArweaveMarket::finishRequest:Validation deadline has not been reached"
      );
    });
    it("should finish request (token payment)", async () => {
      await fastForwardTo(validationDeadlineTimestamp);
      const balanceBefore = await usdc.balanceOf(takerAddress);

      await expect(arweaveMarket.connect(requester).finishRequest(requestId))
        .to.emit(arweaveMarket, "RequestFinished")
        .withArgs(requestId);

      const balanceAfter = await usdc.balanceOf(takerAddress);
      expect(balanceAfter.sub(balanceBefore)).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.be.eq(RequestPeriod.Finished);
    });
    it("should finish request (ETH payment)", async () => {
      requestId = await getNextRequestId(arweaveMarket);
      const amount = parseEther("1");

      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, DUMMY_ETH_ADDRESS, 0, {
          value: amount,
        });
      await arweaveMarket.connect(taker).takeRequest(requestId);
      await arweaveMarket
        .connect(taker)
        .fulfillRequest(requestId, defaultFileHash);

      const requestPre = await arweaveMarket.requests(requestId);
      const validationDeadline: BigNumber = requestPre[8];
      const validationDeadlineTimestamp = validationDeadline.toNumber();

      await fastForwardTo(validationDeadlineTimestamp);
      const balanceBeforeContract = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      const balanceBeforeTaker = await ethers.provider.getBalance(takerAddress);

      await expect(arweaveMarket.connect(requester).finishRequest(requestId))
        .to.emit(arweaveMarket, "RequestFinished")
        .withArgs(requestId);

      const balanceAfterContract = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      expect(balanceBeforeContract.sub(balanceAfterContract)).to.be.eq(amount);

      const balanceAfterTaker = await ethers.provider.getBalance(takerAddress);
      expect(balanceAfterTaker.sub(balanceBeforeTaker)).to.be.eq(amount);

      const requestPost = await arweaveMarket.requests(requestId);
      expect(requestPost[9]).to.be.eq(RequestPeriod.Finished);
    });
  });

  describe("cancelRequest()", async () => {
    let requestId: BigNumber;
    const amount = parseUnits("100", USDC_DECIMALS);

    beforeEach(async () => {
      requestId = await getNextRequestId(arweaveMarket);

      await usdc.connect(requester).approve(arweaveMarket.address, amount);
      await mintUsdc(amount, requesterAddress);

      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, amount);
    });

    it("should revert if request doesn't exist", async () => {
      const requestsLength = await arweaveMarket.getRequestsLength();
      await expect(
        arweaveMarket.connect(requester).cancelRequest(requestsLength.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if request is not in waiting period", async () => {
      await arweaveMarket.connect(taker).takeRequest(requestId);
      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.not.be.eq(RequestPeriod.Waiting);
      await expect(
        arweaveMarket.connect(requester).cancelRequest(requestId)
      ).to.be.revertedWith("ArweaveMarket::onlyPeriod:Invalid Period");
    });
    it("should revert if sender is not requester", async () => {
      await expect(
        arweaveMarket.connect(taker).cancelRequest(requestId)
      ).to.be.revertedWith(
        "ArweaveMarket::cancelRequest:Sender is not requester"
      );
    });
    it("should cancel request (token payment)", async () => {
      const balanceBefore = await usdc.balanceOf(requesterAddress);

      await expect(arweaveMarket.connect(requester).cancelRequest(requestId))
        .to.emit(arweaveMarket, "RequestCancelled")
        .withArgs(requestId);

      const balanceAfter = await usdc.balanceOf(requesterAddress);
      expect(balanceAfter.sub(balanceBefore)).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.be.eq(RequestPeriod.Finished);
    });
    it("should cancel request (ETH payment)", async () => {
      requestId = await getNextRequestId(arweaveMarket);
      const amount = parseEther("1");

      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, DUMMY_ETH_ADDRESS, 0, {
          value: amount,
        });

      const balanceBeforeContract = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      const balanceBeforeRequester = await ethers.provider.getBalance(
        requesterAddress
      );

      const tx = await arweaveMarket
        .connect(requester)
        .cancelRequest(requestId);
      expect(tx).to.emit(arweaveMarket, "RequestCancelled").withArgs(requestId);

      const receipt = await tx.wait();
      const txFee = await getTxFee(receipt);

      const balanceAfterContract = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      expect(balanceBeforeContract.sub(balanceAfterContract)).to.be.eq(amount);

      const balanceAfterRequester = await ethers.provider.getBalance(
        requesterAddress
      );
      expect(
        balanceAfterRequester.sub(balanceBeforeRequester).add(txFee)
      ).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.be.eq(RequestPeriod.Finished);
    });
  });

  describe("cancelRequestTimeout()", async () => {
    let requestId: BigNumber;
    let fulfillDeadlineTimestamp: number;
    const amount = parseUnits("100", USDC_DECIMALS);

    beforeEach(async () => {
      requestId = await getNextRequestId(arweaveMarket);

      await usdc.connect(requester).approve(arweaveMarket.address, amount);
      await mintUsdc(amount, requesterAddress);

      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, amount);
      await arweaveMarket.connect(taker).takeRequest(requestId);

      const request = await arweaveMarket.requests(requestId);
      const fulfillDeadline: BigNumber = request[7];
      fulfillDeadlineTimestamp = fulfillDeadline.toNumber();
    });

    it("should revert if request doesn't exist", async () => {
      const requestsLength = await arweaveMarket.getRequestsLength();
      await expect(
        arweaveMarket
          .connect(requester)
          .cancelRequestTimeout(requestsLength.add(1))
      ).to.be.revertedWith(
        "reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)"
      );
    });
    it("should revert if request is not in processing period", async () => {
      const requestId = await getNextRequestId(arweaveMarket);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, 0);
      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.not.be.eq(RequestPeriod.Processing);
      await expect(
        arweaveMarket.connect(requester).cancelRequestTimeout(requestId)
      ).to.be.revertedWith("ArweaveMarket::onlyPeriod:Invalid Period");
    });
    it("should revert if sender is not requester", async () => {
      await expect(
        arweaveMarket.connect(taker).cancelRequestTimeout(requestId)
      ).to.be.revertedWith(
        "ArweaveMarket::cancelRequestTimeout:Sender is not requester"
      );
    });
    it("should revert if request is fulfill deadline has not been reached", async () => {
      await expect(
        arweaveMarket.connect(requester).cancelRequestTimeout(requestId)
      ).to.be.revertedWith(
        "ArweaveMarket::cancelRequestTimeout:Fulfill deadline has not been reached"
      );
    });
    it("should cancel request (token payment)", async () => {
      await fastForwardTo(fulfillDeadlineTimestamp);
      const balanceBefore = await usdc.balanceOf(requesterAddress);

      await expect(
        arweaveMarket.connect(requester).cancelRequestTimeout(requestId)
      )
        .to.emit(arweaveMarket, "RequestCancelled")
        .withArgs(requestId);

      const balanceAfter = await usdc.balanceOf(requesterAddress);
      expect(balanceAfter.sub(balanceBefore)).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.be.eq(RequestPeriod.Finished);
    });
    it("should cancel request (ETH payment)", async () => {
      const requestId = await getNextRequestId(arweaveMarket);
      const amount = parseEther("1");

      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, DUMMY_ETH_ADDRESS, 0, {
          value: amount,
        });
      await arweaveMarket.connect(taker).takeRequest(requestId);

      const requestPre = await arweaveMarket.requests(requestId);
      const fulfillDeadline: BigNumber = requestPre[7];
      const fulfillDeadlineTimestamp = fulfillDeadline.toNumber();

      await fastForwardTo(fulfillDeadlineTimestamp);
      const balanceBeforeContract = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      const balanceBeforeRequester = await ethers.provider.getBalance(
        requesterAddress
      );

      const tx = await arweaveMarket
        .connect(requester)
        .cancelRequestTimeout(requestId);
      expect(tx).to.emit(arweaveMarket, "RequestCancelled").withArgs(requestId);

      const receipt = await tx.wait();
      const txFee = await getTxFee(receipt);

      const balanceAfterContract = await ethers.provider.getBalance(
        arweaveMarket.address
      );
      expect(balanceBeforeContract.sub(balanceAfterContract)).to.be.eq(amount);

      const balanceAfterRequester = await ethers.provider.getBalance(
        requesterAddress
      );
      expect(
        balanceAfterRequester.sub(balanceBeforeRequester).add(txFee)
      ).to.be.eq(amount);

      const requestPost = await arweaveMarket.requests(requestId);
      expect(requestPost[9]).to.be.eq(RequestPeriod.Finished);
    });
  });

  describe("_finishRequest()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("_cancelRequest()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("_reimburse()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("initMediator()", async () => {
    let arweaveMarket: ArweaveMarket;
    let mediator: MockMediator;

    beforeEach(async () => {
      const MockMediatorFactory = <MockMediator__factory>(
        await ethers.getContractFactory("MockMediator")
      );
      mediator = await MockMediatorFactory.deploy();

      const ArweaveMarketFactory = <ArweaveMarket__factory>(
        await ethers.getContractFactory("ArweaveMarket")
      );
      arweaveMarket = await ArweaveMarketFactory.connect(owner).deploy(
        fulfillWindow,
        validationWindow
      );
      await mediator.connect(owner).initMarket(arweaveMarket.address);
    });

    it("should revert if sender is not owner", async () => {
      await expect(
        arweaveMarket.connect(requester).initMediator(ownerAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should revert if mediator is already initialised", async () => {
      await arweaveMarket.connect(owner).initMediator(mediator.address);

      await expect(
        arweaveMarket.connect(owner).initMediator(mediator.address)
      ).to.be.revertedWith(
        "ArweaveMarket::initMediator:Mediator already initialised"
      );
    });
    it("should revert if new mediator is not IMarketMediator", async () => {
      await expect(
        arweaveMarket.connect(owner).initMediator(arweaveMarket.address)
      ).to.be.revertedWith(
        "function selector was not recognized and there's no fallback function"
      );
    });
    it("should revert if new mediator is not contract address", async () => {
      await expect(
        arweaveMarket.connect(owner).initMediator(requesterAddress)
      ).to.be.revertedWith("function call to a non-contract account");
    });
    it("should set mediator", async () => {
      const oldValue = await arweaveMarket.mediator();
      const newValue = mediator.address;
      expect(oldValue).to.be.not.eq(newValue);
      await arweaveMarket.connect(owner).initMediator(newValue);
      expect(await arweaveMarket.mediator()).to.be.eq(newValue);
    });
  });

  describe("setFulfillWindow()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        arweaveMarket.connect(requester).setFulfillWindow(0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should set new fulfill window", async () => {
      const oldValue = await arweaveMarket.fulfillWindow();
      const newValue = oldValue.add(1);
      await arweaveMarket.connect(owner).setFulfillWindow(newValue);
      expect(await arweaveMarket.fulfillWindow()).to.be.eq(newValue);
    });
  });

  describe("setValidationWindow()", async () => {
    it("should revert if sender is not owner", async () => {
      await expect(
        arweaveMarket.connect(requester).setValidationWindow(0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should set new fulfill window", async () => {
      const oldValue = await arweaveMarket.validationWindow();
      const newValue = oldValue.add(1);
      await arweaveMarket.connect(owner).setValidationWindow(newValue);
      expect(await arweaveMarket.validationWindow()).to.be.eq(newValue);
    });
  });

  describe("getRequestsLength()", async () => {
    it("should return length of requests", async () => {
      const currentLength = await arweaveMarket.getRequestsLength();
      expect(currentLength).to.be.eq(0);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, 0);
      expect(await arweaveMarket.getRequestsLength()).to.be.eq(
        currentLength.add(1)
      );
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, 0);
      await arweaveMarket
        .connect(requester)
        .createRequest(defaultFileHash, USDC_ADDRESS, 0);
      expect(await arweaveMarket.getRequestsLength()).to.be.eq(
        currentLength.add(3)
      );
    });
  });
});
