import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ArweaveMarket, ArweaveMarket__factory } from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { USDC_ADDRESS, USDC_DECIMALS } from "../../constants";
import {
  getCurrentTimestamp,
  getNextRequestId,
  mintUsdc,
} from "../helpers/utils";
import { Contract } from "@ethersproject/contracts";
import { parseUnits } from "@ethersproject/units";
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

    const ArweaveMarketFactory = <ArweaveMarket__factory>(
      await ethers.getContractFactory("ArweaveMarket")
    );
    arweaveMarket = await ArweaveMarketFactory.connect(owner).deploy(0, 0);

    usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);

    fulfillWindow = await arweaveMarket.fulfillWindow();
    validationWindow = await arweaveMarket.validationWindow();

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
          .createRequest(defaultFileHash, AddressZero, 0)
      ).to.be.revertedWith("Address: call to non-contract");
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
    it("should create a request", async () => {
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
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("cancelRequest()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
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
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("setValidationWindow()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("getRequestsLength()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });
});
