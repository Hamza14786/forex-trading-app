import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Send, Trash2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ChatImageSelection, ChatMessageContent, getChatImagePath, makeChatImageBody, removeChatImage, uploadChatImage } from "@/components/chat/ChatMessageContent";

type ChatMessage = Database["public"]["Tables"]["messages"]["Row"];

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Live chat — Polygon" },
      { name: "description", content: "Chat with Polygon support." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (active) {
          setError("Please sign in again to use live chat.");
          setLoading(false);
        }
        return;
      }

      const { data: existing, error: lookupError } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (lookupError) {
        if (active) {
          setError("Could not open live chat. Please try again.");
          setLoading(false);
        }
        return;
      }

      let id = existing?.id;
      if (!id) {
        const { data: created, error: createError } = await supabase
          .from("conversations")
          .insert({ user_id: userData.user.id })
          .select("id")
          .single();
        if (createError || !created) {
          if (active) {
            setError("Could not start a chat. Please try again.");
            setLoading(false);
          }
          return;
        }
        id = created.id;
      }

      setConversationId(id);

      const { data: history, error: historyError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (historyError) {
        setError("Could not load chat messages. Please try again.");
        setLoading(false);
        return;
      }

      setMessages((current) => {
        const byId = new Map((history ?? []).map((message) => [message.id, message]));
        for (const message of current) byId.set(message.id, message);
        return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
      setLoading(false);
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", id)
        .eq("sender_role", "admin")
        .is("read_at", null);
      await supabase.from("conversations").update({ unread_for_user: 0 }).eq("id", id);
    }

    void loadConversation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming].sort(
                  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                ),
          );
          if (incoming.sender_role === "admin") {
            void supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", incoming.id)
              .is("read_at", null);
            void supabase.from("conversations").update({ unread_for_user: 0 }).eq("id", conversationId);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const deletedId = (payload.old as Partial<ChatMessage>).id;
          if (deletedId) setMessages((current) => current.filter((message) => message.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !imageFile) || !conversationId || sending) return;

    setSending(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Please sign in again to send a message.");
      setSending(false);
      return;
    }

    let uploadedPath: string | null = null;
    try {
      if (imageFile) {
        const uploaded = await uploadChatImage(imageFile, conversationId);
        uploadedPath = uploaded.path;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed. Please try again.");
      setSending(false);
      return;
    }
    const { error: sendError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: userData.user.id,
      sender_role: "user",
      body: uploadedPath ? makeChatImageBody(uploadedPath, body) : body,
    });
    if (sendError) {
      if (uploadedPath) await removeChatImage(uploadedPath);
      setError("Your message could not be sent. Please try again.");
      setSending(false);
      return;
    }

    setDraft("");
    setImageFile(null);
    setSending(false);
  }

  async function deleteMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message for both you and the admin?")) return;
    setError(null);
    const { error: deleteError } = await supabase.from("messages").delete().eq("id", message.id);
    if (deleteError) {
      setError("Message could not be deleted. Please try again.");
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
    const imagePath = getChatImagePath(message.body);
    if (imagePath) await removeChatImage(imagePath);
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader title="Live chat" back="/" />

      <section className="surface mx-4 mt-4 flex min-h-[65vh] flex-col p-4">
        <div className="mb-4 border-b border-border pb-3">
          <h2 className="text-sm font-semibold">Polygon Support</h2>
          <p className="mt-1 text-xs text-muted-foreground">Send us a message and our team will reply here.</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto py-2" aria-live="polite">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Opening your chat…</p>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Start a conversation with our support team.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender_role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 ${
                    message.sender_role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <ChatMessageContent body={message.body} />
                  <time className="mt-1 block text-right text-[10px] opacity-70">
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  <button type="button" onClick={() => void deleteMessage(message)} aria-label="Delete message for both participants" title="Delete for both" className="mt-1 flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100">
                    <Trash2 className="size-3" /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
          <div ref={endOfMessages} />
        </div>

        {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}

        {imageFile && (
          <ChatImageSelection file={imageFile} onRemove={() => setImageFile(null)} />
        )}
        <form onSubmit={sendMessage} className="mt-3 flex items-end gap-2 border-t border-border pt-3">
          <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground" aria-label="Attach image">
            <ImagePlus className="size-4" />
            <input type="file" accept="image/*" className="sr-only" disabled={loading || !conversationId || sending} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
          </label>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Write a message…"
            aria-label="Message"
            disabled={loading || !conversationId || sending}
            className="max-h-32 min-h-11 flex-1 resize-y rounded-lg bg-secondary px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !conversationId || (!draft.trim() && !imageFile) || sending}
            aria-label="Send message"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
      </section>

      <BottomNav />
    </div>
  );
}
