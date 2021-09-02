// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IArweaveMarket} from "./interfaces/IArweaveMarket.sol";
import {IMarketMediator} from "./interfaces/IMarketMediator.sol";

contract ArweaveMarket is IArweaveMarket, Ownable {
    using SafeERC20 for IERC20;

    ArweaveRequest[] public requests;

    /// @notice duration for fulfilling request
    uint256 public fulfillWindow;
    /// @notice duration before payment can be taken by uploader
    uint256 public validationWindow;

    address public mediator;
    address public constant ETH_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    modifier onlyPeriod(uint256 _requestId, RequestPeriod _period) {
        require(
            requests[_requestId].period == _period,
            "ArweaveMarket::onlyPeriod:Invalid Period"
        );
        _;
    }

    modifier onlyMediator() {
        require(
            msg.sender == mediator,
            "ArweaveMarket::onlyMediator:Sender is not mediator"
        );
        _;
    }

    constructor(uint256 _fulfillWindow, uint256 _validationWindow) {
        setFulfillWindow(_fulfillWindow);
        setValidationWindow(_validationWindow);
    }

    function initMediator(address _mediator) public onlyOwner {
        require(
            mediator == address(0),
            "ArweaveMarket::initMediator:Mediator already initialised"
        );
        require(
            IMarketMediator(_mediator).getMarket() == address(this),
            "ArweaveMarket::initMediator:Invalid Mediator"
        ); // sanity check
        mediator = _mediator;
    }

    function createRequest(
        string calldata _dataHash,
        address _paymentToken,
        uint256 _paymentAmount
    ) external payable {
        uint256 paymentAmount;
        if (_paymentToken == ETH_TOKEN) {
            paymentAmount = msg.value;
        } else {
            IERC20 token = IERC20(_paymentToken);
            uint256 preBalance = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), _paymentAmount);
            uint256 postBalance = token.balanceOf(address(this));
            paymentAmount = postBalance - preBalance;
        }

        ArweaveRequest memory request;
        request.id = requests.length;
        request.requester = msg.sender;
        request.dataHash = _dataHash;
        request.paymentToken = _paymentToken;
        request.paymentAmount = paymentAmount;

        requests.push(request);

        emit RequestCreated(request.id, msg.sender, _dataHash);
    }

    function takeRequest(uint256 _requestId)
        external
        onlyPeriod(_requestId, RequestPeriod.Waiting)
    {
        ArweaveRequest storage request = requests[_requestId];
        request.period = RequestPeriod.Processing;
        request.taker = msg.sender;
        request.fulfillDeadline = block.timestamp + fulfillWindow;

        emit RequestTaken(_requestId, msg.sender);
    }

    function fulfillRequest(uint256 _requestId, string calldata _arweaveTxId)
        external
        onlyPeriod(_requestId, RequestPeriod.Processing)
    {
        ArweaveRequest storage request = requests[_requestId];
        require(
            request.taker == msg.sender,
            "ArweaveMarket::fulfillRequest:Sender is not taker"
        );

        request.period = RequestPeriod.Validating;
        request.arweaveTxId = _arweaveTxId;
        request.validationDeadline = block.timestamp + validationWindow;

        emit RequestFulfilled(_requestId, _arweaveTxId);
    }

    function disputeRequest(uint256 _requestId)
        external
        onlyPeriod(_requestId, RequestPeriod.Validating)
    {
        ArweaveRequest storage request = requests[_requestId];
        require(
            request.requester == msg.sender,
            "ArweaveMarket::disputeRequest:Sender is not requester"
        );
        require(
            block.timestamp < request.validationDeadline,
            "ArweaveMarket::disputeRequest:Validation deadline has been reached"
        );
        request.period = RequestPeriod.Disputed;

        // notify mediator
        IMarketMediator(mediator).createDispute(_requestId);

        emit RequestDisputed(_requestId);
    }

    function resolveDispute(uint256 _requestId, DisputeWinner _winner)
        external
        override
        onlyMediator
        onlyPeriod(_requestId, RequestPeriod.Disputed)
    {
        if (_winner == DisputeWinner.None) {
            _cancelRequest(_requestId);
        } else if (_winner == DisputeWinner.Requester) {
            _cancelRequest(_requestId);
            _reimburse(_requestId);
        } else if (_winner == DisputeWinner.Taker) {
            _finishRequest(_requestId);
        }
    }

    function finishRequest(uint256 _requestId)
        external
        onlyPeriod(_requestId, RequestPeriod.Validating)
    {
        require(
            block.timestamp > requests[_requestId].validationDeadline,
            "ArweaveMarket::finishRequest:Validation deadline has not been reached"
        );

        _finishRequest(_requestId);
    }

    function cancelRequest(uint256 _requestId)
        external
        onlyPeriod(_requestId, RequestPeriod.Waiting)
    {
        require(
            requests[_requestId].requester == msg.sender,
            "ArweaveMarket::cancelRequest:Sender is not requester"
        );

        _cancelRequest(_requestId);
    }

    function cancelRequestTimeout(uint256 _requestId)
        external
        onlyPeriod(_requestId, RequestPeriod.Processing)
    {
        require(
            requests[_requestId].requester == msg.sender,
            "ArweaveMarket::cancelRequestTimeout:Sender is not requester"
        );
        require(
            requests[_requestId].fulfillDeadline < block.timestamp,
            "ArweaveMarket::cancelRequestTimeout:Fulfill deadline has not been reached"
        );

        _cancelRequest(_requestId);
    }

    function _finishRequest(uint256 _requestId) private {
        ArweaveRequest storage request = requests[_requestId];
        request.period = RequestPeriod.Finished;

        _transfer(
            payable(request.taker),
            request.paymentToken,
            request.paymentAmount
        );

        emit RequestFinished(_requestId);
    }

    function _cancelRequest(uint256 _requestId) private {
        ArweaveRequest storage request = requests[_requestId];
        request.period = RequestPeriod.Finished;

        _transfer(
            payable(request.requester),
            request.paymentToken,
            request.paymentAmount
        );

        emit RequestCancelled(_requestId);
    }

    function _transfer(
        address payable _to,
        address _token,
        uint256 _amount
    ) private {
        if (_token == ETH_TOKEN) {
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "ArweaveMarket::_transfer: ETH transfer failed");
        } else {
            IERC20(_token).safeTransfer(_to, _amount);
        }
    }

    function _reimburse(uint256 _requestId) private {
        // TODO: punish taker and reimburse requester
    }

    function setFulfillWindow(uint256 _fulfillWindow) public onlyOwner {
        fulfillWindow = _fulfillWindow;
    }

    function setValidationWindow(uint256 _validationWindow) public onlyOwner {
        validationWindow = _validationWindow;
    }

    function getRequestsLength() public view returns (uint256) {
        return requests.length;
    }
}
