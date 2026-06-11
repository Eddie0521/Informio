import { create } from "zustand";
import type { SetStateAction } from "react";
import type {
  AgentConnection,
  AgentSelection,
  UnifiedToolbarTranslateState,
} from "../types";
import type { AgentSessionMessage } from "../types";

type AgentStore = {
  connections: AgentConnection[];
  agentMessages: AgentSessionMessage[];
  activeConversationId: string | null;
  pendingNewConversation: boolean;
  agentSelection: AgentSelection | null;
  agentBusy: boolean;
  checkingAgents: boolean;
  toolbarTranslate: UnifiedToolbarTranslateState;

  setConnections: (value: SetStateAction<AgentConnection[]>) => void;
  setAgentMessages: (value: SetStateAction<AgentSessionMessage[]>) => void;
  setActiveConversationId: (id: string | null) => void;
  setPendingNewConversation: (pending: boolean) => void;
  setAgentSelection: (value: SetStateAction<AgentSelection | null>) => void;
  setAgentBusy: (busy: boolean) => void;
  setCheckingAgents: (checking: boolean) => void;
  setToolbarTranslate: (value: SetStateAction<UnifiedToolbarTranslateState>) => void;
  clearToolbarTranslate: () => void;
};

const resolve = <T>(prev: T, value: SetStateAction<T>): T =>
  typeof value === "function" ? (value as (prev: T) => T)(prev) : value;

export const useAgentStore = create<AgentStore>((set) => ({
  connections: [],
  agentMessages: [],
  activeConversationId: null,
  pendingNewConversation: false,
  agentSelection: null,
  agentBusy: false,
  checkingAgents: false,
  toolbarTranslate: { status: "idle", response: "" },

  setConnections: (value) => set((s) => ({ connections: resolve(s.connections, value) })),
  setAgentMessages: (value) => set((s) => ({ agentMessages: resolve(s.agentMessages, value) })),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setPendingNewConversation: (pending) => set({ pendingNewConversation: pending }),
  setAgentSelection: (value) => set((s) => ({ agentSelection: resolve(s.agentSelection, value) })),
  setAgentBusy: (busy) => set({ agentBusy: busy }),
  setCheckingAgents: (checking) => set({ checkingAgents: checking }),
  setToolbarTranslate: (value) => set((s) => ({ toolbarTranslate: resolve(s.toolbarTranslate, value) })),
  clearToolbarTranslate: () => set({ toolbarTranslate: { status: "idle", response: "" } }),
}));
