// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IArweaveMarket} from "./interfaces/IArweaveMarket.sol";
import {IMarketMediator} from "./interfaces/IMarketMediator.sol";
import {IArbitrable} from "./interfaces/IArbitrable.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";

contract ArweaveMarketMediator is IMarketMediator, IArbitrable, Ownable {
    address public market;

    address public arbitrator;
    bytes public arbitrationExtraData;

    Dispute[] public disputes;
    mapping(uint256 => uint256) public requestToDispute;
    mapping(uint256 => uint256) public arbitratorDisputeToDispute;

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
        address _arbitrator,
        bytes memory _arbitrationExtraData,
        uint256 _disputeWindow
    ) {
        arbitrator = _arbitrator;
        arbitrationExtraData = _arbitrationExtraData;
        disputeWindow = _disputeWindow;
    }

    function initMarket(address _market) external onlyOwner {
        require(
            market == address(0),
            "MarketMediator::initMarket:Market already initialised"
        );
        market = _market;
    }

    // trust market not to dispute same request twice
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
            !dispute.resolved,
            "MarketMediator::setDisputeWinner:Dispute already resolved"
        );
        require(
            dispute.deadline >= block.timestamp,
            "MarketMediator::setDisputeWinner:Deadline has been reached"
        );
        require(
            !dispute.escalatedToArbitrator,
            "MarketMediator::setDisputeWinner:Dispute has been escalated to arbitrator"
        );

        dispute.winner = _winner;
    }

    function escalateDispute(uint256 _disputeId) external payable {
        Dispute storage dispute = disputes[_disputeId];
        require(
            !dispute.resolved,
            "MarketMediator::escalateDispute:Dispute already resolved"
        );
        require(
            dispute.deadline >= block.timestamp,
            "MarketMediator::escalateDispute:Deadline has been reached"
        );
        require(
            !dispute.escalatedToArbitrator,
            "MarketMediator::escalateDispute:Dispute has been escalated to arbitrator"
        );

        dispute.escalatedToArbitrator = true;

        uint256 cost = getArbitrationCost();
        require(
            msg.value == cost,
            "MarketMediator::escalateDispute:Invalid msg.value"
        );

        uint256 arbitratorDisputeId = IArbitrator(arbitrator).createDispute{
            value: cost
        }(2, arbitrationExtraData);
        dispute.arbitratorDisputeId = arbitratorDisputeId;
        arbitratorDisputeToDispute[arbitratorDisputeId] = _disputeId;

        emit DisputeEscalated(_disputeId);
    }

    // arbitrable spec
    function rule(uint256 _disputeID, uint256 _ruling)
        external
        override
        onlyArbitrator
    {
        uint256 disputeId = arbitratorDisputeToDispute[_disputeID];
        _ruleDispute(disputeId, IArweaveMarket.DisputeWinner(_ruling));

        emit Ruling(IArbitrator(arbitrator), _disputeID, _ruling); // ERC792 Arbitrable event
    }

    function resolveDispute(uint256 _disputeId) public {
        Dispute storage dispute = disputes[_disputeId];
        require(
            !dispute.resolved,
            "MarketMediator::resolveDispute:Dispute already resolved"
        );
        require(
            dispute.deadline < block.timestamp,
            "MarketMediator::resolveDispute:Deadline has not been reached"
        );

        if (dispute.escalatedToArbitrator) {
            require(
                dispute.arbitratorRuled,
                "MarketMediator::resolveDispute:Arbitrator has not ruled yet"
            );
        }

        dispute.resolved = true;

        IArweaveMarket(market).resolveDispute(
            disputes[_disputeId].requestId,
            dispute.winner
        );

        emit DisputeResolved(_disputeId, dispute.winner);
    }

    function _ruleDispute(
        uint256 _disputeId,
        IArweaveMarket.DisputeWinner _winner
    ) internal {
        Dispute storage dispute = disputes[_disputeId];
        require(
            dispute.escalatedToArbitrator,
            "MarketMediator::_ruleDispute:Dispute is not escalated"
        );
        require(
            !dispute.arbitratorRuled,
            "MarketMediator::_ruleDispute:Dispute is already ruled"
        );

        dispute.winner = _winner;
        dispute.arbitratorRuled = true;
    }

    function setArbitrationExtraData(bytes calldata _extraData)
        external
        onlyOwner
    {
        arbitrationExtraData = _extraData;
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

    function getDisputesLength() public view returns (uint256) {
        return disputes.length;
    }

    function getMarket() public view override returns (address) {
        return market;
    }
}
