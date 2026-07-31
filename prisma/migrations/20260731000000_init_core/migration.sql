CREATE TYPE "SessionType" AS ENUM ('CHAT', 'AIOPS');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'INDEXING', 'READY', 'FAILED');

CREATE TABLE "chat_sessions" (
    "id" VARCHAR(128) NOT NULL,
    "type" "SessionType" NOT NULL DEFAULT 'CHAT',
    "title" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" VARCHAR(128) NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" VARCHAR(255) NOT NULL,
    "file_path" TEXT NOT NULL,
    "extension" VARCHAR(16) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "content_hash" CHAR(64),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "indexed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_sessions_updated_at_idx" ON "chat_sessions"("updated_at");
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");
CREATE UNIQUE INDEX "knowledge_documents_file_path_key" ON "knowledge_documents"("file_path");
CREATE INDEX "knowledge_documents_status_idx" ON "knowledge_documents"("status");

ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_messages_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
