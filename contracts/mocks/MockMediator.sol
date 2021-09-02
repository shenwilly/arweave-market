// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IMarketMediator} from "../interfaces/IMarketMediator.sol";
import {IArweaveMarket} from "../interfaces/IArweaveMarket.sol";

contract MockMediator is IMarketMediator {
    address market;

    function initMarket(address _market) external {
        require(market == address(0));
        market = _market;
    }

    function createDispute(uint256 _requestId) external override {}
    
    function resolveDispute(uint256 _requestId, IArweaveMarket.DisputeWinner _winner) external {
        IArweaveMarket(market).resolveDispute(_requestId, _winner);
    }
    
    function getMarket() external view override returns (address) {
        return market;
    }
}
