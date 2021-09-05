// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IArbitrable} from "../interfaces/IArbitrable.sol";

contract MockArbitrator is IArbitrator {
    uint256 baseCost;

    uint256[] disputes;

    constructor(uint256 _cost) {
        baseCost = _cost;
    }

    function giveRuling(
        address _arbitrable,
        uint256 _disputeID,
        uint256 _ruling
    ) external {
        IArbitrable(_arbitrable).rule(_disputeID, _ruling);
    }

    function createDispute(uint256 _choices, bytes calldata _extraData)
        external
        payable
        override
        returns (uint256 disputeID)
    {
        disputeID = disputes.length;
        disputes.push(0);

        emit DisputeCreation(disputeID, IArbitrable(msg.sender));
    }

    function arbitrationCost(bytes calldata _extraData)
        external
        view
        override
        returns (uint256 cost)
    {
        return baseCost;
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
