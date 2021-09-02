// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IMarketMediator} from "../interfaces/IMarketMediator.sol";
import {IArweaveMarket} from "../interfaces/IArweaveMarket.sol";

contract MockMarket is IArweaveMarket {
    function resolveDispute(uint256 _requestId, DisputeWinner _winner)
        external
        override
    {}
}
