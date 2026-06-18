export const AGENT_TRANSCRIPT_BOTTOM_EPSILON = 4;

type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export const getAgentTranscriptDistanceFromBottom = ({ scrollHeight, scrollTop, clientHeight }: ScrollMetrics) =>
  Math.max(0, scrollHeight - scrollTop - clientHeight);

export const isAgentTranscriptAtBottom = (metrics: ScrollMetrics, threshold = AGENT_TRANSCRIPT_BOTTOM_EPSILON) =>
  getAgentTranscriptDistanceFromBottom(metrics) <= threshold;

export const shouldAutoScrollAgentTranscript = ({
  messageCount,
  isPinnedToBottom
}: {
  messageCount: number;
  isPinnedToBottom: boolean;
}) => messageCount > 0 && isPinnedToBottom;
