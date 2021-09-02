// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IArweaveMarket} from "./IArweaveMarket.sol";

interface IMarketMediator {
    struct Dispute {
        uint256 id;
        uint256 requestId;
        uint256 deadline;
        bool escalatedToArbitrator;
        uint256 arbitratorDisputeId;
        bool arbitratorRuled;
        IArweaveMarket.DisputeWinner winner;
        bool resolved;
    }

    event DisputeCreated(uint256 indexed disputeId, uint256 indexed requestId);
    event DisputeEscalated(uint256 indexed disputeId);
    event DisputeResolved(
        uint256 indexed disputeId,
        IArweaveMarket.DisputeWinner winner
    );

    function createDispute(uint256 _requestId) external;

    function getMarket() external view returns (address);
}
