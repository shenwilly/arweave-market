// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IArweaveMarket {
    enum RequestPeriod {
        Waiting,
        Processing,
        Validating,
        Disputed,
        Finished
    }

    enum DisputeWinner {
        None,
        Requester,
        Taker
    }

    struct ArweaveRequest {
        uint256 id;
        string dataHash;
        string arweaveTxId;
        address requester;
        address taker;
        address paymentToken;
        uint256 paymentAmount;
        uint256 bond;
        uint256 fulfillDeadline;
        uint256 validationDeadline;
        RequestPeriod period;
    }

    event RequestCreated(
        uint256 indexed id,
        address indexed requester,
        string dataHash
    );
    event RequestCancelled(uint256 indexed id);
    event RequestTaken(uint256 indexed id, address indexed uploader);
    event RequestFulfilled(uint256 indexed id, string _arweaveTx);
    event RequestDisputed(uint256 indexed id);
    event RequestFinished(uint256 indexed id);

    function resolveDispute(uint256 _requestId, DisputeWinner _winner) external;
}
