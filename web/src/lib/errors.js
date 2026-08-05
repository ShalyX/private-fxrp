export function readableError(error) {
  const message =
    error?.shortMessage ||
    error?.info?.error?.message ||
    error?.reason ||
    error?.message ||
    "Unexpected error";
  return message
    .replace(/^execution reverted:\s*/i, "")
    .replace(/^Error:\s*/i, "");
}
