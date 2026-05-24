"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/app/lib/auth/AuthContext";
import { PromptBox } from "@/app/components/PromptBox";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  messagesLoaded: boolean;
};

const USAGE_SENTINEL = "__USAGE__";
const DAILY_REQUEST_LIMIT = 1000;
const DAILY_TOKEN_BUDGET = 1_000_000;

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return (n / 1000).toFixed(2) + "K";
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(2) + "M";
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = (Date.now() - then) / 60_000;
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${Math.floor(diffMin)}분 전`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.floor(diffHr)}시간 전`;
  const diffDay = diffHr / 24;
  if (diffDay < 7) return `${Math.floor(diffDay)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

type UsageStats = {
  lastPrompt: number;
  lastOutput: number;
  lastTotal: number;
  sessionTotal: number;
  requestCount: number;
};

const INITIAL_USAGE: UsageStats = {
  lastPrompt: 0,
  lastOutput: 0,
  lastTotal: 0,
  sessionTotal: 0,
  requestCount: 0,
};

type Props = {
  userName: string;
  userEmail: string;
  avatarUrl?: string;
};

export function DashboardShell({ userName, userEmail, avatarUrl }: Props) {
  const { signOut } = useAuth();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [loadingList, setLoadingList] = React.useState(true);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [inputKey, setInputKey] = React.useState(0);
  const [usage, setUsage] = React.useState<UsageStats>(INITIAL_USAGE);

  const active = activeId ? conversations.find((c) => c.id === activeId) ?? null : null;

  // Initial load
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const data = (await res.json()) as {
          conversations: { id: string; title: string; created_at: string }[];
        };
        setConversations(
          data.conversations.map((c) => ({
            id: c.id,
            title: c.title,
            createdAt: c.created_at,
            messages: [],
            messagesLoaded: false,
          })),
        );
      } catch (err) {
        console.error("Failed to load conversations", err);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  // Load messages on switch
  React.useEffect(() => {
    if (!activeId) return;
    const target = conversations.find((c) => c.id === activeId);
    if (!target || target.messagesLoaded) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeId}/messages`);
        if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);
        const data = (await res.json()) as {
          messages: {
            id: string;
            role: "user" | "assistant";
            content: string;
            created_at: string;
          }[];
        };
        if (cancelled) return;
        setConversations((prev) =>
          prev.map((c) =>
            c.id !== activeId
              ? c
              : {
                  ...c,
                  messages: data.messages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                  })),
                  messagesLoaded: true,
                },
          ),
        );
      } catch (err) {
        console.error("Failed to load messages", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, conversations]);

  const createConversation = async (): Promise<Conversation | null> => {
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = (await res.json()) as {
        conversation: { id: string; title: string; created_at: string };
      };
      const fresh: Conversation = {
        id: data.conversation.id,
        title: data.conversation.title,
        createdAt: data.conversation.created_at,
        messages: [],
        messagesLoaded: true,
      };
      setConversations((prev) => [fresh, ...prev]);
      return fresh;
    } catch (err) {
      console.error("Failed to create conversation", err);
      return null;
    }
  };

  const handleNewChat = async () => {
    if (isStreaming) return;
    const fresh = await createConversation();
    if (fresh) setActiveId(fresh.id);
  };

  const handleDelete = async (id: string) => {
    if (isStreaming) return;
    if (!confirm("이 대화를 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (id === activeId) {
          setActiveId(next[0]?.id ?? null);
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to delete conversation", err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const appendChunkToAssistant = (conversationId: string, assistantId: string, chunk: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m,
              ),
            },
      ),
    );
  };

  const finalizeAssistant = (
    conversationId: string,
    assistantId: string,
    patch: Partial<Message>,
  ) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId ? { ...m, ...patch, pending: false } : m,
              ),
            },
      ),
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isStreaming) return;

    const formData = new FormData(e.currentTarget);
    const content = (formData.get("message") as string | null)?.trim();
    if (!content) return;

    // Auto-create conversation if none active
    let conversation: Conversation | null = active;
    if (!conversation) {
      conversation = await createConversation();
      if (!conversation) return;
      setActiveId(conversation.id);
    }
    const conversationId = conversation.id;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const assistantMessage: Message = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      pending: true,
    };

    const previousMessages = conversation.messages;
    const isFirstMessage = previousMessages.length === 0;

    setConversations((prev) =>
      prev.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              title: isFirstMessage ? content.slice(0, 40) : c.title,
              messages: [...c.messages, userMessage, assistantMessage],
            },
      ),
    );

    setInputKey((k) => k + 1);
    setIsStreaming(true);

    try {
      const payload = {
        conversationId,
        messages: [...previousMessages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        let errorMessage = `요청 실패 (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errorMessage = data.error;
        } catch {
          /* ignore */
        }
        finalizeAssistant(conversationId, assistantMessage.id, {
          content: `⚠️ ${errorMessage}`,
          error: true,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const sentinelIdx = buffer.indexOf(USAGE_SENTINEL);
        if (sentinelIdx === -1) {
          if (buffer.length > 0) {
            appendChunkToAssistant(conversationId, assistantMessage.id, buffer);
            buffer = "";
          }
        } else {
          const textBefore = buffer.slice(0, sentinelIdx).replace(/\n$/, "");
          if (textBefore) {
            appendChunkToAssistant(conversationId, assistantMessage.id, textBefore);
          }
          buffer = buffer.slice(sentinelIdx);
        }
      }

      if (buffer.startsWith(USAGE_SENTINEL)) {
        const usageJson = buffer.slice(USAGE_SENTINEL.length).trim();
        try {
          const parsed = JSON.parse(usageJson) as {
            promptTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
          };
          const p = parsed.promptTokens ?? 0;
          const o = parsed.outputTokens ?? 0;
          const t = parsed.totalTokens ?? p + o;
          setUsage((prev) => ({
            lastPrompt: p,
            lastOutput: o,
            lastTotal: t,
            sessionTotal: prev.sessionTotal + t,
            requestCount: prev.requestCount + 1,
          }));
        } catch {
          /* ignore malformed usage trailer */
        }
      } else if (buffer.length > 0) {
        appendChunkToAssistant(conversationId, assistantMessage.id, buffer);
      }

      finalizeAssistant(conversationId, assistantMessage.id, {});
    } catch (err) {
      const message = err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.";
      finalizeAssistant(conversationId, assistantMessage.id, {
        content: `⚠️ ${message}`,
        error: true,
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNewChat={handleNewChat}
        onDelete={handleDelete}
        disabled={isStreaming}
        loading={loadingList}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          userName={userName}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          onSignOut={signOut}
          usage={usage}
        />

        <ChatArea conversation={active} />

        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl px-4 pb-6">
          <PromptBox key={inputKey} name="message" disabled={isStreaming} />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Gemini는 실수할 수 있습니다. 중요한 정보는 다시 확인하세요.
          </p>
        </form>
      </div>
    </div>
  );
}

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  disabled,
  loading,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-[#0f0f0f] md:flex">
      <div className="flex h-14 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">Gemini Wrapper</span>
      </div>

      <div className="space-y-2 px-3">
        <button
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-transparent text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />새 대화
        </button>
        <Link
          href="/dashboard/billing"
          className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <CardIcon className="h-4 w-4" />Billing
        </Link>
      </div>

      <div className="custom-scrollbar mt-4 flex-1 overflow-y-auto px-2">
        <p className="px-2 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
          대화 기록
        </p>

        {loading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">불러오는 중…</p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">아직 대화가 없습니다.</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <ConversationItem
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={() => onSelect(c.id)}
                  onDelete={() => onDelete(c.id)}
                  disabled={disabled}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ConversationItem({
  conversation,
  active,
  onSelect,
  onDelete,
  disabled,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={
        "group flex items-center gap-1 rounded-lg pr-1 transition " +
        (active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="truncate">{conversation.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">
          {formatRelative(conversation.createdAt)}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={disabled}
        aria-label="대화 삭제"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed"
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TopBar({
  userName,
  userEmail,
  avatarUrl,
  onSignOut,
  usage,
}: {
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  onSignOut: () => void;
  usage: UsageStats;
}) {
  const reqPct = Math.min(100, (usage.requestCount / DAILY_REQUEST_LIMIT) * 100);
  const tokPct = Math.min(100, (usage.sessionTotal / DAILY_TOKEN_BUDGET) * 100);
  const barColor =
    reqPct >= 90 || tokPct >= 90
      ? "bg-red-500"
      : reqPct >= 60 || tokPct >= 60
        ? "bg-amber-400"
        : "bg-foreground";

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-border px-4">
      {usage.lastTotal > 0 && (
        <div className="hidden flex-col items-end leading-tight text-right md:flex">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            이번 응답
          </span>
          <span className="text-xs tabular-nums text-foreground/80">
            입력 <span className="font-medium">{usage.lastPrompt.toLocaleString()}</span>
            <span className="text-muted-foreground"> · </span>
            출력 <span className="font-medium">{usage.lastOutput.toLocaleString()}</span>
            <span className="text-muted-foreground"> = </span>
            <span className="font-semibold">{usage.lastTotal.toLocaleString()}</span>
          </span>
        </div>
      )}

      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          오늘 사용량
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-foreground/80">
            <span className="font-medium">{usage.requestCount}</span>
            <span className="text-muted-foreground">/{DAILY_REQUEST_LIMIT} req</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium">{formatTokens(usage.sessionTotal)}</span>
            <span className="text-muted-foreground"> tok</span>
          </span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-accent">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.max(reqPct, tokPct)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-medium">
            {userName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="hidden text-right leading-tight md:block">
          <p className="text-sm font-medium text-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-8 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}

function ChatArea({ conversation }: { conversation: Conversation | null }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const totalChars =
    conversation?.messages.reduce((sum, m) => sum + m.content.length, 0) ?? 0;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [totalChars, conversation?.id]);

  if (!conversation || conversation.messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            무엇을 도와드릴까요?
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            아래 입력창에 메시지를 입력해 대화를 시작하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="custom-scrollbar flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        {conversation.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-3xl bg-accent px-4 py-3 text-sm leading-relaxed text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
        <SparkIcon className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
        {message.pending && message.content.length === 0 ? (
          <TypingDots />
        ) : message.error ? (
          <span className="text-red-400">{message.content}</span>
        ) : (
          <>
            {message.content}
            {message.pending && <BlinkingCursor />}
          </>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40" />
    </span>
  );
}

function BlinkingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-foreground/60" />;
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function SparkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2l1.8 5.6a4 4 0 0 0 2.6 2.6L22 12l-5.6 1.8a4 4 0 0 0-2.6 2.6L12 22l-1.8-5.6a4 4 0 0 0-2.6-2.6L2 12l5.6-1.8a4 4 0 0 0 2.6-2.6L12 2z" />
    </svg>
  );
}
