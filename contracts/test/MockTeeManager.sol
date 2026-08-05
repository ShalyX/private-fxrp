// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockTeeManager {
    struct TeeInstructionParams {
        bytes32 opType;
        bytes32 opCommand;
        bytes message;
        address[] cosigners;
        uint64 cosignersThreshold;
        address claimBackAddress;
    }

    uint256 public nextPublicExtensionId = 0x10001;
    mapping(uint256 extensionId => address sender) public instructionSenders;
    address[] private teeIds;

    bytes32 public lastOpType;
    bytes32 public lastOpCommand;
    bytes public lastMessage;
    address public lastClaimBackAddress;
    uint256 public lastValue;
    bytes32 public constant INSTRUCTION_ID = keccak256("instruction-1");

    constructor(address teeId) {
        teeIds.push(teeId);
    }

    function setInstructionSender(uint256 extensionId, address sender) external {
        instructionSenders[extensionId] = sender;
    }

    function getTeeExtensionInstructionsSender(
        uint256 extensionId
    ) external view returns (address) {
        return instructionSenders[extensionId];
    }

    function getRandomTeeIds(
        uint256,
        uint256
    ) external view returns (address[] memory) {
        return teeIds;
    }

    function sendInstructions(
        address[] calldata,
        TeeInstructionParams calldata params
    ) external payable returns (bytes32) {
        lastOpType = params.opType;
        lastOpCommand = params.opCommand;
        lastMessage = params.message;
        lastClaimBackAddress = params.claimBackAddress;
        lastValue = msg.value;
        return INSTRUCTION_ID;
    }
}
