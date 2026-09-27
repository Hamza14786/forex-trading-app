import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const IMAGE_PREFIX = "[[chat-image:";
const BUCKET = "chat-images";

export function getChatImagePath(body: string) {
  if (!body.startsWith(IMAGE_PREFIX)) return null;
  const markerEnd = body.indexOf("]]", IMAGE_PREFIX.length);
  if (markerEnd < 0) return null;
  return body.slice(IMAGE_PREFIX.length, markerEnd);
}

export function makeChatImageBody(path: string, caption: string) {
  return `${IMAGE_PREFIX}${path}]]${caption ? `\n${caption}` : ""}`;
}

export function getChatMessagePreview(body: string) {
  const path = getChatImagePath(body);
  if (!path) return body;
  const caption = body.slice(body.indexOf("]]", IMAGE_PREFIX.length) + 2).trim();
  return caption ? `📷 ${caption}` : "📷 Image";
}

export function ChatMessageContent({ body }: { body: string }) {
  const path = getChatImagePath(body);
  const caption = path ? body.slice(body.indexOf("]]", IMAGE_PREFIX.length) + 2).trim() : body;
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    void supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (active) setImageUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path]);

  if (!path) return <p className="whitespace-pre-wrap break-words text-sm">{body}</p>;
  return (
    <div className="space-y-2">
      {imageUrl ? (
        <img src={imageUrl} alt="Image shared in chat" className="max-h-72 max-w-full rounded-lg object-contain" />
      ) : (
        <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-background/40 px-3 text-center text-xs opacity-70">Image unavailable. Check chat image storage setup.</div>
      )}
      {caption && <p className="whitespace-pre-wrap break-words text-sm">{caption}</p>}
    </div>
  );
}

export function ChatImageSelection({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg bg-secondary p-2">
      {previewUrl && <img src={previewUrl} alt="Selected image preview" className="size-12 rounded object-cover" />}
      <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
      <button type="button" onClick={onRemove} aria-label="Remove selected image" className="rounded p-1 hover:bg-background"><span aria-hidden="true">×</span></button>
    </div>
  );
}

export async function uploadChatImage(file: File, conversationId: string) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be 8 MB or smaller.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Please sign in again to send an image.");
  const extension = (file.name.split(".").pop() || file.type.split("/")[1] || "img")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "img";
  const path = `${conversationId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    if (error.message.toLowerCase().includes("bucket not found")) {
      throw new Error("Chat image storage bucket is missing. Apply migration 0004 in Supabase SQL Editor.");
    }
    if (error.message.toLowerCase().includes("row-level security") || error.message.includes("403")) {
      throw new Error("Chat image access is not configured yet. Apply migration 0004 in Supabase SQL Editor.");
    }
    throw new Error(error.message || "Image upload failed.");
  }
  return { path, userId: userData.user.id };
}

export async function removeChatImage(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}
