// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IArbitrator} from "../interfaces/IArbitrator.sol";

contract MockArbitrator is IArbitrator {
    function createDispute(uint256 _choices, bytes calldata _extraData)
        external
        payable
        override
        returns (uint256 disputeID)
    {
        return 0;
    }

    function arbitrationCost(bytes calldata _extraData)
        external
        view
        override
        returns (uint256 cost)
    {
        return 0;
    }

    function appeal(uint256 _disputeID, bytes calldata _extraData)
        external
        payable
        override
    {}

    function appealCost(uint256 _disputeID, bytes calldata _extraData)
        external
        view
        override
        returns (uint256 cost)
    {
        return 0;
    }

    function appealPeriod(uint256 _disputeID)
        external
        view
        override
        returns (uint256 start, uint256 end)
    {
        return (0, 0);
    }

    function disputeStatus(uint256 _disputeID)
        external
        view
        override
        returns (DisputeStatus status)
    {
        return DisputeStatus(0);
    }

    function currentRuling(uint256 _disputeID)
        external
        view
        override
        returns (uint256 ruling)
    {
        return 0;
    }
}
