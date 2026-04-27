export const HARDCODED_ADMIN_PASSCODE = "86303";
export const HARDCODED_DEFAULT_DELEGATE_PASSCODE = "DISEC1";
export const HARDCODED_DEFAULT_EB_PASSCODE = "DISEC1_EB";

export type HardcodedPasscodeRole = "delegate" | "eb";

export function normalizePasscodeInput(input: unknown): string {
  return String(input || "").trim().toUpperCase();
}

function normalizeCommitteeCodeFragment(input: unknown): string {
  return normalizePasscodeInput(input).replace(/[^A-Z0-9]/g, "");
}

export function getCommitteeHardcodedDelegatePasscode(
  committeeShortName: unknown,
): string {
  const fragment = normalizeCommitteeCodeFragment(committeeShortName);
  return fragment ? `${fragment}1` : "";
}

export function getCommitteeHardcodedEbPasscode(
  committeeShortName: unknown,
): string {
  const delegateCode = getCommitteeHardcodedDelegatePasscode(committeeShortName);
  return delegateCode ? `${delegateCode}_EB` : "";
}

export function getCommitteeHardcodedRoleForPasscode(
  codeInput: unknown,
  committeeShortName: unknown,
): HardcodedPasscodeRole | null {
  const code = normalizePasscodeInput(codeInput);
  const delegateCode = getCommitteeHardcodedDelegatePasscode(committeeShortName);
  const ebCode = getCommitteeHardcodedEbPasscode(committeeShortName);

  if (delegateCode && code === delegateCode) return "delegate";
  if (ebCode && code === ebCode) return "eb";
  return null;
}

export function getHardcodedRoleForPasscode(
  codeInput: unknown,
): HardcodedPasscodeRole | null {
  const code = normalizePasscodeInput(codeInput);
  if (code === HARDCODED_DEFAULT_DELEGATE_PASSCODE) return "delegate";
  if (code === HARDCODED_DEFAULT_EB_PASSCODE) return "eb";
  return null;
}