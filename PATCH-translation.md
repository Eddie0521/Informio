# TranslationResultText 接入说明

> 这个 patch 解决两个划词翻译问题：
> 1. think 标签泄漏：模型原始 content 在 `translateSelection` 返回前没清理
> 2. 翻译结果无法复制：response 是普通 div，没有"复制"入口，鼠标拖选体验差
>
> 行为：
> - 文本可正常拖选、Cmd+C 复制
> - 选区非空时右键：拦掉默认菜单，在右键处弹出浮动"复制选中文本"按钮
> - 关闭：Esc / 容器外 mousedown / 滚动 / resize / 复制完成

## 改动 1：think 标签清理

`src/main/translationApi.ts` — 在两条返回路径加 `sanitizeAgentResponse`：

```diff
+import { sanitizeAgentResponse } from "../shared/agentResponse.js";
 import type {
   AgentModel,
   ...
 } from "../shared/types.js";

@@
   const content = extractAnthropicText(payload);
   if (!content) throw new Error("接口已响应，但没有返回翻译内容。");
-  return { content, raw: payload };
+  return { content: sanitizeAgentResponse(content), raw: payload };
 }

@@
   const content = extractOpenAiText(payload);
   if (!content) throw new Error("接口已响应，但没有返回翻译内容。");
-  return { content, raw: payload };
+  return { content: sanitizeAgentResponse(content), raw: payload };
 };
```

## 改动 2：抽出 `TranslationResultText` 组件

把 `src/renderer/src/components/TranslationResultText.tsx` 加进项目，导出 `TranslationResultText`。
组件内自带 `useState` / `useEffect` 管理浮动菜单，无外部依赖（仅 `react` + `lucide-react` 的 `Copy`）。

## 改动 3：在两处面板用它

`src/renderer/src/App.tsx`：

- 顶部 import 区域加：
  ```ts
  import { TranslationResultText } from "./components/TranslationResultText";
  ```

- `SelectionToolbar` 的 response 区域替换为：
  ```diff
  -          {response ? (
  -            <div
  -              className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-[var(--text-main)] cursor-text select-text"
  -              onMouseDown={(event) => event.stopPropagation()}
  -            >
  -              {response}
  -            </div>
  -          ) : null}
  +          {response ? <TranslationResultText text={response} /> : null}
  ```

- `SelectionTranslateSection` 的 response 区域同样替换为：
  ```diff
  -      {response ? (
  -        <div
  -          className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-5 text-[var(--text-main)] select-text cursor-text"
  -          onMouseDown={(event) => event.stopPropagation()}
  -        >
  -          {response}
  -        </div>
  -      ) : null}
  +      {response ? <TranslationResultText text={response} /> : null}
  ```

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

预期：typecheck 干净（HEAD base 上 0 错误），测试全过。
