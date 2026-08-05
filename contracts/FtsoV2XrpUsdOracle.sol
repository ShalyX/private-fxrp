// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFtsoV2 {
    function getFeedByIdInWei(
        bytes21 feedId
    ) external payable returns (uint256 value, uint64 timestamp);
}

contract FtsoV2XrpUsdOracle {
    error InvalidAddress();
    error InvalidMaxAge();
    error InvalidPrice();
    error StalePrice(uint64 timestamp);

    bytes21 public constant XRP_USD_FEED_ID =
        0x015852502f55534400000000000000000000000000;

    IFtsoV2 public immutable ftsoV2;
    uint64 public immutable maxAge;

    constructor(address ftsoV2_, uint64 maxAge_) {
        if (ftsoV2_ == address(0)) revert InvalidAddress();
        if (maxAge_ == 0) revert InvalidMaxAge();
        ftsoV2 = IFtsoV2(ftsoV2_);
        maxAge = maxAge_;
    }

    function currentPrice() external returns (uint256 priceWei, uint64 timestamp) {
        (priceWei, timestamp) = ftsoV2.getFeedByIdInWei(XRP_USD_FEED_ID);
        if (priceWei == 0) revert InvalidPrice();
        if (timestamp > block.timestamp || block.timestamp - timestamp > maxAge) {
            revert StalePrice(timestamp);
        }
    }
}
