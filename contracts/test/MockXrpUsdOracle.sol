// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockXrpUsdOracle {
    uint256 public priceWei;

    constructor(uint256 priceWei_) {
        priceWei = priceWei_;
    }

    function setPrice(uint256 priceWei_) external {
        priceWei = priceWei_;
    }

    function currentPrice() external view returns (uint256, uint64) {
        return (priceWei, uint64(block.timestamp));
    }
}
