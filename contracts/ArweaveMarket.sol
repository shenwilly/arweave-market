// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IArweaveMarket} from "./interfaces/IArweaveMarket.sol";

contract ArweaveMarket is IArweaveMarket, Ownable {
    using SafeERC20 for IERC20;

    ArweaveRequest[] public requests;

    /// @notice duration for fulfilling request
    uint256 public fulfillWindow;
    /// @notice duration before payment can be taken by uploader
    uint256 public validationWindow;

    modifier onlyPeriod(uint256 _requestId, RequestPeriod _period) {
        require(
            requests[_requestId].period == _period,
            "ArweaveMarket:onlyPeriod:Invalid Period"
        );
        _;
    }

    constructor(uint256 _fulfillWindow, uint256 _validationWindow) {
        fulfillWindow = _fulfillWindow;
        validationWindow = _validationWindow;
    }

    function createRequest(
        bytes calldata _dataHash,
        address _paymentToken,
        uint256 _paymentAmount
    ) external {
        IERC20(_paymentToken).safeTransferFrom(
            msg.sender,
            address(this),
            _paymentAmount
        );

        ArweaveRequest memory request;
        request.id = requests.length;
        request.requester = msg.sender;
        request.dataHash = _dataHash;
        request.paymentToken = _paymentToken;
        request.paymentAmount = _paymentAmount;

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

    function fulfillRequest(uint256 _requestId, bytes calldata _arweaveTxId)
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

    function finishRequest(uint256 _requestId)
        external
        onlyPeriod(_requestId, RequestPeriod.Validating)
    {
        require(
            requests[_requestId].validationDeadline < block.timestamp,
            "ArweaveMarket::finishRequest:Deadline has not been reached"
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
            "ArweaveMarket::cancelRequestTimeout:Deadline has not been reached"
        );

        _cancelRequest(_requestId);
    }

    function _finishRequest(uint256 _requestId) private {
        ArweaveRequest storage request = requests[_requestId];
        request.period = RequestPeriod.Finished;
        IERC20(request.paymentToken).safeTransfer(
            request.taker,
            request.paymentAmount
        );

        emit RequestFinished(_requestId);
    }

    function _cancelRequest(uint256 _requestId) private {
        ArweaveRequest storage request = requests[_requestId];
        request.period = RequestPeriod.Finished;
        IERC20(request.paymentToken).safeTransfer(
            request.requester,
            request.paymentAmount
        );

        emit RequestCancelled(_requestId);
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