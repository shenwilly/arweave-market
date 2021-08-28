import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ArweaveMarket, ArweaveMarket__factory } from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import {
  DUMMY_ETH_ADDRESS,
  ERC20_DECIMALS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "../../constants";
import {
  fastForwardTo,
  getCurrentTimestamp,
  getNextRequestId,
  mintUsdc,
} from "../helpers/utils";
import { Contract } from "@ethersproject/contracts";
import { parseEther, parseUnits } from "@ethersproject/units";
import { BigNumber } from "ethers";
import { RequestPeriod } from "../helpers/types";

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

    const ArweaveMarketFactory = <ArweaveMarket__factory>(
      await ethers.getContractFactory("ArweaveMarket")
    );
    arweaveMarket = await ArweaveMarketFactory.connect(owner).deploy(
      fulfillWindow,
      validationWindow
    );

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
      ).to.be.revertedWith("ArweaveMarket:onlyPeriod:Invalid Period");
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
      ).to.be.revertedWith("ArweaveMarket:onlyPeriod:Invalid Period");
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
      ).to.be.revertedWith("ArweaveMarket:onlyPeriod:Invalid Period");
    });
    it("should revert if request is validation deadline has not been reached", async () => {
      await expect(
        arweaveMarket.connect(requester).finishRequest(requestId)
      ).to.be.revertedWith(
        "ArweaveMarket::finishRequest:Deadline has not been reached"
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
      const balanceBefore = await ethers.provider.getBalance(takerAddress);

      await expect(arweaveMarket.connect(requester).finishRequest(requestId))
        .to.emit(arweaveMarket, "RequestFinished")
        .withArgs(requestId);

      const balanceAfter = await ethers.provider.getBalance(takerAddress);
      expect(balanceAfter.sub(balanceBefore)).to.be.eq(amount);

      const request = await arweaveMarket.requests(requestId);
      expect(request[9]).to.be.eq(RequestPeriod.Finished);
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
      ).to.be.revertedWith("ArweaveMarket:onlyPeriod:Invalid Period");
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

      const balanceBefore = await ethers.provider.getBalance(requesterAddress);

      const tx = await arweaveMarket
        .connect(requester)
        .cancelRequest(requestId);
      expect(tx).to.emit(arweaveMarket, "RequestCancelled").withArgs(requestId);

      const receipt = await tx.wait();
      const txFee = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      const balanceAfter = await ethers.provider.getBalance(requesterAddress);
      expect(balanceAfter.sub(balanceBefore).add(txFee)).to.be.eq(amount);

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
      ).to.be.revertedWith("ArweaveMarket:onlyPeriod:Invalid Period");
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
        "ArweaveMarket::cancelRequestTimeout:Deadline has not been reached"
      );
    });
    it("should cancel request", async () => {
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
