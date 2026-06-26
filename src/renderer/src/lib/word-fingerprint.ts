import type { WordDiskFingerprint } from "../../../shared/types";

export const wordFingerprintsEqual = (left: WordDiskFingerprint, right: WordDiskFingerprint) =>
  left.mtimeMs === right.mtimeMs && left.size === right.size;
