-- Permit both participants (the conversation owner and an admin) to delete messages.
GRANT DELETE ON TABLE public.messages TO authenticated;

DROP POLICY IF EXISTS "message delete" ON public.messages;
CREATE POLICY "message delete" ON public.messages
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.conversations AS c
    WHERE c.id = conversation_id
      AND c.user_id = auth.uid()
  )
);

-- Accept image formats beyond the original four while still rejecting non-image uploads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', false, 8388608, NULL)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = NULL;

DROP POLICY IF EXISTS "chat images read" ON storage.objects;
CREATE POLICY "chat images read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "chat images upload" ON storage.objects;
CREATE POLICY "chat images upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND COALESCE(metadata->>'mimetype', '') LIKE 'image/%'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "chat images delete" ON storage.objects;
CREATE POLICY "chat images delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.conversations AS c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.user_id = auth.uid()
    )
  )
);
