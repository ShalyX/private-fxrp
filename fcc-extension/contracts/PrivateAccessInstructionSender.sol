// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { ITeeExtensionRegistry } from "./interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "./interfaces/ITeeMachineRegistry.sol";

/// @title PrivateAccessInstructionSender
/// @notice Sends encrypted access-policy requests to a registered FCC extension.
contract PrivateAccessInstructionSender {
    bytes32 public constant OP_TYPE_PRIVATE_ACCESS =
        bytes32("PRIVATE_ACCESS");
    bytes32 public constant OP_COMMAND_EVALUATE_ACCESS =
        bytes32("EVALUATE_ACCESS");

    ITeeExtensionRegistry public immutable TEE_EXTENSION_REGISTRY;
    ITeeMachineRegistry public immutable TEE_MACHINE_REGISTRY;

    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint256 private extensionId;

    event AccessEvaluationRequested(
        bytes32 indexed instructionId,
        address indexed applicant
    );

    constructor(
        ITeeExtensionRegistry teeExtensionRegistry,
        ITeeMachineRegistry teeMachineRegistry
    ) {
        require(
            address(teeExtensionRegistry) != address(0),
            "TeeExtensionRegistry cannot be zero address"
        );
        require(
            address(teeMachineRegistry) != address(0),
            "TeeMachineRegistry cannot be zero address"
        );
        require(
            address(teeExtensionRegistry).code.length > 0,
            "TeeExtensionRegistry has no code"
        );
        require(
            address(teeMachineRegistry).code.length > 0,
            "TeeMachineRegistry has no code"
        );
        TEE_EXTENSION_REGISTRY = teeExtensionRegistry;
        TEE_MACHINE_REGISTRY = teeMachineRegistry;
    }

    function setExtensionId() external {
        require(extensionId == 0, "Extension ID already set.");

        uint256 nextId = TEE_EXTENSION_REGISTRY.nextPublicExtensionId();
        for (uint256 id = FIRST_PUBLIC_EXTENSION_ID; id < nextId; ++id) {
            if (
                TEE_EXTENSION_REGISTRY.getTeeExtensionInstructionsSender(id) ==
                address(this)
            ) {
                extensionId = id;
                return;
            }
        }
        revert("Extension ID not found.");
    }

    function requestAccess(
        bytes calldata encryptedPayload
    ) external payable returns (bytes32 instructionId) {
        require(encryptedPayload.length > 0, "encrypted payload is empty");

        address[] memory teeIds = TEE_MACHINE_REGISTRY.getRandomTeeIds(
            _getExtensionId(),
            1
        );
        address[] memory cosigners = new address[](0);
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry
            .TeeInstructionParams({
                opType: OP_TYPE_PRIVATE_ACCESS,
                opCommand: OP_COMMAND_EVALUATE_ACCESS,
                message: encryptedPayload,
                cosigners: cosigners,
                cosignersThreshold: 0,
                claimBackAddress: msg.sender
            });

        instructionId = TEE_EXTENSION_REGISTRY.sendInstructions{
            value: msg.value
        }(teeIds, params);
        emit AccessEvaluationRequested(instructionId, msg.sender);
    }

    function _getExtensionId() private view returns (uint256) {
        require(extensionId != 0, "Extension ID is not set.");
        return extensionId;
    }
}
