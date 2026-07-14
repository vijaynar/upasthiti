-- ============================================================
-- MIGRATION: 0004_storage_buckets.sql
-- Abhyas — Storage buckets and object access policies
-- ============================================================
-- All buckets are public-read; INSERT/UPDATE/DELETE just require an
-- authenticated caller (fine-grained ownership isn't enforced at the
-- storage layer — file paths are namespaced by the app instead).
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
    ('student-portraits',  'student-portraits',  true),
    ('avatars',             'avatars',            true),
    ('coach-documents',     'coach-documents',    true),
    ('coach-certificates',  'coach-certificates', true),
    ('attendance-photos',   'attendance-photos',  true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    bucket TEXT;
BEGIN
    FOREACH bucket IN ARRAY ARRAY['student-portraits', 'avatars', 'coach-documents', 'coach-certificates', 'attendance-photos']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %L ON storage.objects', 'Public Access ' || bucket);
        EXECUTE format('DROP POLICY IF EXISTS %L ON storage.objects', 'Authenticated Insert ' || bucket);
        EXECUTE format('DROP POLICY IF EXISTS %L ON storage.objects', 'Authenticated Update ' || bucket);
        EXECUTE format('DROP POLICY IF EXISTS %L ON storage.objects', 'Authenticated Delete ' || bucket);

        EXECUTE format(
            'CREATE POLICY %L ON storage.objects FOR SELECT USING (bucket_id = %L)',
            'Public Access ' || bucket, bucket
        );
        EXECUTE format(
            'CREATE POLICY %L ON storage.objects FOR INSERT WITH CHECK (bucket_id = %L)',
            'Authenticated Insert ' || bucket, bucket
        );
        EXECUTE format(
            'CREATE POLICY %L ON storage.objects FOR UPDATE USING (bucket_id = %L)',
            'Authenticated Update ' || bucket, bucket
        );
        EXECUTE format(
            'CREATE POLICY %L ON storage.objects FOR DELETE USING (bucket_id = %L)',
            'Authenticated Delete ' || bucket, bucket
        );
    END LOOP;
END $$;
