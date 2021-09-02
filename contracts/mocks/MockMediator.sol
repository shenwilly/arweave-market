// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IMarketMediator} from "../interfaces/IMarketMediator.sol";

contract MockMediator is IMarketMediator {
    address market;

    function initMarket(address _market) external {
        require(market == address(0));
        market = _market;
    }

    function createDispute(uint256 _requestId) external override {}

    function getMarket() external view override returns (address) {
        return market;
    }
}
