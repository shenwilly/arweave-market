// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IArweaveMarket} from "./interfaces/IArweaveMarket.sol";
import {IMarketMediator} from "./interfaces/IMarketMediator.sol";

contract ArweaveMarketMediator is IMarketMediator, Ownable {
    address immutable market;

    Dispute[] public disputes;
    mapping(uint256 => uint256) public requestToDispute;

    modifier onlyMarket() {
        require(
            msg.sender == market,
            "MarketMediator::onlyMarket:Sender is not market"
        );
        _;
    }

    constructor(address _market) {
        market = _market;
    }

    function createDispute(uint256 _requestId) external override onlyMarket {
        uint256 disputeId = disputes.length;
        Dispute memory dispute;
        dispute.requestId = _requestId;
        disputes.push(dispute);

        requestToDispute[_requestId] = disputeId;

        emit DisputeCreated(disputeId, _requestId);
    }

    function resolveDispute(
        uint256 _disputeId,
        IArweaveMarket.DisputeWinner _winner
    ) external onlyOwner {
        Dispute storage dispute = disputes[_disputeId];
        dispute.winner = _winner;
        dispute.resolved = true;

        IArweaveMarket(market).resolveDispute(
            disputes[_disputeId].requestId,
            _winner
        );

        emit DisputeResolved(_disputeId, _winner);
    }
}
