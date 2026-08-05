// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract PolicyRegistry {
    struct Policy {
        address owner;
        address credentialIssuer;
        bytes32 rulesHash;
        bool active;
    }

    error InvalidAddress();
    error PolicyAlreadyExists();
    error PolicyNotFound();
    error Unauthorized();

    address public immutable admin;
    mapping(bytes32 policyId => Policy policy) private policies;

    event PolicyCreated(
        bytes32 indexed policyId,
        address indexed owner,
        address indexed credentialIssuer,
        bytes32 rulesHash
    );
    event PolicyStatusChanged(bytes32 indexed policyId, bool active);

    constructor(address admin_) {
        if (admin_ == address(0)) revert InvalidAddress();
        admin = admin_;
    }

    function computePolicyId(
        address owner,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, salt));
    }

    function createPolicy(
        bytes32 salt,
        address credentialIssuer,
        bytes32 rulesHash
    ) external returns (bytes32 policyId) {
        if (credentialIssuer == address(0)) revert InvalidAddress();

        policyId = computePolicyId(msg.sender, salt);
        if (policies[policyId].owner != address(0)) {
            revert PolicyAlreadyExists();
        }

        policies[policyId] = Policy({
            owner: msg.sender,
            credentialIssuer: credentialIssuer,
            rulesHash: rulesHash,
            active: true
        });

        emit PolicyCreated(
            policyId,
            msg.sender,
            credentialIssuer,
            rulesHash
        );
    }

    function setPolicyActive(bytes32 policyId, bool active) external {
        Policy storage policy = policies[policyId];
        if (policy.owner == address(0)) revert PolicyNotFound();
        if (msg.sender != policy.owner && msg.sender != admin) {
            revert Unauthorized();
        }

        policy.active = active;
        emit PolicyStatusChanged(policyId, active);
    }

    function getPolicy(
        bytes32 policyId
    ) external view returns (Policy memory policy) {
        policy = policies[policyId];
        if (policy.owner == address(0)) revert PolicyNotFound();
    }

    function isPolicyActive(bytes32 policyId) external view returns (bool) {
        return policies[policyId].active;
    }
}
