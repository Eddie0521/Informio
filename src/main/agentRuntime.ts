import type {
  AgentApprovalResponseInput,
  AgentConnection,
  AgentProvider,
  AgentSessionEvent,
  AgentSessionInput,
  AgentSessionResult,
  AgentStreamEvent,
  SendAgentMessageInput,
  SendAgentMessageResult
} from "../shared/types.js";
import { buildPrompt, buildSessionPrompt } from "./agentRuntimeShared.js";
import { ClaudeAgentSdkManager } from "./claudeAgentSdk.js";
import { CodexAppServerManager } from "./codexAppServer.js";
import { OpenCodeSdkManager } from "./openCodeSdk.js";

export class AgentRuntimeManager {
  private codexAppServer = new CodexAppServerManager();
  private claudeAgentSdk = new ClaudeAgentSdkManager();
  private openCodeSdk = new OpenCodeSdkManager();

  private managerFor(provider: AgentProvider) {
    if (provider.transport === "codex-app-server") return this.codexAppServer;
    if (provider.transport === "claude-agent-sdk") return this.claudeAgentSdk;
    return this.openCodeSdk;
  }

  getConnection(provider: AgentProvider): AgentConnection {
    const connection = this.managerFor(provider).getConnection(provider);
    return (
      connection ?? {
        providerId: provider.id,
        status: "idle",
        message: "Not connected.",
        tools: [],
        models: provider.models
      }
    );
  }

  listConnections(providers: AgentProvider[]) {
    return providers.map((provider) => this.getConnection(provider));
  }

  async connect(provider: AgentProvider) {
    return this.managerFor(provider).connect(provider);
  }

  async disconnect(providerId: string, providers: AgentProvider[]) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return { providerId, status: "idle", message: "Disconnected.", tools: [] } satisfies AgentConnection;
    return this.managerFor(provider).disconnect(providerId);
  }

  async send(input: SendAgentMessageInput, provider: AgentProvider): Promise<SendAgentMessageResult> {
    const prompt = buildPrompt(input);
    const manager = this.managerFor(provider);
    const result = await manager.runPromptStream(provider, prompt, {
      model: input.model,
      cwd: provider.cwd,
      onEvent: () => undefined
    });
    return { content: result.content || `${provider.name} returned an empty response.`, raw: result.raw };
  }

  async sendStream(
    input: SendAgentMessageInput,
    provider: AgentProvider,
    onEvent: (event: AgentStreamEvent) => void
  ): Promise<SendAgentMessageResult> {
    const prompt = buildPrompt(input);
    let content = "";
    const result = await this.managerFor(provider).runPromptStream(provider, prompt, {
      model: input.model,
      cwd: provider.cwd,
      onEvent: (event) => {
        if (event.type === "delta") {
          content += event.content;
          onEvent(event);
        }
        if (event.type === "error") onEvent(event);
      }
    });
    const finalContent = content || result.content || `${provider.name} returned an empty response.`;
    onEvent({ type: "done", content: finalContent });
    return { content: finalContent, raw: result.raw };
  }

  async runSessionStream(
    input: AgentSessionInput,
    provider: AgentProvider,
    onEvent: (event: AgentSessionEvent) => void
  ): Promise<AgentSessionResult> {
    const prompt = buildSessionPrompt(input, {
      includeConversationHistory: !(provider.runtimeSupportsResume || provider.transport === "codex-app-server" || provider.transport === "claude-agent-sdk" || provider.transport === "opencode-sdk")
    });
    return this.managerFor(provider).runSessionStream(input, provider, prompt, onEvent);
  }

  respondApproval(input: AgentApprovalResponseInput, providers: AgentProvider[]) {
    const provider = providers.find((item) => item.id === input.providerId);
    if (!provider) return false;
    return this.managerFor(provider).respondApproval(input);
  }

  cancelRun(providerId: string, providers: AgentProvider[]) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return false;
    return this.managerFor(provider).cancelRun(providerId);
  }
}
