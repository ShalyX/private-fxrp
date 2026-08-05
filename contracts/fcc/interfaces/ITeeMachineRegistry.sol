// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

interface ITeeMachineRegistry {
    function getRandomTeeIds(
        uint256 extensionId,
        uint256 count
    ) external view returns (address[] memory);
}
