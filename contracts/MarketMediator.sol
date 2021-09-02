// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IArweaveMarket} from "./interfaces/IArweaveMarket.sol";
import {IMarketMediator} from "./interfaces/IMarketMediator.sol";
import {IArbitrable} from "./interfaces/IArbitrable.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";

contract ArweaveMarketMediator is IMarketMediator, IArbitrable, Ownable {
    address public immutable market;

    address public arbitrator;
    bytes public arbitrationExtraData;

    Dispute[] public disputes;
    mapping(uint256 => uint256) public requestToDispute;

    uint256 disputeWindow;

    modifier onlyMarket() {
        require(
            msg.sender == market,
            "MarketMediator::onlyMarket:Sender is not market"
        );
        _;
    }

    modifier onlyArbitrator() {
        require(
            msg.sender == arbitrator,
            "MarketMediator::onlyArbitrator:Sender is not arbitrator"
        );
        _;
    }

    constructor(
        address _market,
        address _arbitrator,
        bytes memory _arbitrationExtraData,
        uint256 _disputeWindow
    ) {
        market = _market;
        arbitrator = _arbitrator;
        arbitrationExtraData = _arbitrationExtraData;
        disputeWindow = _disputeWindow;
    }

    function createDispute(uint256 _requestId) external override onlyMarket {
        uint256 disputeId = disputes.length;
        Dispute memory dispute;
        dispute.requestId = _requestId;
        dispute.deadline = block.timestamp + disputeWindow;
        disputes.push(dispute);

        requestToDispute[_requestId] = disputeId;

        emit DisputeCreated(disputeId, _requestId);
    }

    function setDisputeWinner(
        uint256 _disputeId,
        IArweaveMarket.DisputeWinner _winner
    ) external onlyOwner {
        Dispute storage dispute = disputes[_disputeId];
        require(
            !dispute.resolved &&
                dispute.deadline >= block.timestamp &&
                !dispute.escalatedToArbitrator
        );
        dispute.winner = _winner;
    }

    function escalateDispute(uint256 _disputeId) external payable {
        Dispute storage dispute = disputes[_disputeId];
        require(
            !dispute.resolved &&
                dispute.deadline >= block.timestamp &&
                !dispute.escalatedToArbitrator
        );

        dispute.escalatedToArbitrator = true;

        uint256 cost = getArbitrationCost();
        require(msg.value == cost);

        uint256 arbitratorDisputeId = IArbitrator(arbitrator).createDispute{
            value: cost
        }(2, bytes(""));
        dispute.arbitratorDisputeId = arbitratorDisputeId;

        emit DisputeEscalated(_disputeId);
    }

    function rule(uint256 _disputeID, uint256 _ruling)
        external
        override
        onlyArbitrator
    {
        ruleDispute(_disputeID, IArweaveMarket.DisputeWinner(_ruling));

        emit Ruling(IArbitrator(arbitrator), _disputeID, _ruling); // ERC792 Arbitrable event
    }

    function ruleDispute(
        uint256 _disputeId,
        IArweaveMarket.DisputeWinner _winner
    ) internal {
        Dispute storage dispute = disputes[_disputeId];
        require(!dispute.arbitratorRuled);

        dispute.winner = _winner;
        dispute.arbitratorRuled = true;
    }

    function resolveDispute(uint256 _disputeId) public {
        Dispute storage dispute = disputes[_disputeId];
        require(!dispute.resolved && dispute.deadline < block.timestamp);

        if (dispute.escalatedToArbitrator) {
            require(dispute.arbitratorRuled);
        }

        dispute.resolved = true;

        IArweaveMarket(market).resolveDispute(
            disputes[_disputeId].requestId,
            dispute.winner
        );

        emit DisputeResolved(_disputeId, dispute.winner);
    }

    function getArbitrationCost() public view returns (uint256) {
        return IArbitrator(arbitrator).arbitrationCost(arbitrationExtraData);
    }

    function getDisputeIdFromRequestId(uint256 _requestId)
        public
        view
        returns (uint256)
    {
        return requestToDispute[_requestId];
    }

    function getRequestIdFromDisputeId(uint256 _disputeId)
        public
        view
        returns (uint256)
    {
        return disputes[_disputeId].requestId;
    }
}
