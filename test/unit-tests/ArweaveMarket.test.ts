import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ArweaveMarket, ArweaveMarket__factory } from "../../typechain";

import chai from "chai";
import { solidity } from "ethereum-waffle";
import { USDC_ADDRESS } from "../../constants";
import { getNextRequestId } from "../helpers/utils";

const { expect } = chai;
chai.use(solidity);

describe("ArweaveMarket", function () {
  let owner: SignerWithAddress;
  let requester: SignerWithAddress;
  let taker: SignerWithAddress;
  let ownerAddress: string;
  let requesterAddress: string;
  let takerAddress: string;

  let arweaveMarket: ArweaveMarket;

  let snapshotId: string; // EVM snapshot before each test

  before("setup contracts", async () => {
    [owner, requester, taker] = await ethers.getSigners();
    ownerAddress = owner.address;
    requesterAddress = requester.address;
    takerAddress = taker.address;

    const ArweaveMarketFactory = <ArweaveMarket__factory>(
      await ethers.getContractFactory("ArweaveMarket")
    );
    arweaveMarket = await ArweaveMarketFactory.connect(owner).deploy(0, 0);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  beforeEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("createRequest()", async () => {
    const hash = ethers.utils.formatBytes32String("test");
    it("should revert if token is address(0)", async () => {
      await expect(
        arweaveMarket
          .connect(requester)
          .createRequest(
            ethers.utils.formatBytes32String("test"),
            ethers.constants.AddressZero,
            0
          )
      ).to.be.revertedWith("Address: call to non-contract");
    });
    it("should create a request", async () => {
      const requestId = await getNextRequestId(arweaveMarket);
      await expect(
        arweaveMarket.connect(requester).createRequest(hash, USDC_ADDRESS, 0)
      )
        .to.emit(arweaveMarket, "RequestCreated")
        .withArgs(requestId, requesterAddress, hash);
    });
  });

  describe("takeRequest()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
  });

  describe("fulfillRequest()", async () => {
    // it("should revert if token is address(0)", async () => {
    // });
    // it("should create a request", async () => {
    // });
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
