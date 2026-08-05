// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockFtsoV2 {
    bytes21 public constant lastFeedId =
        0x015852502f55534400000000000000000000000000;

    uint256 private immutable value;
    uint64 private immutable updatedAt;

    constructor(uint256 value_, uint64 updatedAt_) {
        value = value_;
        updatedAt = updatedAt_;
    }

    function getFeedByIdInWei(
        bytes21 feedId
    ) external view returns (uint256, uint64) {
        require(feedId == lastFeedId, "unexpected feed");
        return (value, updatedAt);
    }
}
