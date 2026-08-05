// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Metadata {
    function decimals() external view returns (uint8);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

interface IAccessRegistry {
    function canAccess(
        address account,
        bytes32 policyId
    ) external view returns (bool);

    function getAccess(
        address account,
        bytes32 policyId
    ) external view returns (uint128 limitUsd, uint64 expiresAt, uint64 nonce);
}

interface IXrpUsdOracle {
    function currentPrice() external returns (uint256 priceWei, uint64 timestamp);
}

contract PrivateFXRPVault {
    error AccessRequired();
    error AmountZero();
    error ExposureLimitExceeded(uint256 exposureUsd, uint256 limitUsd);
    error InvalidAddress();
    error InvalidTokenDecimals();
    error ReentrantCall();
    error TokenTransferFailed();
    error WithdrawalExceedsPosition();

    IERC20Metadata public immutable fxrp;
    IAccessRegistry public immutable accessRegistry;
    IXrpUsdOracle public immutable priceOracle;
    bytes32 public immutable policyId;
    uint256 public immutable fxrpUnit;

    mapping(address account => uint256 amount) public positionOf;
    uint256 private entered = 1;

    event Deposited(
        address indexed account,
        uint256 amount,
        uint256 exposureUsd
    );
    event Withdrawn(address indexed account, uint256 amount);

    constructor(
        address fxrp_,
        address accessRegistry_,
        address priceOracle_,
        bytes32 policyId_
    ) {
        if (
            fxrp_ == address(0) ||
            accessRegistry_ == address(0) ||
            priceOracle_ == address(0)
        ) {
            revert InvalidAddress();
        }

        uint8 tokenDecimals = IERC20Metadata(fxrp_).decimals();
        if (tokenDecimals > 18) revert InvalidTokenDecimals();

        fxrp = IERC20Metadata(fxrp_);
        accessRegistry = IAccessRegistry(accessRegistry_);
        priceOracle = IXrpUsdOracle(priceOracle_);
        policyId = policyId_;
        fxrpUnit = 10 ** tokenDecimals;
    }

    modifier nonReentrant() {
        if (entered != 1) revert ReentrantCall();
        entered = 2;
        _;
        entered = 1;
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        if (!accessRegistry.canAccess(msg.sender, policyId)) {
            revert AccessRequired();
        }

        (uint128 limitUsd, , ) = accessRegistry.getAccess(
            msg.sender,
            policyId
        );
        (uint256 priceWei, ) = priceOracle.currentPrice();
        uint256 nextPosition = positionOf[msg.sender] + amount;
        uint256 exposureUsd = _usdValue(nextPosition, priceWei);

        if (exposureUsd > limitUsd) {
            revert ExposureLimitExceeded(exposureUsd, limitUsd);
        }

        positionOf[msg.sender] = nextPosition;
        _safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount, exposureUsd);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        uint256 position = positionOf[msg.sender];
        if (amount > position) revert WithdrawalExceedsPosition();

        positionOf[msg.sender] = position - amount;
        _safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function _usdValue(
        uint256 fxrpAmount,
        uint256 priceWei
    ) private view returns (uint256) {
        // Access limits use six decimals while FTSOv2 returns 18-decimal prices.
        return (fxrpAmount * priceWei * 1e6) / fxrpUnit / 1e18;
    }

    function _safeTransferFrom(
        address from,
        address to,
        uint256 amount
    ) private {
        (bool success, bytes memory result) = address(fxrp).call(
            abi.encodeCall(IERC20Metadata.transferFrom, (from, to, amount))
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool success, bytes memory result) = address(fxrp).call(
            abi.encodeCall(IERC20Metadata.transfer, (to, amount))
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
