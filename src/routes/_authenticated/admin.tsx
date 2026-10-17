import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, LogOut, Send, Trash2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { ScreenHeader } from "@/components/ScreenHeader";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { setRegisteredUserBalance, setRegisteredUserPassword } from "@/lib/admin-user.functions";
import { ChatImageSelection, ChatMessageContent, getChatImagePath, getChatMessagePreview, makeChatImageBody, removeChatImage, uploadChatImage } from "@/components/chat/ChatMessageContent";

type ChatMessage = Database["public"]["Tables"]["messages"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type AdminThread = Conversation & { phone: string; preview: string };
type RegisteredUser = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "phone" | "serial_num" | "created_at" | "display_name"> & { usdt: number; futures_usdt: number };
type ProfitHistory = Database["public"]["Tables"]["profit_history"]["Row"];

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
      { title: "Admin support — Polygon" },
      { name: "description", content: "Manage customer support conversations." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<"chat" | "users">("chat");
  const [threads, setThreads] = useState<AdminThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [profitHistory, setProfitHistory] = useState<ProfitHistory[]>([]);
  const [profitAmounts, setProfitAmounts] = useState<Record<string, string>>({});
  const [profitModes, setProfitModes] = useState<Record<string, "fixed" | "percentage">>({});
  const [profitAccounts, setProfitAccounts] = useState<Record<string, "Spot" | "Futures">>({});
  const [sendingProfitUser, setSendingProfitUser] = useState<string | null>(null);
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [creditingUser, setCreditingUser] = useState<string | null>(null);
  const [setAmounts, setSetAmounts] = useState<Record<string, string>>({});
  const [settingBalanceUser, setSettingBalanceUser] = useState<string | null>(null);
  const [newPasswords, setNewPasswords] = useState<Record<string, string>>({});
  const [passwordConfirmations, setPasswordConfirmations] = useState<Record<string, string>>({});
  const [passwordResettingUser, setPasswordResettingUser] = useState<string | null>(null);
  const [userNotice, setUserNotice] = useState<{ text: string; error: boolean } | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeSectionRef = useRef<"chat" | "users">("chat");
  const endOfMessages = useRef<HTMLDivElement>(null);

  const loadRegisteredUsers = useCallback(async () => {
    const profiles: Database["public"]["Tables"]["profiles"]["Row"][] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error: profilesError } = await supabase
        .from("profiles")
        .select("id, phone, serial_num, created_at, display_name")
        .order("created_at", { ascending: false })
        .range(offset, offset + 499);
      if (profilesError) {
        setUserNotice({ text: "Could not load registered users.", error: true });
        return;
      }
      profiles.push(...(page ?? []));
      if ((page?.length ?? 0) < 500) break;
    }

    const balances: Database["public"]["Tables"]["user_balances"]["Row"][] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error: balancesError } = await supabase
        .from("user_balances")
        .select("user_id, usdt, futures_usdt, updated_at")
        .range(offset, offset + 499);
      if (balancesError) {
        setUserNotice({ text: "Could not load account balances.", error: true });
        return;
      }
      balances.push(...(page ?? []));
      if ((page?.length ?? 0) < 500) break;
    }
    const balanceByUser = new Map(balances.map((balance) => [balance.user_id, balance]));
    setRegisteredUsers(profiles.map(({ id, phone, serial_num, created_at, display_name }) => ({
      id, phone, serial_num, created_at, display_name,
      usdt: balanceByUser.get(id)?.usdt ?? 0,
      futures_usdt: balanceByUser.get(id)?.futures_usdt ?? 0,
    })));
  }, []);

  const loadProfitHistory = useCallback(async () => {
    const { data, error: historyError } = await supabase
      .from("profit_history")
      .select("id, user_id, admin_user_id, account, amount, percentage, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (historyError) {
      setUserNotice({ text: "Could not load profit history.", error: true });
      return;
    }
    setProfitHistory(data ?? []);
  }, []);

  async function sendProfit(user: RegisteredUser) {
    const raw = Number(profitAmounts[user.id]);
    const mode = profitModes[user.id] ?? "fixed";
    const account = profitAccounts[user.id] ?? "Spot";
    const percentage = mode === "percentage" ? raw : null;
    const amount = mode === "fixed" ? raw : null;
    const relevantBalance = account === "Spot" ? user.usdt : user.futures_usdt;
    if (!Number.isFinite(raw) || raw <= 0 || (mode === "fixed" && raw > 1000000000) || (mode === "percentage" && raw > 10000)) {
      setUserNotice({ text: mode === "fixed" ? "Enter a fixed profit from 0 to 1000000000 USDT." : "Enter a percentage greater than 0 and at most 10000%.", error: true });
      return;
    }
    if (mode === "percentage" && relevantBalance <= 0) {
      setUserNotice({ text: `Cannot calculate a percentage profit: this user's ${account} balance is zero.`, error: true });
      return;
    }
    const preview = mode === "percentage" ? relevantBalance * raw / 100 : raw;
    const confirmed = window.confirm(
      `Send ${preview.toLocaleString(undefined, { maximumFractionDigits: 8 })} USDT profit to ${user.display_name || user.phone}'s ${account} balance${percentage === null ? "" : ` (${percentage}%)`}?`,
    );
    if (!confirmed) return;

    setSendingProfitUser(user.id);
    setUserNotice(null);
    try {
      const { data, error: profitError } = await supabase.rpc("admin_send_profit", {
        _user_id: user.id,
        _account: account,
        _amount: amount,
        _percentage: percentage,
      });
      if (profitError) throw new Error(profitError.message || "Profit could not be sent.");
      const result = data as { amount: number; balance: number };
      setRegisteredUsers((users) => users.map((item) => item.id !== user.id ? item : {
        ...item,
        [account === "Spot" ? "usdt" : "futures_usdt"]: result.balance,
      }));
      setProfitAmounts((values) => ({ ...values, [user.id]: "" }));
      setUserNotice({ text: `Added ${Number(result.amount).toLocaleString()} USDT profit to ${user.phone}'s ${account} balance.`, error: false });
      await Promise.all([loadRegisteredUsers(), loadProfitHistory()]);
    } catch (profitError) {
      setUserNotice({ text: profitError instanceof Error ? profitError.message : "Profit could not be sent.", error: true });
    } finally {
      setSendingProfitUser(null);
    }
  }

  async function creditUser(userId: string) {
    const amount = Number(creditAmounts[userId]);
    if (!Number.isFinite(amount) || amount <= 0) {
      setUserNotice({ text: "Enter an amount greater than zero.", error: true });
      return;
    }
    setCreditingUser(userId);
    setUserNotice(null);
    const { data: newBalance, error: creditError } = await supabase.rpc("admin_credit_user", {
      _user_id: userId,
      _amount: amount,
    });
    if (creditError) {
      setUserNotice({ text: creditError.message || "Amount could not be credited.", error: true });
    } else {
      setRegisteredUsers((users) => users.map((user) => user.id === userId ? { ...user, usdt: newBalance } : user));
      setCreditAmounts((amounts) => ({ ...amounts, [userId]: "" }));
      setUserNotice({ text: `Dummy USDT sent. Updated balance: ${newBalance.toLocaleString()} USDT.`, error: false });
    }
    setCreditingUser(null);
  }

  async function setUserBalance(userId: string) {
    const amount = Number(setAmounts[userId]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) {
      setUserNotice({ text: "Enter a balance from 0 to 1000000000 USDT.", error: true });
      return;
    }
    setSettingBalanceUser(userId);
    setUserNotice(null);
    try {
      const newBalance = await setRegisteredUserBalance({ data: { userId, amount } });
      setRegisteredUsers((users) => users.map((user) => user.id === userId ? { ...user, usdt: newBalance } : user));
      setSetAmounts((amounts) => ({ ...amounts, [userId]: "" }));
      setUserNotice({ text: `Balance updated to ${newBalance.toLocaleString()} USDT.`, error: false });
    } catch (balanceError) {
      setUserNotice({
        text: balanceError instanceof Error ? balanceError.message : "Balance could not be updated.",
        error: true,
      });
    }
    setSettingBalanceUser(null);
  }

  async function resetUserPassword(userId: string) {
    const newPassword = newPasswords[userId] ?? "";
    if (newPassword.length < 8 || newPassword.length > 72) {
      setUserNotice({ text: "Password must be between 8 and 72 characters.", error: true });
      return;
    }
    if (newPassword !== (passwordConfirmations[userId] ?? "")) {
      setUserNotice({ text: "Password confirmation does not match.", error: true });
      return;
    }
    setPasswordResettingUser(userId);
    setUserNotice(null);
    try {
      await setRegisteredUserPassword({ data: { userId, newPassword } });
      setNewPasswords((values) => ({ ...values, [userId]: "" }));
      setPasswordConfirmations((values) => ({ ...values, [userId]: "" }));
      setUserNotice({ text: "User password updated successfully.", error: false });
    } catch (resetError) {
      setUserNotice({
        text: resetError instanceof Error ? resetError.message : "Password could not be updated. Please try again.",
        error: true,
      });
    } finally {
      setPasswordResettingUser(null);
    }
  }

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
        previewByConversation.set(message.conversation_id, getChatMessagePreview(message.body));
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
    void loadRegisteredUsers();
    void loadProfitHistory();
    const channel = supabase
      .channel("admin-support-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          const isViewingConversation =
            activeIdRef.current === incoming.conversation_id && activeSectionRef.current === "chat";
          setThreads((current) =>
            current.map((thread) =>
              thread.id === incoming.conversation_id
                ? {
                    ...thread,
                    preview: getChatMessagePreview(incoming.body),
                    last_message_at: incoming.created_at,
                    unread_for_admin:
                      incoming.sender_role === "user" && !isViewingConversation
                        ? thread.unread_for_admin + 1
                        : thread.unread_for_admin,
                  }
                : thread,
            ),
          );

          if (isViewingConversation) {
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
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const deletedId = (payload.old as Partial<ChatMessage>).id;
          if (deletedId) setMessages((current) => current.filter((message) => message.id !== deletedId));
          void loadThreads();
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => {
        void loadRegisteredUsers();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void loadThreads();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadThreads, loadRegisteredUsers, loadProfitHistory]);

  useEffect(() => {
    if (!activeId || activeSection !== "chat") {
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
  }, [activeId, activeSection]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function selectThread(id: string) {
    activeIdRef.current = id;
    setImageFile(null);
    setActiveId(id);
  }

  function showSection(section: "chat" | "users") {
    activeSectionRef.current = section;
    setActiveSection(section);
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !imageFile) || !activeId || sending) return;

    setSending(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Your admin session has expired. Please sign in again.");
      setSending(false);
      return;
    }

    let uploadedPath: string | null = null;
    try {
      if (imageFile) {
        const uploaded = await uploadChatImage(imageFile, activeId);
        uploadedPath = uploaded.path;
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Image upload failed. Please try again.");
      setSending(false);
      return;
    }
    const { error: sendError } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender_id: userData.user.id,
      sender_role: "admin",
      body: uploadedPath ? makeChatImageBody(uploadedPath, body) : body,
    });
    if (sendError) {
      if (uploadedPath) await removeChatImage(uploadedPath);
      setError("Reply could not be sent. Please try again.");
      setSending(false);
      return;
    }

    setDraft("");
    setImageFile(null);
    setSending(false);
  }

  async function deleteMessage(message: ChatMessage) {
    if (!window.confirm("Delete this message for both you and the user?")) return;
    setError(null);
    const { error: deleteError } = await supabase.from("messages").delete().eq("id", message.id);
    if (deleteError) {
      setError("Message could not be deleted. Please try again.");
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
    const imagePath = getChatImagePath(message.body);
    if (imagePath) await removeChatImage(imagePath);
    void loadThreads();
  }

  const activeThread = threads.find((thread) => thread.id === activeId);
  const totalUnread = threads.reduce((count, thread) => count + thread.unread_for_admin, 0);

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-24">
      <ScreenHeader
        title="Admin dashboard"
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

      <nav className="mx-4 mt-4 grid grid-cols-2 rounded-lg bg-secondary p-1" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "chat"}
          onClick={() => showSection("chat")}
          className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors ${activeSection === "chat" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Live Chat
          {totalUnread > 0 && (
            <span className="flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === "users"}
          onClick={() => showSection("users")}
          className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors ${activeSection === "users" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Registered Users
          <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">{registeredUsers.length}</span>
        </button>
      </nav>

      {activeSection === "users" && <section className="surface mx-4 mt-4 overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Registered users</h2>
          <p className="mt-1 text-xs text-muted-foreground">{registeredUsers.length} accounts · dummy USDT balances</p>
        </div>
        {userNotice && (
          <p role="status" className={`border-b border-border px-4 py-2 text-xs ${userNotice.error ? "text-destructive" : "text-up"}`}>
            {userNotice.text}
          </p>
        )}
        {registeredUsers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No registered users found.</p>
        ) : (
          <div className="divide-y divide-border">
            {registeredUsers.map((user) => (
              <div key={user.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.display_name || user.phone}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {user.phone} · Serial: {user.serial_num || "—"} · Joined {new Date(user.created_at).toLocaleString()} · Spot {user.usdt.toLocaleString()} USDT · Futures {user.futures_usdt.toLocaleString()} USDT
                  </p>
                </div>
                <div className="space-y-2">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => { event.preventDefault(); void creditUser(user.id); }}
                >
                  <input
                    type="number"
                    min="0.00000001"
                    max="1000000000"
                    step="any"
                    required
                    value={creditAmounts[user.id] ?? ""}
                    onChange={(event) => setCreditAmounts((amounts) => ({ ...amounts, [user.id]: event.target.value }))}
                    aria-label={`Amount of dummy USDT to send to ${user.phone}`}
                    placeholder="Amount (USDT)"
                    className="w-36 rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={creditingUser === user.id}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {creditingUser === user.id ? "Sending…" : "Send"}
                  </button>
                </form>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => { event.preventDefault(); void setUserBalance(user.id); }}
                >
                  <input
                    type="number"
                    min="0"
                    max="1000000000"
                    step="any"
                    required
                    value={setAmounts[user.id] ?? ""}
                    onChange={(event) => setSetAmounts((amounts) => ({ ...amounts, [user.id]: event.target.value }))}
                    aria-label={`Set exact USDT balance for ${user.phone}`}
                    placeholder="New balance (USDT)"
                    className="w-36 rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={settingBalanceUser === user.id}
                    className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {settingBalanceUser === user.id ? "Saving…" : "Set balance"}
                  </button>
                </form>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(event) => { event.preventDefault(); void sendProfit(user); }}
                >
                  <select
                    value={profitAccounts[user.id] ?? "Spot"}
                    onChange={(event) => setProfitAccounts((values) => ({ ...values, [user.id]: event.target.value as "Spot" | "Futures" }))}
                    aria-label={`Profit account for ${user.phone}`}
                    className="rounded-lg bg-secondary px-2 py-2 text-sm outline-none"
                  >
                    <option value="Spot">Spot</option>
                    <option value="Futures">Futures</option>
                  </select>
                  <select
                    value={profitModes[user.id] ?? "fixed"}
                    onChange={(event) => setProfitModes((values) => ({ ...values, [user.id]: event.target.value as "fixed" | "percentage" }))}
                    aria-label={`Profit type for ${user.phone}`}
                    className="rounded-lg bg-secondary px-2 py-2 text-sm outline-none"
                  >
                    <option value="fixed">Fixed USDT</option>
                    <option value="percentage">Percent</option>
                  </select>
                  <input
                    type="number"
                    min="0.00000001"
                    max={profitModes[user.id] === "percentage" ? 10000 : 1000000000}
                    step="any"
                    required
                    value={profitAmounts[user.id] ?? ""}
                    onChange={(event) => setProfitAmounts((values) => ({ ...values, [user.id]: event.target.value }))}
                    aria-label={`Profit amount or percentage for ${user.phone}`}
                    placeholder={profitModes[user.id] === "percentage" ? "Profit (%)" : "Profit (USDT)"}
                    className="w-32 rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={sendingProfitUser === user.id}
                    className="rounded-lg bg-up px-3 py-2 text-sm font-semibold text-background disabled:opacity-60"
                  >
                    {sendingProfitUser === user.id ? "Sending…" : "Send Profit"}
                  </button>
                </form>
                <form
                  className="grid grid-cols-[1fr_1fr_auto] gap-2"
                  onSubmit={(event) => { event.preventDefault(); void resetUserPassword(user.id); }}
                >
                  <input
                    type="password"
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                    value={newPasswords[user.id] ?? ""}
                    onChange={(event) => setNewPasswords((values) => ({ ...values, [user.id]: event.target.value }))}
                    aria-label={`New password for ${user.phone}`}
                    placeholder="New password"
                    className="min-w-0 rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <input
                    type="password"
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                    value={passwordConfirmations[user.id] ?? ""}
                    onChange={(event) => setPasswordConfirmations((values) => ({ ...values, [user.id]: event.target.value }))}
                    aria-label={`Confirm new password for ${user.phone}`}
                    placeholder="Confirm password"
                    className="min-w-0 rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={passwordResettingUser === user.id}
                    className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {passwordResettingUser === user.id ? "Updating…" : "Set password"}
                  </button>
                </form>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border">
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold">Profit history</h3>
            <p className="mt-1 text-xs text-muted-foreground">Latest {profitHistory.length} profit credits</p>
          </div>
          {profitHistory.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No profit sent yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {profitHistory.map((entry) => {
                const user = registeredUsers.find((item) => item.id === entry.user_id);
                return (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                    <span>{user?.display_name || user?.phone || "Registered user"} · {entry.account}</span>
                    <span className="num text-up">+{Number(entry.amount).toLocaleString()} USDT{entry.percentage === null ? "" : ` · ${Number(entry.percentage)}%`}</span>
                    <time className="text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</time>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>}

      {activeSection === "chat" && <div className="grid gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
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
                    <ChatMessageContent body={message.body} />
                    <time className="mt-1 block text-right text-[10px] opacity-70">
                      {new Date(message.created_at).toLocaleString()}
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
          <form onSubmit={reply} className="mt-3 flex items-end gap-2 border-t border-border pt-3">
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground" aria-label="Attach image">
              <ImagePlus className="size-4" />
              <input type="file" accept="image/*" className="sr-only" disabled={!activeThread || messagesLoading || sending} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
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
              placeholder="Reply to this client…"
              aria-label="Reply to client"
              disabled={!activeThread || messagesLoading || sending}
              className="max-h-32 min-h-11 flex-1 resize-y rounded-lg bg-secondary px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!activeThread || (!draft.trim() && !imageFile) || sending}
              aria-label="Send reply"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </section>
      </div>}

      <BottomNav />
    </div>
  );
}
