// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPolicyRegistry {
    function isPolicyActive(bytes32 policyId) external view returns (bool);

    function getPolicy(
        bytes32 policyId
    )
        external
        view
        returns (
            address owner,
            address credentialIssuer,
            bytes32 rulesHash,
            bool active
        );
}

contract AccessRegistry {
    struct AccessDecision {
        address account;
        bytes32 policyId;
        bool eligible;
        uint128 limitUsd;
        uint64 expiresAt;
        uint64 nonce;
    }

    struct AccessPass {
        uint128 limitUsd;
        uint64 expiresAt;
        uint64 nonce;
    }

    struct FccDecisionData {
        address targetRegistry;
        address account;
        bytes32 policyId;
        bytes32 rulesHash;
        address credentialIssuer;
        bool eligible;
        uint128 limitUsd;
        uint64 expiresAt;
        uint64 nonce;
    }

    error ApplicantNotEligible();
    error DecisionAlreadyUsed();
    error DecisionExpired();
    error FccActionAlreadyUsed();
    error FccResultFailed();
    error InactivePolicy();
    error InvalidAddress();
    error InvalidSignature();
    error NonceNotIncreasing();
    error PolicyCommitmentMismatch();
    error PolicyIssuerMismatch();
    error ResultTargetMismatch();
    error Unauthorized();
    error UnregisteredTeeSigner();

    bytes32 private constant ACCESS_DECISION_TYPEHASH =
        keccak256(
            "AccessDecision(address account,bytes32 policyId,bool eligible,uint128 limitUsd,uint64 expiresAt,uint64 nonce)"
        );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 private constant NAME_HASH =
        keccak256("Private FXRP Access Desk");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 private constant TEE_ACTION_RESULT_PREFIX =
        bytes32("TEE_ACTION_RESULT");
    uint256 private constant SECP256K1N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable admin;
    IPolicyRegistry public immutable policyRegistry;

    mapping(address signer => bool registered) public registeredTeeSigners;
    mapping(bytes32 decisionDigest => bool used) public usedDecisions;
    mapping(bytes32 actionId => bool used) public usedFccActions;
    mapping(address account => mapping(bytes32 policyId => AccessPass pass))
        private accessPasses;

    event TeeSignerStatusChanged(address indexed signer, bool registered);
    event AccessGranted(
        address indexed account,
        bytes32 indexed policyId,
        uint128 limitUsd,
        uint64 expiresAt,
        uint64 nonce
    );
    event AccessRequested(
        address indexed account,
        bytes32 indexed policyId,
        bytes ciphertext
    );

    constructor(address admin_, address policyRegistry_) {
        if (admin_ == address(0) || policyRegistry_ == address(0)) {
            revert InvalidAddress();
        }
        admin = admin_;
        policyRegistry = IPolicyRegistry(policyRegistry_);
    }

    function setTeeSigner(address signer, bool registered) external {
        if (msg.sender != admin) revert Unauthorized();
        if (signer == address(0)) revert InvalidAddress();

        registeredTeeSigners[signer] = registered;
        emit TeeSignerStatusChanged(signer, registered);
    }

    function requestAccess(bytes32 policyId, bytes calldata ciphertext) external {
        if (!policyRegistry.isPolicyActive(policyId)) revert InactivePolicy();
        emit AccessRequested(msg.sender, policyId, ciphertext);
    }

    function submitDecision(
        AccessDecision calldata decision,
        bytes calldata signature
    ) external {
        if (!policyRegistry.isPolicyActive(decision.policyId)) {
            revert InactivePolicy();
        }
        if (!decision.eligible) revert ApplicantNotEligible();
        if (decision.expiresAt <= block.timestamp) revert DecisionExpired();

        bytes32 digest = decisionDigest(decision);
        if (usedDecisions[digest]) revert DecisionAlreadyUsed();

        address signer = _recover(digest, signature);
        if (!registeredTeeSigners[signer]) {
            revert UnregisteredTeeSigner();
        }

        AccessPass storage current = accessPasses[decision.account][
            decision.policyId
        ];
        if (decision.nonce <= current.nonce) revert NonceNotIncreasing();

        usedDecisions[digest] = true;
        current.limitUsd = decision.limitUsd;
        current.expiresAt = decision.expiresAt;
        current.nonce = decision.nonce;

        emit AccessGranted(
            decision.account,
            decision.policyId,
            decision.limitUsd,
            decision.expiresAt,
            decision.nonce
        );
    }

    function submitFccDecision(
        bytes calldata resultData,
        bytes32 actionId,
        string calldata submissionTag,
        uint8 status,
        bytes calldata signature
    ) external {
        if (status != 1) revert FccResultFailed();
        if (usedFccActions[actionId]) revert FccActionAlreadyUsed();

        address signer = _recoverFccSigner(
            resultData,
            actionId,
            submissionTag,
            status,
            signature
        );
        if (!registeredTeeSigners[signer]) {
            revert UnregisteredTeeSigner();
        }

        FccDecisionData memory decision = abi.decode(
            resultData,
            (FccDecisionData)
        );

        if (decision.targetRegistry != address(this)) {
            revert ResultTargetMismatch();
        }
        (
            ,
            address expectedIssuer,
            bytes32 expectedRulesHash,
            bool active
        ) = policyRegistry.getPolicy(decision.policyId);
        if (!active) revert InactivePolicy();
        if (decision.rulesHash != expectedRulesHash) {
            revert PolicyCommitmentMismatch();
        }
        if (decision.credentialIssuer != expectedIssuer) {
            revert PolicyIssuerMismatch();
        }
        if (!decision.eligible) revert ApplicantNotEligible();
        if (decision.expiresAt <= block.timestamp) revert DecisionExpired();

        AccessPass storage current = accessPasses[decision.account][
            decision.policyId
        ];
        if (decision.nonce <= current.nonce) revert NonceNotIncreasing();

        usedFccActions[actionId] = true;
        current.limitUsd = decision.limitUsd;
        current.expiresAt = decision.expiresAt;
        current.nonce = decision.nonce;

        emit AccessGranted(
            decision.account,
            decision.policyId,
            decision.limitUsd,
            decision.expiresAt,
            decision.nonce
        );
    }

    function decisionDigest(
        AccessDecision calldata decision
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ACCESS_DECISION_TYPEHASH,
                decision.account,
                decision.policyId,
                decision.eligible,
                decision.limitUsd,
                decision.expiresAt,
                decision.nonce
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function getAccess(
        address account,
        bytes32 policyId
    ) external view returns (AccessPass memory) {
        return accessPasses[account][policyId];
    }

    function canAccess(
        address account,
        bytes32 policyId
    ) external view returns (bool) {
        AccessPass memory pass = accessPasses[account][policyId];
        return
            policyRegistry.isPolicyActive(policyId) &&
            pass.expiresAt > block.timestamp;
    }

    function _domainSeparator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    NAME_HASH,
                    VERSION_HASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    function _ethSigned(bytes32 hash) private pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    hash
                )
            );
    }

    function _recoverFccSigner(
        bytes calldata resultData,
        bytes32 actionId,
        string calldata submissionTag,
        uint8 status,
        bytes calldata signature
    ) private view returns (address) {
        bytes32 resultHash = keccak256(
            abi.encodePacked(
                keccak256(resultData),
                actionId,
                keccak256(bytes(submissionTag)),
                status
            )
        );
        bytes32 payloadHash = keccak256(
            abi.encode(
                TEE_ACTION_RESULT_PREFIX,
                block.chainid,
                resultHash
            )
        );
        return _recover(_ethSigned(payloadHash), signature);
    }

    function _recover(
        bytes32 digest,
        bytes calldata signature
    ) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > SECP256K1N_DIV_2 || (v != 27 && v != 28)) {
            revert InvalidSignature();
        }

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
