# oneCall → TypeScript 迁移计划

> 本文档是**执行手册**：后续 AI 编码 agent 应严格按本文档逐节实现，每节给出"Python 源文件 → TS 目标 API"的精确映射与目标代码骨架。Python 源码位于当前仓库的 `app/`，移植产物写在 `onecall-ts/`。本文档只定义迁移设计；开始编码前仍须完成阶段 0 的兼容性探针。

## 可行性结论与迁移原则

- **结论：可行**。Hono、LangChain JS、LangGraph JS、Milvus Node SDK 和 MCP JS 客户端均能覆盖当前 Python 后端能力；无需改变前端、模型、向量库或 Python MCP server。
- **主要风险不在 TypeScript 语言本身**，而在 LangChain/LangGraph 的跨语言 API 差异、现有 Milvus collection 兼容、SSE 契约和内存会话检查点操作。
- **采用旁路迁移，不原地替换**：Python 服务在整个迁移期间保持可运行；TS 开发服务按项目默认端口 `3000` 启动，需要其他端口时仅通过 `PORT` 覆盖，不设置迁移专用端口。
- **以外部行为兼容为目标**：HTTP 路径、请求别名、状态码、JSON 字段、SSE 事件顺序、Milvus 数据格式和前端行为优先于内部代码 1:1 翻译。
- **不双写生产数据**：TS 验证阶段使用独立 collection `biz_ts_migration`；兼容性确认后再读取或切换到 `biz`，避免测试写入污染现有知识库。
- **任何阶段失败均不影响 Python 服务**：删除 TS 测试 collection、停止 TS 进程即可回退，不修改 Python 业务代码和原 collection。

---

## 0. 迁移目标与边界

- **目标**：把 Python (FastAPI + LangChain/LangGraph + Qwen + Milvus) 后端整体迁移为 TypeScript (Hono + @langchain/* + Qwen OpenAI 兼容模式 + Milvus)。
- **保持不变**：
  - Milvus（Docker，`vector-database.yml`）。
  - 前端 `static/`（纯 JS，迁移后后端 SSE 契约必须与 `app.js` 完全一致）。
  - `.env` 的 key 名（沿用 `DASHSCOPE_API_KEY` 等，见 §3）。
  - **两个 MCP server（`mcp_servers/cls_server.py`、`monitor_server.py`）保持 Python**，TS 通过 MCP client 调用——MCP 设计上就是跨语言，重写无收益。
- **不在范围**：前端重写、MCP server 重写、模型/向量库替换。

---

## 1. 目标技术栈（锁定版本方向）

| 层 | Python 现状 | TS 目标 | 备注 |
|---|---|---|---|
| 运行时 | Python 3.11 + uv | Node.js 20+ + pnpm | — |
| Web 框架 | FastAPI + uvicorn | Hono + `@hono/node-server` | SSE 用 `hono/streaming` 的 `streamSSE` |
| AI 编排 | langchain + langgraph | `@langchain/core` `@langchain/langgraph` `@langchain/community` `@langchain/openai` `@langchain/mcp-adapters` | 阶段 0 探针通过后锁定精确版本并提交 `pnpm-lock.yaml`，禁止浮动 `latest` |
| LLM | `langchain_qwq.ChatQwen` / `langchain_openai.ChatOpenAI` | **统一用 `@langchain/openai.ChatOpenAI`**，`baseURL = https://dashscope.aliyuncs.com/compatible-mode/v1` | Python 侧 `llm_factory.py` 已是这套；迁移时所有 `ChatQwen(...)` 全部替换为工厂产物 |
| 向量库 | `langchain-milvus` + `pymilvus` | `@langchain/community` 的 `Milvus` vectorstore + `@zilliz/milvus2-sdk-node` | API 形态不同，需手写适配（见 §7） |
| Embedding | DashScope text-embedding-v4 | `@langchain/openai.OpenAIEmbeddings`，`baseURL` 指向 DashScope 兼容端点 | OpenAI 兼容模式 |
| MCP 客户端 | `langchain-mcp-adapters` | `@langchain/mcp-adapters`（同一包的 JS 版） | API 近似 |
| 配置 | Pydantic Settings | `zod` + `dotenv` | 见 §3 |
| 日志 | loguru | `pino` | 见 §4 |
| 测试 | pytest（已配置但无测试） | `vitest` | 见 §12 |

---

## 2. 目标目录结构

```
onecall-ts/
├─ package.json
├─ tsconfig.json
├─ .env.example            # 只列变量名，不复制真实密钥
├─ static/                 # 从项目根 static/ 原样复制，不改前端契约
├─ src/
│  ├─ main.ts              # Hono 入口（对齐 app/main.py）
│  ├─ config.ts            # Settings（对齐 app/config.py）
│  ├─ logger.ts            # pino 实例
│  ├─ core/
│  │  ├─ llmFactory.ts     # 对齐 app/core/llm_factory.py
│  │  └─ milvusClient.ts   # 对齐 app/core/milvus_client.py
│  ├─ tools/
│  │  ├─ index.ts          # DEFAULT_LOCAL_AGENT_TOOLS
│  │  ├─ knowledgeTool.ts  # retrieve_knowledge
│  │  ├─ timeTool.ts       # get_current_time
│  │  └─ queryMetricsAlerts.ts
│  ├─ agent/
│  │  ├─ mcpClient.ts      # 对齐 app/agent/mcp_client.py
│  │  └─ aiops/
│  │     ├─ state.ts      # PlanExecuteState（Annotation）
│  │     ├─ planner.ts
│  │     ├─ executor.ts
│  │     ├─ replanner.ts
│  │     └─ utils.ts      # format_tools_description
│  ├─ services/
│  │  ├─ ragAgentService.ts
│  │  ├─ aiopsService.ts
│  │  └─ (vector/embedding/index/search/documentSplitter 对应文件)
│  ├─ models/
│  │  ├─ request.ts       # ChatRequest, ClearRequest
│  │  └─ response.ts      # ApiResponse, SessionInfoResponse
│  └─ api/
│     ├─ chat.ts          # /chat /chat_stream /chat/clear /chat/session/:id
│     ├─ aiops.ts
│     ├─ file.ts
│     └─ health.ts
├─ tests/                  # vitest：单元、契约、集成测试
└─ scripts/                # 兼容性探针、双栈对照和启动脚本
```

**运行目录约定**：所有 Node 命令均从 `onecall-ts/` 执行。配置加载顺序为外部环境变量 → `onecall-ts/.env` → 默认值；不自动读取父目录 `../.env`，避免继承 Python 的 `PORT=9900`。需要的密钥和服务地址按同名变量写入 TS 自己的 `.env`。静态资源必须位于 `onecall-ts/static/`，不得依赖启动命令的偶然当前目录。

---

## 3. 配置迁移（`app/config.py` → `src/config.ts`）

源文件：`app/config.py`。用 `zod` + `dotenv` 复刻 `Settings`。**所有默认值与 Python 一致**。

```ts
// src/config.ts
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const localEnv = resolve(moduleDir, '../.env');
if (existsSync(localEnv)) dotenv.config({ path: localEnv });

const booleanFromEnv = z.preprocess(
  (value) => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  z.boolean(),
);

const Schema = z.object({
  APP_NAME: z.string().default('SuperBizAgent'),
  APP_VERSION: z.string().default('1.0.0'),
  DEBUG: booleanFromEnv.default(false),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),

  DASHSCOPE_API_KEY: z.string().min(1, 'DASHSCOPE_API_KEY is required'),
  DASHSCOPE_MODEL: z.string().default('qwen-max'),
  DASHSCOPE_EMBEDDING_MODEL: z.string().default('text-embedding-v4'),

  MILVUS_HOST: z.string().default('localhost'),
  MILVUS_PORT: z.coerce.number().int().positive().default(19530),
  MILVUS_TIMEOUT: z.coerce.number().positive().default(10000),

  RAG_TOP_K: z.coerce.number().int().positive().default(3),
  RAG_MODEL: z.string().default('qwen-max'),
  CHUNK_MAX_SIZE: z.coerce.number().int().positive().default(800),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(100),

  MCP_CLS_TRANSPORT: z.string().default('streamable-http'),
  MCP_CLS_URL: z.string().url().default('http://localhost:8003/mcp'),
  MCP_MONITOR_TRANSPORT: z.string().default('streamable-http'),
  MCP_MONITOR_URL: z.string().url().default('http://localhost:8004/mcp'),

  PROMETHEUS_BASE_URL: z.string().url().default('http://127.0.0.1:9090'),
  PROMETHEUS_REQUEST_TIMEOUT: z.coerce.number().positive().default(10.0),
});

const env = Schema.parse(process.env);
export const config = Object.freeze({
  app_name: env.APP_NAME,
  app_version: env.APP_VERSION,
  debug: env.DEBUG,
  host: env.HOST,
  port: env.PORT,
  dashscope_api_key: env.DASHSCOPE_API_KEY,
  dashscope_model: env.DASHSCOPE_MODEL,
  dashscope_embedding_model: env.DASHSCOPE_EMBEDDING_MODEL,
  milvus_host: env.MILVUS_HOST,
  milvus_port: env.MILVUS_PORT,
  milvus_timeout: env.MILVUS_TIMEOUT,
  rag_top_k: env.RAG_TOP_K,
  rag_model: env.RAG_MODEL,
  chunk_max_size: env.CHUNK_MAX_SIZE,
  chunk_overlap: env.CHUNK_OVERLAP,
  mcp_cls_transport: env.MCP_CLS_TRANSPORT,
  mcp_cls_url: env.MCP_CLS_URL,
  mcp_monitor_transport: env.MCP_MONITOR_TRANSPORT,
  mcp_monitor_url: env.MCP_MONITOR_URL,
  prometheus_base_url: env.PROMETHEUS_BASE_URL,
  prometheus_request_timeout: env.PROMETHEUS_REQUEST_TIMEOUT,
});

export const mcpServers = {
  cls: { transport: config.mcp_cls_transport, url: config.mcp_cls_url },
  monitor: { transport: config.mcp_monitor_transport, url: config.mcp_monitor_url },
};
```

要点：必须显式读取现有大写环境变量名，不能用小写 schema 直接解析 `process.env`。不得使用 `z.coerce.boolean()` 解析字符串 `"false"`，因为 JavaScript 会将非空字符串转为 `true`。配置模块用绝对路径加载 `onecall-ts/.env`，开发端口默认 `3000`，并在真正使用模型的命令中校验 API Key。

---

## 4. 日志（loguru → pino）

```ts
// src/logger.ts
import pino from 'pino';
export const logger = pino({ level: config.debug ? 'debug' : 'info' });
```

迁移注意：loguru `logger.info(f"...{x}...")` 的 f-string 模板 → pino `logger.info({x}, '...')` 或 `logger.info(\`...${x}\`)`。前者为结构化日志优先。

---

## 5. LLM 工厂（`app/core/llm_factory.py` → `src/core/llmFactory.ts`）

源文件：`app/core/llm_factory.py`。Python 侧已是 `ChatOpenAI` + DashScope 兼容模式，TS 直接 1:1 迁移。

```ts
// src/core/llmFactory.ts
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';

export const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export interface CreateChatOpts {
  model?: string;
  temperature?: number;
  streaming?: boolean;
  baseURL?: string;
  apiKey?: string;
}

export function createChatModel(opts: CreateChatOpts = {}): ChatOpenAI {
  const model = opts.model ?? config.dashscope_model;
  const baseURL = opts.baseURL ?? DASHSCOPE_BASE_URL;
  const apiKey = opts.apiKey ?? config.dashscope_api_key;
  const streaming = opts.streaming ?? true;
  const temperature = opts.temperature ?? 0.7;
  return new ChatOpenAI({ model, temperature, streaming, baseURL, apiKey,
    // DashScope 兼容模式需要 stream 选项，通过 defaultHeaders / modelKwargs 传递
    // 若 streaming 行为异常，补充 defaultParams: { stream: true }
  });
}

export const llmFactory = { createChatModel };
```

**关键迁移指令**：Python 源码中所有 `ChatQwen(model=..., api_key=..., temperature=..., streaming=...)` 出现处（`rag_agent_service.py`、`planner.py`、`executor.py`、`replanner.py`）**全部替换为 `createChatModel({ model: config.rag_model, temperature: 0, streaming: ... })`**。`temperature=0` 用于规划/执行，`streaming` 按需。

---

## 6. MCP 客户端（`app/agent/mcp_client.py` → `src/agent/mcpClient.ts`）

源文件：`app/agent/mcp_client.py`。`MultiServerMCPClient`、`get_tools()`、拦截器机制在 JS 版 `@langchain/mcp-adapters` 中都存在。

```ts
// src/agent/mcpClient.ts
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { config, mcpServers } from '../config';
import { logger } from '../logger';

let _client: MultiServerMCPClient | null = null;

export async function getMcpClient(forceNew = false): Promise<MultiServerMCPClient> {
  if (forceNew) return new MultiServerMCPClient(mcpServers); // 注意 JS 版构造签名，见下注
  if (!_client) {
    logger.info('初始化全局 MCP 客户端...');
    _client = new MultiServerMCPClient(mcpServers);
    logger.info('全局 MCP 客户端初始化完成');
  }
  return _client;
}

export async function loadMcpToolsSafe(client: MultiServerMCPClient) {
  try {
    const tools = await client.getTools();
    return { tools, error: null as string | null };
  } catch (e: any) {
    return { tools: [], error: formatExceptionChain(e) };
  }
}

export function formatExceptionChain(e: any): string { /* 展开 cause 链 */ return ...; }
export function suggestMcpTransport(url: string, transport: string): string | null { /* 1:1 复刻 */ }
```

**注**：JS 版 `MultiServerMCPClient` 的构造与拦截器 API 与 Python 略有差异，实现时须先读 `@langchain/mcp-adapters` 的类型定义。重试拦截器（`retry_interceptor`，指数退避 3 次）如 JS 版签名兼容则复刻；若不兼容，则改为在 `getMcpClient` 外包一层对 `getTools()` 与工具调用的 try/catch 重试包装——**语义对齐即可，不要求 API 形式完全相同**。配置项 `mcp_cls_url` 指向 Python 端 `cls_server.py`（端口 8003 `/mcp`，streamable-http），TS 端只消费，不启动。

---

## 7. Milvus 与向量存储服务（`app/core/milvus_client.py` + `app/services/*`）

源文件：`app/core/milvus_client.py`（含一个 pymilvus ORM 别名 hack）+ `app/services/` 下的 vector-store/embedding/index/search/document-splitter 服务。

**迁移策略**：放弃复刻 pymilvus ORM hack（那是 Python 特有问题）；直接用 LangChain JS 的 `Milvus` vectorstore + `@zilliz/milvus2-sdk-node`。常量对齐：`COLLECTION_NAME='biz'`，`VECTOR_DIM=1024`，`ID_MAX_LENGTH=100`，`CONTENT_MAX_LENGTH=8000`。

```ts
// src/core/milvusClient.ts（精简骨架）
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { OpenAIEmbeddings } from '@langchain/openai';
import { config } from '../config';
import { DASHSCOPE_BASE_URL } from './llmFactory';

export const COLLECTION_NAME = 'biz';
export const VECTOR_DIM = 1024;

export const embeddings = () => new OpenAIEmbeddings({
  model: config.dashscope_embedding_model,
  apiKey: config.dashscope_api_key,
  baseURL: DASHSCOPE_BASE_URL,
  dimensions: VECTOR_DIM,
});

export const vectorStore = () => new Milvus(embeddings(), {
  clientParams: { address: `${config.milvus_host}:${config.milvus_port}` },
  collectionName: COLLECTION_NAME,
  primaryField: 'id',
  textField: 'content',
  vectorField: 'vector',
  metadataField: 'metadata',
  autoId: false,
  // index: IVF_FLAT, metric: L2, nlist: 128；具体属性名以阶段 0 锁定版本类型为准。
});
```

`retrieve_knowledge` 工具（见 §8）用 `vectorStore().similaritySearch(query, config.rag_top_k)` 实现。文档分块不能只替换为一个通用 splitter：Markdown 必须保留“标题分割 → RecursiveCharacterTextSplitter”的两段逻辑，普通文本使用 RecursiveCharacterTextSplitter；metadata 保留 `_source`、`_extension`、`_file_name`。重复索引同一文件前，先按 `metadata["_source"]` 删除旧 chunks，再使用 UUID 主键插入，保持 Python 的覆盖更新语义。

### 7.1 collection 兼容与安全策略

1. 阶段 0 用 Node SDK读取 `biz` 的 schema、索引、向量维度和一条脱敏样本，只读不写。
2. 阶段 3 默认写入 `MILVUS_COLLECTION=biz_ts_migration`，验证创建、批量插入、L2 检索、按 source 删除和再次索引。
3. TS 必须能读取 Python 写入的 `biz`，Python 也必须能读取 TS 写入的测试 collection；metadata JSON 和字段名逐项相同。
4. 只有兼容测试通过后，切换配置到 `biz`。禁止因为 schema 不匹配自动删除 `biz`；生产 collection 的删除或重建必须人工批准并先备份。
5. Milvus 不可用时，应用启动失败；健康检查返回与 Python 一致的 `503`、`code:503` 和数据库错误信息。

**风险**：JS `Milvus` 的 schema/索引 API 与 Python `langchain-milvus` 不完全对应，实现时需读 `@langchain/community` Milvus 源码逐字段对齐 schema，**这是迁移中 API 差异最大的一块**，建议优先打通"插入一条 + 检索一条"再铺开。

---

## 8. 工具（`app/tools/*` → `src/tools/*`）

源：`app/tools/__init__.py` 导出 `DEFAULT_LOCAL_AGENT_TOOLS = (retrieve_knowledge, get_current_time, query_prometheus_alerts)`。每个工具用 `@tool` 装饰器等价的 LangChain JS `tool()` / `DynamicTool` 实现。

```ts
// src/tools/index.ts
import { retrieve_knowledge } from './knowledgeTool';
import { get_current_time } from './timeTool';
import { query_prometheus_alerts } from './queryMetricsAlerts';

export const DEFAULT_LOCAL_AGENT_TOOLS = [retrieve_knowledge, get_current_time, query_prometheus_alerts];
```

- `retrieve_knowledge`：Python 用 `response_format="content_and_artifact"` 且 `ainvoke` 返回字符串。JS 用 `@langchain/core/tools` 的 `tool()`，返回 `string`（拼接 top_k 检索结果）。
- `get_current_time`：返回当前时间字符串。
- `query_prometheus_alerts`：`fetch(config.prometheus_base_url + '/api/v1/alerts')` 解析；超时用 `AbortSignal.timeout(config.prometheus_request_timeout * 1000)`。

---

## 9. RAG Agent 服务（`app/services/rag_agent_service.py` → `src/services/ragAgentService.ts`）

源文件核心：
- `create_agent(model, tools, checkpointer=MemorySaver())`
- `trim_messages_middleware`（保留首条 system + 最近 6/7 条，用 `RemoveMessage(REMOVE_ALL_MESSAGES)`）
- `astream(stream_mode="messages")` 逐 token 流式，只对 `AIMessage/AIMessageChunk` 的 text content_blocks 输出 `{type:'content', data, node}`
- `query()` 非流式、`get_session_history()`、`clear_session()`（`checkpointer.delete_thread`）

**JS 映射**：

```ts
// src/services/ragAgentService.ts（骨架）
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { SystemMessage, HumanMessage, RemoveMessage, REMOVE_ALL_MESSAGES } from '@langchain/core/messages';
import { createChatModel } from '../core/llmFactory';
import { DEFAULT_LOCAL_AGENT_TOOLS } from '../tools';
import { getMcpClient, loadMcpToolsSafe, suggestMcpTransport } from '../agent/mcpClient';
import { config, mcpServers } from '../config';

export class RagAgentService {
  private model = createChatModel({ model: config.rag_model, temperature: 0.7, streaming: true });
  private tools = [...DEFAULT_LOCAL_AGENT_TOOLS];
  private mcpTools: any[] = [];
  private checkpointer = new MemorySaver();
  private agent: any = null;
  private initialized = false;
  private systemPrompt = `...`; // 1:1 复刻 _build_system_prompt

  private async initializeAgent() {
    if (this.initialized) return;
    // suggestMcp_transport 警告（1:1）
    const client = await getMcpClient();
    const { tools, error } = await loadMcpToolsSafe(client);
    this.mcpTools = error ? [] : tools;
    const allTools = [...this.tools, ...this.mcpTools];
    this.agent = createReactAgent({
      llm: this.model, tools: allTools, checkpointer: this.checkpointer,
      // 消息修剪：JS 用 stateModifier 或中间件，见下
    });
    this.initialized = true;
  }

  async query(question: string, sessionId: string): Promise<string> { /* ainvoke，提取 last message.content */ }

  async *queryStream(question: string, sessionId: string) {
    await this.initializeAgent();
    const input = { messages: [new SystemMessage(this.systemPrompt), new HumanMessage(question)] };
    const cfg = { configurable: { thread_id: sessionId } };
    for await (const [chunk, metadata] of this.agent.stream(input, { ...cfg, streamMode: 'messages' })) {
      // 仅 AIMessageChunk 的 text content → yield {type:'content', data, node: metadata.langgraph_node}
    }
    yield { type: 'complete' };
  }

  getSessionHistory(sessionId: string) { /* checkpointer.getTuple → channel_values.messages → 过滤 system */ }
  clearSession(sessionId: string) { /* this.checkpointer.put/删除 thread */ }
}
export const ragAgentService = new RagAgentService();
```

**消息修剪迁移**：Python 用中间件返回 `{messages: [RemoveMessage(REMOVE_ALL_MESSAGES), ...new]}`。JS `createReactAgent` 无完全相同的"中间件"，但有 `stateModifier`(函数) 或 `prompt`/`messageModifier` 选项——用它返回修剪后的 messages 数组。语义对齐：保留首条 system + 最近 6/7 条，总 ≤7 不修剪。实现时查阅 `createReactAgent` 的 `stateModifier` 签名。

**流式 chunk 形态差异**（关键坑）：JS `streamMode:'messages'` 返回 `[messageChunk, metadata]`，`messageChunk.content` 可能是 string 或数组（含 `{type:'text', text}`）。迁移时需处理两种形态——当 `content` 为数组时取 `type==='text'` 的 `text`。这对应 Python 的 `content_blocks` 处理逻辑。

**会话历史/清理**：JS `MemorySaver`（或新版 `InMemorySaver`）的 API 与 Python `MemorySaver.get/delete_thread` 不同，实现时按 JS 类型定义对齐；核心是能按 `thread_id` 读消息列表与清空。

---

## 10. AIOps Plan-Execute-Replan（`app/agent/aiops/*` + `app/services/aiops_service.py`）

### 10.1 状态（`state.py` → `src/agent/aiops/state.ts`）

Python 用 `TypedDict` + `Annotated[..., operator.add]`（`past_steps` 追加）。JS 用 `Annotation.Root`：

```ts
import { Annotation } from '@langchain/langgraph';

export const PlanExecuteState = Annotation.Root({
  input: Annotation<string>,
  plan: Annotation<string[]>,          // 默认 reducer 是覆盖，符合 Python（planner 覆盖式）
  past_steps: Annotation<[string, string][]>({
    reducer: (prev, next) => [...prev, ...next],   // 等价 operator.add
    default: () => [],
  }),
  response: Annotation<string>,
});
```

注：Python `plan` 字段在 executor 里是 `plan[1:]` 覆盖返回、planner 覆盖返回——都用默认覆盖 reducer 即可。

### 10.2 Planner（`planner.py` → `src/agent/aiops/planner.ts`）

- `Plan` Pydantic 模型 → zod：`z.object({ steps: z.array(z.string()) })`，附 description。
- `planner_prompt = ChatPromptTemplate.from_messages([system(...{tools_description}{experience_context}...), placeholder {messages}])` → JS `ChatPromptTemplate.fromMessages`（模板变量语法一致）。
- `llm.with_structured_output(Plan)` → `llm.withStructuredOutput(PlanSchema)`。
- 流程：`retrieve_knowledge.ainvoke({query})` 取经验文档 → 拼 `experience_context` → `format_tools_description(all_tools)` → `(prompt | llm.withStructuredOutput(PlanSchema)).invoke({messages, tools_description, experience_context})` → 返回 `{plan: steps}`。
- 异常兜底返回默认 3 步计划（1:1）。

### 10.3 Executor（`executor.py` → `src/agent/aiops/executor.ts`）

- `ToolNode(all_tools)` → JS `ToolNode`（`@langchain/langgraph/prebuilt`）。
- `llm.bind_tools(all_tools)` → `llm.bindTools(all_tools)`。
- 流程：取 `plan[0]` → `SystemMessage + HumanMessage("请执行以下任务: "+task)` → `llmWithTools.invoke(messages)` → 若有 `tool_calls`，append，`toolNode.invoke({messages})` → extend tool messages → 再 `invoke` 取 `finalResponse.content` → 返回 `{plan: plan.slice(1), past_steps: [[task, result]]}`。
- 工具结果类型判断：JS AIMessage 的 `tool_calls` 与 `content` 取值语法与 Python 一致，但需注意 `content` 可能是 string 或数组——按 string 处理前先规范化。

### 10.4 Replanner（`replanner.py` → `src/agent/aiops/replanner.ts`）

- `Response`、`Act` Pydantic → zod（`Act.action` 用 zod enum `'continue'|'replan'|'respond'`，`Act.new_steps` 默认 `[]`）。
- `MAX_STEPS=8`：`past_steps.length >= 8` 直接走 `_generate_response`。
- replan 限制：`new_steps.length > plan.length` 截断；`past_steps.length >= 5` 禁止 replan。
- `_generate_response`：`response_prompt | llm.withStructuredOutput(ResponseSchema)`。
- 全部逻辑 1:1 复刻；异常兜底 fallback 报告模板（1:1 复刻 Markdown）。

### 10.5 服务编排（`aiops_service.py` → `src/services/aiopsService.ts`）

源：`StateGraph(PlanExecuteState)` → `add_node(planner/executor/replanner)` → `set_entry_point(planner)` → `planner→executor`、`executor→replanner`、`replanner` 条件边 `should_continue`（有 response→END；有 plan→executor；否则 END）→ `compile(checkpointer=MemorySaver())`。

```ts
import { StateGraph, END, MemorySaver } from '@langchain/langgraph';
const workflow = new StateGraph(PlanExecuteState)
  .addNode('planner', planner).addNode('executor', executor).addNode('replanner', replanner)
  .addEdge('__start__', 'planner').addEdge('planner', 'executor').addEdge('executor', 'replanner')
  .addConditionalEdges('replanner', (state) =>
    state.response ? END : (state.plan?.length ? 'executor' : END),
    { executor: 'executor', [END]: END })
  .compile({ checkpointer: new MemorySaver() });
```

`execute(userInput, sessionId)`：`astream(stream_mode="updates")` → JS `stream(initialState, { configurable:{thread_id:sessionId}, streamMode:'updates' })`，按 `nodeName` 调 `_format_planner/executor/replanner_event`（1:1 复刻事件结构：`type/stage/message/plan/current_step/remaining_steps/report`）。最后 `getState(cfg)` 取 `response`，yield complete。`diagnose(sessionId)` 用固定 AIOps 报告模板任务串（1:1 复刻）。

---

## 11. API 层（FastAPI → Hono，SSE 契约必须对齐 `static/app.js`）

源路由（`/api` 前缀）：`chat.py`、`aiops.py`、`file.py`、`health.py`。入口 `main.py`：lifespan 连 Milvus、CORS、挂 `static/`、`GET /` 返回 `index.html`。

```ts
// src/main.ts（骨架）
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config';
import { milvusManager } from './core/milvusClient';
import { chat } from './api/chat';
import { aiops } from './api/aiops';
import { file } from './api/file';
import { health } from './api/health';

const app = new Hono();
await milvusManager.connect();           // 对齐 lifespan：启动连 Milvus
app.use('*', cors({ origin: '*', allowCredentials: true, allowMethods: '*', allowHeaders: '*' }));
app.route('/api', chat).route('/api', aiops).route('/api', file);
app.route('/', health);
app.use('/static/*', serveStatic({ root: './static' }));
app.get('/', (c) => c.body(/* index.html */));
serve({ fetch: app.fetch, hostname: config.host, port: config.port });
```

### SSE 端点（`POST /api/chat_stream`）契约——**严禁改动**

`static/app.js` 按 `event: message` + `data: <json>` 解析，json `type` 取值：`content` / `tool_call` / `search_results` / `debug` / `done` / `error`。TS 端必须逐字复刻 `app/api/chat.py` 的 `event_generator` 映射规则：

| service chunk.type | SSE data json.type | data 字段 |
|---|---|---|
| `content` | `content` | `{type:'content', data: chunk.data}` |
| `tool_call` | `tool_call` | `{type:'tool_call', data: chunk.data}` |
| `search_results` | `search_results` | `{type:'search_results', data: chunk.data}` |
| `debug` | `debug` | `{type:'debug', node, message_type}` |
| `complete` | `done` | `{type:'done', data: chunk.data}` |
| `error` | `error` | `{type:'error', data: str(chunk.data)}` |

用 Hono `streamSSE`：

```ts
import { streamSSE } from 'hono/streaming';
chat.post('/chat_stream', async (c) => streamSSE(c, async (stream) => {
  for await (const chunk of ragAgentService.queryStream(req.question, req.id)) {
    const payload = mapChunkToSSE(chunk);   // 上表规则
    await stream.writeSSE({ event: 'message', data: JSON.stringify(payload) });
  }
}));
```

其余端点：`POST /chat`（非流式）、`POST /chat/clear`、`GET /chat/session/:session_id`、`POST /api/aiops`（流式，事件结构见 `aiops_service._format_*`）、`POST /api/upload`、`POST /api/index_directory`。`models/request.ts`、`models/response.ts` 用 zod 复刻模型和响应。

请求兼容规则必须显式实现：

```ts
const ChatRequestSchema = z.object({
  Id: z.string().min(1).optional(),
  Question: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
}).transform((body, ctx) => {
  const id = body.Id ?? body.id;
  const question = body.Question ?? body.question;
  if (!id || !question) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Id and Question are required' });
    return z.NEVER;
  }
  return { id, question };
});

const ClearRequestSchema = z.object({
  sessionId: z.string().optional(),
  session_id: z.string().optional(),
}).transform(/* 两种名字均接受，统一输出 session_id */);
```

响应状态码和 JSON 也必须保持兼容：`POST /api/chat` 的业务异常仍返回现有 `{code:500,message:'error',data:{...}}` 结构；健康检查在 Milvus 异常时返回 HTTP 503；上传仅允许 `.txt/.md`、最大 10 MB，并保持“文件保存成功但索引失败仍返回上传成功”的现有行为。

静态托管使用基于 `import.meta.url` 解析的绝对路径。入口注册 `SIGINT`/`SIGTERM`，停止接收新请求，关闭 Milvus/MCP 资源并等待正在进行的 SSE 在超时内结束后退出。

---

## 12. 分阶段执行顺序（按此逐步推进，每阶段独立可验证）

> **前置**：当前项目无测试。阶段 0 先建立可重复的 HTTP/SSE 契约基线，不比较模型回答逐字内容，只比较确定性字段、事件类型与顺序、终止信号和错误结构。涉及真实模型、Milvus、MCP 的测试单独标为 integration，默认单元测试不得访问外网。

- **阶段 0｜兼容性探针+骨架**：创建 package/tsconfig，分别验证锁定版本下的 ChatOpenAI 流式输出、`withStructuredOutput`、LangGraph messages/updates 流、checkpointer 读取与清理、MCP `getTools()`、Milvus schema 读取和 Hono SSE；记录 Node/pnpm/依赖精确版本并提交 lockfile。`pnpm dev` 默认监听 `3000`。✅ 门禁：全部探针编译并运行，任何关键 API 不可用则先调整技术选型，禁止进入业务迁移。
- **阶段 1｜配置+日志**：§3 §4。✅ 门禁：测试大写变量映射、`DEBUG=false`、缺少 API Key、父目录 `.env` 兼容和敏感字段不进入日志。
- **阶段 2｜LLM 工厂**：§5。✅ 验证：`createChatModel().invoke('说hi')` 返回中文回复（确认 DashScope 兼容模式 + key 通）。
- **阶段 3｜Milvus 向量库**：§7。使用 `biz_ts_migration`。✅ 门禁：schema/索引符合设计；批量插入、检索、按 `_source` 删除、重复索引无重复数据；能只读检索现有 `biz`；绝不自动删除 `biz`。
- **阶段 4｜工具**：§8。✅ 验证：`retrieve_knowledge`、`query_prometheus_alerts` 单独 invoke 成功。
- **阶段 5｜MCP 客户端**：§6。✅ 验证：`getMcpClient().getTools()` 能列出 Python 端 cls/monitor server 的工具（先确保 Python MCP server 在跑）。
- **阶段 6｜RAG Agent**：§9 + SSE 端点 §11。✅ 门禁：`Id/Question` 与 `id/question` 均可用；SSE 至少覆盖 content/done/error；事件以完整 SSE frame 分割；多轮记忆、历史查询、`sessionId/session_id` 清空均通过。
- **阶段 7｜AIOps 图**：§10。✅ 门禁：`POST /api/aiops` 流式返回 plan/step_complete/report/complete；MAX_STEPS 生效；planner、executor、replanner 异常都有确定性 error 事件并终止。
- **阶段 8｜文件与 Web 收尾**：上传、目录索引、health、静态托管、CORS、`GET /`。✅ 门禁：文件类型、10 MB 限制、文件名净化、覆盖更新、部分索引失败、503 健康状态和从任意启动目录访问静态文件均通过。
- **阶段 9｜双栈验收**：Python `9900`、TS 默认 `3000` 使用相同只读输入。✅ 门禁：API 快照、SSE 事件序列、会话行为、知识库检索来源和前端人工验收全部通过；LLM 文本只检查非空、语言和必要结构，不要求逐字一致。
- **阶段 10｜切换**：保留 MCP Python 进程，TS 配置切换为 `biz`，仍由 `pnpm` 脚本按默认端口启动；如部署环境另有端口要求，通过 `PORT` 设置。✅ 门禁：健康检查、聊天、上传、AIOps 和前端回归通过后才更新启动脚本。观察期内保留 Python 启动方式，出现阻断问题立即回切。

---

## 13. 已知坑与风险清单

1. **原项目无测试网**：迁移前没有现成回归保障；阶段 0 建立确定性契约基线，后续每阶段必须通过对应门禁。
2. **Qwen 流式 chunk 形态**：JS `streamMode:'messages'` 的 `content` 可能是 string 或 `{type,text}[]`，§9 已要求两种都处理。
3. **Milvus JS API 差异**：最大风险点，§7 需逐字段对 schema。
4. **结构化输出 schema 全量手转**：`Plan`/`Act`/`Response` 三处 Pydantic→zod，且需验证 Qwen OpenAI 兼容模式下 `withStructuredOutput` 正常返回（function-calling 模式；若不稳，改用 `jsonMode` + 手 parse 兜底）。
5. **消息修剪**：Python 用中间件，JS 用 `stateModifier`，签名不同但可等价。
6. **MCP server 保持 Python**：迁移后部署需同时跑 `node` + 两个 Python MCP 进程，启动脚本要兼容。
7. **DashScope 站点**：Python 源码注释提醒需设 `DASHSCOPE_API_BASE`，否则走新加坡站。TS 用 `baseURL` 显式指定兼容端点，已规避。
8. **检查点 API 差异**：`get_session_history`/`clear_session` 依赖 JS `MemorySaver` 的 getTuple/delete 语义，实现时核对类型。
9. **工作目录漂移**：`.env`、静态资源和上传目录一律从模块文件位置解析为绝对路径。
10. **SSE 分帧**：测试必须覆盖一个网络 chunk 含多个事件、一个事件跨多个 chunk、UTF-8 中文跨 chunk，不能把读取 chunk 当作事件边界。
11. **上传安全**：文件名净化必须阻止 `../`、绝对路径和 Windows 路径分隔符逃逸上传目录；目录索引接口只能访问配置允许的根目录。
12. **内存会话语义**：Python 与 TS 当前都是进程内 MemorySaver，重启会丢历史；迁移不扩大为持久化需求，但需在 README 明确。

---

## 14. 验收标准（全部满足即迁移完成）

- [ ] `pnpm` 启动后，默认 `curl localhost:3000/health` 返回 200；设置 `PORT` 时按配置端口提供服务。
- [ ] `pnpm-lock.yaml` 已提交，Node 和所有关键依赖版本已锁定，阶段 0 API 探针通过。
- [ ] 前端 `index.html` 流式对话与原 Python 版**逐 type** 一致（content/tool_call/done/error），且多轮会话记忆生效（thread_id）。
- [ ] 请求别名兼容：聊天同时接受 `Id/Question` 和 `id/question`，清空同时接受 `sessionId` 和 `session_id`。
- [ ] 会话历史查询、清空接口行为与 Python 一致。
- [ ] AIOps diagnose 端到端产出结构化报告，事件序列含 plan/step_complete/report/complete。
- [ ] 知识库检索（retrieve_knowledge）返回真实向量检索结果，非空。
- [ ] Milvus schema、1024 维 embedding、L2/IVF_FLAT 索引、metadata 和覆盖更新语义与 Python 一致，迁移过程未删除 `biz`。
- [ ] MCP 工具（cls/monitor）在 TS agent 内可被调用。
- [ ] 上传格式、大小、路径安全、索引失败响应和目录访问范围通过测试。
- [ ] 双栈对同一输入的确定性 HTTP/SSE 契约一致，前端在 TS 默认端口 `3000` 人工验收通过。
- [ ] SIGINT/SIGTERM 能优雅停止，切换与回退步骤已经实际演练。

## 15. 正式切换与回退

### 切换前检查

1. 保存当前 Python 启动命令、环境变量和最近一次可用版本标识。
2. 备份 Milvus `biz`，确认 TS 对 `biz` 的检查仅执行只读操作。
3. 运行 `lint`、`typecheck`、unit、contract、integration 和双栈验收；生成一份带时间的验收结果。
4. TS 使用默认端口 `3000`，无需为了切换占用 Python 的 `9900`；避免两个主服务同时写同一 collection 即可。
5. Python MCP server 继续运行在 8003/8004，不随主服务切换。

### 回退条件与操作

- 回退条件：健康检查持续失败、聊天无法完成、SSE 无终止事件、上传破坏知识库、AIOps 无报告或关键错误率明显上升。
- 操作：停止 TS 主服务，将启动入口恢复到 Python，确认 Python 服务健康和核心接口；TS 迁移 collection 保留用于排障，不删除或改写 `biz`。
- 回退后先定位根因并补契约测试；修复通过完整阶段 9 后才能再次切换。

---

## 附录 A：源文件清单（按迁移顺序）

| Python 源 | 行数级 | 目标 | 阶段 |
|---|---|---|---|
| `app/config.py` | 73 | `src/config.ts` | 1 |
| `app/core/llm_factory.py` | 53 | `src/core/llmFactory.ts` | 2 |
| `app/core/milvus_client.py` | ~300 | `src/core/milvusClient.ts` | 3 |
| `app/services/*`（vector/embedding/index/search/splitter） | — | `src/services/*` | 3 |
| `app/tools/{knowledge,time,query_metrics_alerts}.py` + `__init__` | — | `src/tools/*` | 4 |
| `app/agent/mcp_client.py` | 231 | `src/agent/mcpClient.ts` | 5 |
| `app/services/rag_agent_service.py` | 419 | `src/services/ragAgentService.ts` | 6 |
| `app/api/chat.py` | 220 | `src/api/chat.ts` | 6 |
| `app/agent/aiops/{state,planner,executor,replanner,utils}.py` | — | `src/agent/aiops/*` | 7 |
| `app/services/aiops_service.py` | 342 | `src/services/aiopsService.ts` | 7 |
| `app/api/aiops.py` `file.py` `health.py` | — | `src/api/*` | 7-8 |
| `app/main.py` | 94 | `src/main.ts` | 0+8 |
| `app/models/{request,response}.py` | — | `src/models/*` | 6-7 |

## 附录 B：Python ↔ LangChain JS API 速查

| Python | JS |
|---|---|
| `langchain.agents.create_agent` | `@langchain/langgraph/prebuilt.createReactAgent` |
| `langgraph.graph.StateGraph` / `END` | `@langchain/langgraph.StateGraph` / `END` |
| `langgraph.checkpoint.memory.MemorySaver` | `@langchain/langgraph.MemorySaver`（或 `InMemorySaver`） |
| `langgraph.graph.message.add_messages` | `@langchain/langgraph.messagesStateReducer` |
| `RemoveMessage` / `REMOVE_ALL_MESSAGES` | `@langchain/core/messages` 同名 |
| `langchain_core.prompts.ChatPromptTemplate` | `@langchain/core/prompts.ChatPromptTemplate` |
| `llm.with_structured_output(Schema)` | `llm.withStructuredOutput(zodSchema)` |
| `llm.bind_tools(tools)` | `llm.bindTools(tools)` |
| `langgraph.prebuilt.ToolNode` | `@langchain/langgraph/prebuilt.ToolNode` |
| `astream(stream_mode="messages"/"updates")` | `stream(input, { streamMode: "messages"/"updates" })` |
| `TypedDict` + `Annotated[..., operator.add]` | `Annotation.Root({ f: { reducer, default } })` |
| `langchain_openai.ChatOpenAI` | `@langchain/openai.ChatOpenAI` |
| `langchain_mcp_adapters.MultiServerMCPClient` | `@langchain/mcp-adapters.MultiServerMCPClient` |
| `langchain_qwq.ChatQwen` | **删除**，统一用 `ChatOpenAI` + DashScope baseURL |
