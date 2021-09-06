// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ArweaveMarketMediator} from "../MarketMediator.sol";
import {IArweaveMarket} from "../interfaces/IArweaveMarket.sol";

contract MockRuleDisputeMediator is ArweaveMarketMediator {
    constructor(
        address _arbitrator,
        bytes memory _arbitrationExtraData,
        uint256 _disputeWindow
    )
        ArweaveMarketMediator(
            _arbitrator,
            _arbitrationExtraData,
            _disputeWindow
        )
    {}

    function ruleDispute(
        uint256 _disputeId,
        IArweaveMarket.DisputeWinner _winner
    ) external onlyOwner {
        _ruleDispute(_disputeId, _winner);
    }
}
