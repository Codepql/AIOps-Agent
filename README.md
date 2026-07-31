# OneCall AI

[中文](#中文) | [English](#english)

OneCall AI is an open-source, TypeScript-native on-call assistant for incident
investigation, alert diagnosis, and knowledge-base-assisted troubleshooting.

## 中文

### 项目简介

OneCall AI 是一个使用 TypeScript 构建的智能运维助手。它提供流式 AI
对话、告警诊断、知识文档上传与向量检索，并内置两个基于 MCP 的本地模拟服务，
方便在没有真实日志或监控平台时开发和演示。

主要技术：

- Next.js + React：Web 界面
- Hono：HTTP API 和 SSE 流式响应
- LangChain.js + LangGraph.js：Agent 与工作流
- PostgreSQL + Prisma + pgvector：会话、文档和向量数据
- Model Context Protocol：CLS 日志与 Monitor 指标模拟工具

### 环境要求

- Node.js 20 或更高版本
- pnpm 10 或更高版本
- PostgreSQL 16 或更高版本
- pgvector 扩展（知识库功能需要）

### 安装

```powershell
git clone <your-repository-url>
cd onecall-ts
pnpm install
Copy-Item .env.example .env
```

编辑 `.env`，至少配置：

```dotenv
OPENAI_API_KEY=your-chat-model-key
BASE_URL=https://api.deepseek.com
LANGCHAIN_MODEL=deepseek-v4-flash

EMBEDDING_API_KEY=your-embedding-model-key
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4

DATABASE_URL=postgresql://postgres:your-password@localhost:5432/onecall
```

运行时只读取项目根目录的 `.env`。`.env.example` 只是可提交的配置模板，
不会被应用读取，也不应包含真实密钥。

### 初始化数据库

先创建 `onecall` 数据库并为 PostgreSQL 安装 pgvector，然后运行：

```powershell
pnpm prisma:generate
pnpm db:migrate
```

如果没有 pgvector，普通对话仍可启动，但知识库索引和向量检索不可用。

### 启动

启动 Web 和 API：

```powershell
pnpm dev
```

启动 Web、API 和两个本地 MCP 模拟服务：

```powershell
pnpm dev:all
```

也可以分别启动：

```powershell
pnpm dev:api
pnpm dev:web
pnpm mcp:cls
pnpm mcp:monitor
```

默认地址：

- Web：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:3001`
- CLS MCP：`http://127.0.0.1:8003/mcp`
- Monitor MCP：`http://127.0.0.1:8004/mcp`

### 使用

- 智能对话：询问故障、服务状态或处理建议
- 告警诊断：调用 CLS 与 Monitor MCP 工具生成诊断过程和报告
- 知识库：上传 `.md` 或 `.txt` 文档并建立 pgvector 索引

### 常用命令

```powershell
pnpm test              # 运行测试
pnpm typecheck         # TypeScript 类型检查
pnpm build             # 生产构建
pnpm start             # 启动生产构建
pnpm prisma:validate   # 校验 Prisma schema
pnpm prisma:generate   # 生成 Prisma Client
pnpm db:migrate        # 应用数据库 migration
```

## English

### Overview

OneCall AI is a TypeScript-native operations assistant for streamed AI chat,
alert diagnosis, document ingestion, and vector-based knowledge retrieval. It
includes two local MCP mock services, so the diagnosis workflow can be tested
without connecting to a production logging or monitoring platform.

Core stack:

- Next.js and React for the web interface
- Hono for HTTP APIs and SSE streaming
- LangChain.js and LangGraph.js for agents and workflows
- PostgreSQL, Prisma, and pgvector for persistent and vector data
- Model Context Protocol for mock CLS and monitoring tools

### Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL 16+
- pgvector extension for knowledge-base features

### Installation

```powershell
git clone <your-repository-url>
cd onecall-ts
pnpm install
Copy-Item .env.example .env
```

Edit `.env` and configure at least the chat model, embedding model, and
PostgreSQL connection:

```dotenv
OPENAI_API_KEY=your-chat-model-key
BASE_URL=https://api.deepseek.com
LANGCHAIN_MODEL=deepseek-v4-flash

EMBEDDING_API_KEY=your-embedding-model-key
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4

DATABASE_URL=postgresql://postgres:your-password@localhost:5432/onecall
```

The application reads only `.env` from the project root. `.env.example` is a
committable template and is never loaded at runtime. Never store real secrets
in `.env.example`.

### Database Setup

Create the `onecall` database, install pgvector in PostgreSQL, and run:

```powershell
pnpm prisma:generate
pnpm db:migrate
```

Without pgvector, regular chat can still start, but document indexing and vector
retrieval remain unavailable.

### Running

Start the web application and API:

```powershell
pnpm dev
```

Start the web application, API, and both local MCP mock services:

```powershell
pnpm dev:all
```

Individual services can also be started with `pnpm dev:api`, `pnpm dev:web`,
`pnpm mcp:cls`, and `pnpm mcp:monitor`.

Default endpoints:

- Web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:3001`
- CLS MCP: `http://127.0.0.1:8003/mcp`
- Monitor MCP: `http://127.0.0.1:8004/mcp`

### Usage

- Chat: investigate incidents, service health, and remediation options
- Alert diagnosis: run the CLS and Monitor MCP tools and generate a report
- Knowledge base: upload `.md` or `.txt` files and build a pgvector index

### Development Commands

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm start
pnpm prisma:validate
pnpm prisma:generate
pnpm db:migrate
```

## License

Add the license of your choice before publishing the repository.
