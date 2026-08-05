export const policyRegistryAbi = [
  "function getPolicy(bytes32 policyId) view returns (tuple(address owner,address credentialIssuer,bytes32 rulesHash,bool active) policy)"
];

export const accessRegistryAbi = [
  "function getAccess(address account,bytes32 policyId) view returns (tuple(uint128 limitUsd,uint64 expiresAt,uint64 nonce))",
  "function canAccess(address account,bytes32 policyId) view returns (bool)",
  "function submitFccDecision(bytes resultData,bytes32 actionId,string submissionTag,uint8 status,bytes signature)"
];

export const instructionSenderAbi = [
  "function requestAccess(bytes encryptedPayload) payable returns (bytes32 instructionId)",
  "event AccessEvaluationRequested(bytes32 indexed instructionId,address indexed applicant)"
];

export const vaultAbi = [
  "function positionOf(address account) view returns (uint256)",
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function fxrpUnit() view returns (uint256)"
];

export const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];
