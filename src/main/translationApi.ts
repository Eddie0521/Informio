import { sanitizeAgentResponse } from "../shared/agentResponse.js";
import type {
  AgentModel,
  ApiModelDetectionInput,
  ApiModelDetectionResult,
  TranslateSelectionInput,
  TranslateSelectionResult
} from "../shared/types.js";

const translationSystemPrompt = (targetLanguage: TranslateSelectionInput["targetLanguage"]) => `You are the translation assistant inside Informio.
Translate the selected text into ${targetLanguage === "zh-CN" ? "natural Simplified Chinese" : "natural English"}.
- Preserve Markdown meaning and structure when relevant.
- Return only the translation result, with no preface or explanation.`;

const ensureTrailingSlash = (value: string) => (value.endsWith("/") ? value : `${value}/`);

const buildUrl = (baseUrl: string, path: string) => new URL(path.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl.trim())).toString();

const readJsonResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown) => {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const candidate = payload as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof candidate.error === "string") return candidate.error;
    if (candidate.error && typeof candidate.error === "object" && typeof candidate.error.message === "string") return candidate.error.message;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "";
};

const requestJson = async (url: string, init: RequestInit, fallbackMessage: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const detail = extractErrorMessage(payload);
      throw new Error(detail ? `${fallbackMessage}（${response.status}）：${detail}` : `${fallbackMessage}（${response.status}）`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请检查网络、base_url 或服务端响应速度。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const normalizeModels = (items: unknown[]) => {
  const byId = new Map<string, AgentModel>();
  items.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const candidate = item as { id?: unknown; name?: unknown; display_name?: unknown; displayName?: unknown };
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id) return;
    const labelSource = [candidate.display_name, candidate.displayName, candidate.name].find((value) => typeof value === "string");
    byId.set(id, { id, label: (labelSource as string | undefined) || id });
  });
  return Array.from(byId.values()).slice(0, 200);
};

const extractModels = (payload: unknown) => {
  if (payload && typeof payload === "object") {
    const candidate = payload as { data?: unknown; models?: unknown };
    if (Array.isArray(candidate.data)) return normalizeModels(candidate.data);
    if (Array.isArray(candidate.models)) return normalizeModels(candidate.models);
  }
  return [];
};

const extractOpenAiText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as {
    choices?: Array<{
      message?: { content?: unknown };
      text?: unknown;
    }>;
  };
  const first = candidate.choices?.[0];
  if (!first) return "";
  if (typeof first.text === "string") return first.text.trim();
  const content = first.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
};

const extractAnthropicText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as { content?: Array<{ type?: string; text?: string }> };
  return (
    candidate.content
      ?.filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("")
      .trim() ?? ""
  );
};

const validateApiInput = (input: { baseUrl: string; apiKey: string; model?: string }) => {
  if (!input.baseUrl.trim()) throw new Error("请先填写 API 的 base_url。");
  if (!input.apiKey.trim()) throw new Error("请先填写 API 的 api_key。");
  if ("model" in input && !input.model?.trim()) throw new Error("请先检测并选择一个可用模型。");
};

export const detectApiModels = async (input: ApiModelDetectionInput): Promise<ApiModelDetectionResult> => {
  validateApiInput(input);
  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey.trim();
  const url =
    input.provider === "anthropic" ? buildUrl(baseUrl, "v1/models") : buildUrl(baseUrl, "models");
  const headers: Record<string, string> =
    input.provider === "anthropic"
      ? {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        }
      : {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        };

  const payload = await requestJson(url, { method: "GET", headers }, "模型检测失败");
  const models = extractModels(payload);
  if (!models.length) throw new Error("接口已响应，但没有返回可用模型列表。");
  return { models };
};

export const translateSelection = async (input: TranslateSelectionInput): Promise<TranslateSelectionResult> => {
  validateApiInput(input);
  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  const text = input.text.trim();
  const systemPrompt = translationSystemPrompt(input.targetLanguage);
  if (!text) throw new Error("没有可翻译的选中文本。");

  if (input.provider === "anthropic") {
    const payload = await requestJson(
      buildUrl(baseUrl, "v1/messages"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          max_tokens: 2048,
          temperature: 0.2,
          messages: [{ role: "user", content: text }]
        })
      },
      "翻译请求失败"
    );
    const content = extractAnthropicText(payload);
    if (!content) throw new Error("接口已响应，但没有返回翻译内容。");
    return { content: sanitizeAgentResponse(content), raw: payload };
  }

  const payload = await requestJson(
    buildUrl(baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      })
    },
    "翻译请求失败"
  );
  const content = extractOpenAiText(payload);
  if (!content) throw new Error("接口已响应，但没有返回翻译内容。");
  return { content: sanitizeAgentResponse(content), raw: payload };
};
