-- ============================================================
-- MIGRATION: 0002_face_matching_rpc.sql
-- Abhyas — pgvector Cosine Similarity Face Matching RPC
-- ============================================================
-- This function is called by the Next.js API route:
--   POST /api/v1/attendance/match-face
--
-- It accepts a 128-float embedding vector computed client-side
-- (by face-api.js on web, or TensorFlow.js on mobile),
-- and returns the best-matching student within the tenant.
--
-- SECURITY DEFINER: runs as the function owner (postgres) so it
-- can bypass RLS for the vector scan, but the calling API layer
-- enforces tenant isolation via the p_tenant_id parameter.
-- ============================================================

CREATE OR REPLACE FUNCTION match_face_embedding(
    p_tenant_id     UUID,          -- calling tenant (enforced by API middleware)
    input_embedding vector(128),   -- 128-float array from client-side model
    match_threshold FLOAT,         -- minimum similarity score (e.g. 0.65)
    match_count     INT            -- max results to return (usually 1)
)
RETURNS TABLE (
    student_id      UUID,
    similarity      FLOAT,
    student_name    TEXT,
    batch_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id                                                        AS student_id,
        (1 - (sfs.embedding <=> input_embedding))::FLOAT            AS similarity,
        (u.first_name || ' ' || u.last_name)                        AS student_name,
        s.batch_id
    FROM student_face_samples sfs
    JOIN students s  ON s.id = sfs.student_id
    JOIN users    u  ON u.id = s.id
    WHERE
        sfs.tenant_id = p_tenant_id                                 -- tenant isolation
        AND s.status  = 'active'                                    -- only active students
        AND (1 - (sfs.embedding <=> input_embedding)) > match_threshold
    ORDER BY sfs.embedding <=> input_embedding ASC                  -- closest first
    LIMIT match_count;
END;
$$;

-- Grant execute permission to the authenticated role
-- (service role key bypasses this, but anon/authenticated role respects it)
GRANT EXECUTE ON FUNCTION match_face_embedding(UUID, vector, FLOAT, INT)
    TO authenticated;
