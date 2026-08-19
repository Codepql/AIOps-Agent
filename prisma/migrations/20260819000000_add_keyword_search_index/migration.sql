-- PostgreSQL full-text search index used alongside pgvector for hybrid retrieval.
CREATE INDEX "knowledge_chunks_content_fts_idx"
ON "knowledge_chunks"
USING GIN (to_tsvector('simple', "content"));
