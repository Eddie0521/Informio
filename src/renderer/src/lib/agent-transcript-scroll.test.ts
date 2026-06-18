import { describe, expect, it } from "vitest";
import {
  getAgentTranscriptDistanceFromBottom,
  isAgentTranscriptAtBottom,
  shouldAutoScrollAgentTranscript
} from "./agent-transcript-scroll";

describe("agent transcript scroll policy", () => {
  it("treats the transcript as pinned only at the bottom or within rounding tolerance", () => {
    expect(isAgentTranscriptAtBottom({ scrollHeight: 1200, scrollTop: 800, clientHeight: 400 })).toBe(true);
    expect(isAgentTranscriptAtBottom({ scrollHeight: 1200, scrollTop: 797, clientHeight: 400 })).toBe(true);
    expect(isAgentTranscriptAtBottom({ scrollHeight: 1200, scrollTop: 760, clientHeight: 400 })).toBe(false);
  });

  it("never lets a growing AI response move the viewport after the user leaves the bottom", () => {
    expect(shouldAutoScrollAgentTranscript({ messageCount: 5, isPinnedToBottom: false })).toBe(false);
  });

  it("keeps streaming replies pinned when the user is already reading at the bottom", () => {
    expect(shouldAutoScrollAgentTranscript({ messageCount: 5, isPinnedToBottom: true })).toBe(true);
  });

  it("does not request scrolling for an empty transcript", () => {
    expect(shouldAutoScrollAgentTranscript({ messageCount: 0, isPinnedToBottom: true })).toBe(false);
  });

  it("clamps overscroll distance so rubber-band scroll does not break bottom detection", () => {
    expect(getAgentTranscriptDistanceFromBottom({ scrollHeight: 1000, scrollTop: 620, clientHeight: 400 })).toBe(0);
  });
});
