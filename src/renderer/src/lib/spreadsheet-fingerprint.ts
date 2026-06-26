import type { SpreadsheetDiskFingerprint } from "../../../shared/types";

export type { SpreadsheetDiskFingerprint };

export const spreadsheetFingerprintsEqual = (
  left: SpreadsheetDiskFingerprint | null | undefined,
  right: SpreadsheetDiskFingerprint | null | undefined
) =>
  Boolean(left && right && left.mtimeMs === right.mtimeMs && left.size === right.size);
