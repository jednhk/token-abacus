-- Exact nearest-neighbor search instead of HNSW.
--
-- Even over distinct vectors, HNSW missed isolated tasks: a "tip calculator" query did not return
-- the stored calculator task (exact similarity 0.928) and returned bug fixes at ~0.79 instead.
-- New kinds of tasks are exactly the isolated ones, so approximate search fails where it matters.
--
-- At this size an exact scan of task_vectors (one 384-dim vector per distinct task) takes a few
-- milliseconds. Revisit an approximate index (with a much higher ef_search / m) only past
-- ~100k distinct tasks. The search functions' ORDER BY … LIMIT now runs as an exact scan; their
-- hnsw.ef_search setting becomes a no-op.

drop index if exists public.task_vectors_embedding_hnsw;
