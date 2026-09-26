import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LogOut, Send } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ChatMessage = Database["public"]["Tables"]["messages"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type AdminThread = Conversation & { phone: string; preview: string };

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) throw redirect({ to: "/admin/login" });

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: data.user.id,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw redirect({ to: "/admin/login" });
  },
  head: () => ({
    meta: [
      { title: "Admin support — Polyygony" },
      { name: "description", content: "Manage customer support conversations." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<AdminThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);

  async function logout() {
    const { error: logoutError } = await supabase.auth.signOut();
    if (logoutError) {
      setError("Could not log out. Please try again.");
      return;
    }
    await navigate({ to: "/admin/login", replace: true });
  }

  const loadThreads = useCallback(async () => {
    const { data: conversations, error: conversationError } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (conversationError) {
      setError("Could not load support conversations.");
      setLoading(false);
      return;
    }

    const rows = conversations ?? [];
    if (!rows.length) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const ids = rows.map((row) => row.id);
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const [{ data: profiles }, { data: recentMessages }] = await Promise.all([
      supabase.from("profiles").select("id, phone").in("id", userIds),
      supabase
        .from("messages")
        .select("conversation_id, body, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(Math.max(ids.length * 10, 100)),
    ]);

    const phoneByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile.phone]));
    const previewByConversation = new Map<string, string>();
    for (const message of recentMessages ?? []) {
      if (!previewByConversation.has(message.conversation_id)) {
        previewByConversation.set(message.conversation_id, message.body);
      }
    }

    const nextThreads = rows.map((row) => ({
      ...row,
      phone: phoneByUser.get(row.user_id) ?? "Client",
      preview: previewByConversation.get(row.id) ?? "No messages yet",
    }));
    setThreads(nextThreads);
    setLoading(false);
    if (!activeIdRef.current && nextThreads[0]) {
      activeIdRef.current = nextThreads[0].id;
      setActiveId(nextThreads[0].id);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const channel = supabase
      .channel("admin-support-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setThreads((current) =>
            current.map((thread) =>
              thread.id === incoming.conversation_id
                ? {
                    ...thread,
                    preview: incoming.body,
                    last_message_at: incoming.created_at,
                    unread_for_admin:
                      incoming.sender_role === "user" && activeIdRef.current !== thread.id
                        ? thread.unread_for_admin + 1
                        : thread.unread_for_admin,
                  }
                : thread,
            ),
          );

          if (activeIdRef.current === incoming.conversation_id) {
            setMessages((current) =>
              current.some((message) => message.id === incoming.id)
                ? current
                : [...current, incoming].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                  ),
            );
            if (incoming.sender_role === "user") {
              void supabase
                .from("messages")
                .update({ read_at: new Date().toISOString() })
                .eq("id", incoming.id)
                .is("read_at", null);
              void supabase
                .from("conversations")
                .update({ unread_for_admin: 0 })
                .eq("id", incoming.conversation_id);
            }
          }
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void loadThreads();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadThreads]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    let active = true;
    setMessagesLoading(true);
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true })
      .then(async ({ data, error: messageError }) => {
        if (!active) return;
        if (messageError) {
          setError("Could not load this conversation.");
        } else {
          setMessages(data ?? []);
          setError(null);
          await supabase
            .from("messages")
            .update({ read_at: new Date().toISOString() })
            .eq("conversation_id", activeId)
            .eq("sender_role", "user")
            .is("read_at", null);
          await supabase.from("conversations").update({ unread_for_admin: 0 }).eq("id", activeId);
          setThreads((current) =>
            current.map((thread) =>
              thread.id === activeId ? { ...thread, unread_for_admin: 0 } : thread,
            ),
          );
        }
        setMessagesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeId]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectThread(id: string) {
    activeIdRef.current = id;
    setActiveId(id);
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;

    setSending(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Your admin session has expired. Please sign in again.");
      setSending(false);
      return;
    }

    const { error: sendError } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender_id: userData.user.id,
      sender_role: "admin",
      body,
    });
    if (sendError) {
      setError("Reply could not be sent. Please try again.");
      setSending(false);
      return;
    }

    setDraft("");
    setSending(false);
  }

  const activeThread = threads.find((thread) => thread.id === activeId);

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader
        title="Admin support"
        back="/"
        right={
          <button
            type="button"
            onClick={logout}
            aria-label="Log out of admin"
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
            <span>Logout</span>
          </button>
        }
      />

      <div className="grid gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="surface flex min-h-[65vh] flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Client conversations</h2>
            <p className="mt-1 text-xs text-muted-foreground">{threads.length} total</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading conversations…</p>
            ) : threads.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No client messages yet.</p>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  className={"w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated " + (thread.id === activeId ? "bg-elevated" : "")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{thread.phone}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{thread.preview}</span>
                    {thread.unread_for_admin > 0 && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {thread.unread_for_admin > 9 ? "9+" : thread.unread_for_admin}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="surface flex min-h-[65vh] flex-col p-4">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-semibold">{activeThread?.phone ?? "Conversation"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeThread ? "Live client support chat" : "Select a client conversation to view messages."}
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite">
            {messagesLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
            ) : !activeThread ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No conversation selected.</p>
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={"flex " + (message.sender_role === "admin" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={
                      "max-w-[85%] rounded-xl px-3 py-2 " +
                      (message.sender_role === "admin"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground")
                    }
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <time className="mt-1 block text-right text-[10px] opacity-70">
                      {new Date(message.created_at).toLocaleString()}
                    </time>
                  </div>
                </div>
              ))
            )}
            <div ref={endOfMessages} />
          </div>

          {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}

          <form onSubmit={reply} className="mt-3 flex items-end gap-2 border-t border-border pt-3">
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
              placeholder="Reply to this client…"
              aria-label="Reply to client"
              disabled={!activeThread || messagesLoading || sending}
              className="max-h-32 min-h-11 flex-1 resize-y rounded-lg bg-secondary px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!activeThread || !draft.trim() || sending}
              aria-label="Send reply"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
