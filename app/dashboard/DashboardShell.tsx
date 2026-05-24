"use client";

import * as React from "react";
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
  updatedAt: string;
  messages: Message[];
};

const SEED_CONVERSATIONS: Conversation[] = [
  { id: "c1", title: "새 대화", updatedAt: "방금", messages: [] },
];

const USAGE_SENTINEL = "__USAGE__";

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
  const [conversations, setConversations] = React.useState<Conversation[]>(SEED_CONVERSATIONS);
  const [activeId, setActiveId] = React.useState<string>(SEED_CONVERSATIONS[0].id);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [inputKey, setInputKey] = React.useState(0);
  const [usage, setUsage] = React.useState<UsageStats>(INITIAL_USAGE);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  const handleNewChat = () => {
    if (isStreaming) return;
    const id = `c-${Date.now()}`;
    const fresh: Conversation = {
      id,
      title: "새 대화",
      updatedAt: "방금",
      messages: [],
    };
    setConversations((prev) => [fresh, ...prev]);
    setActiveId(id);
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

    const conversationId = activeId;
    const previousMessages = active.messages;
    const isFirstMessage = previousMessages.length === 0;

    setConversations((prev) =>
      prev.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              title: isFirstMessage ? content.slice(0, 40) : c.title,
              updatedAt: "방금",
              messages: [...c.messages, userMessage, assistantMessage],
            },
      ),
    );

    setInputKey((k) => k + 1);
    setIsStreaming(true);

    try {
      const payload = {
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
          /* ignore json parse error */
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
        disabled={isStreaming}
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
  disabled,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  disabled?: boolean;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-[#0f0f0f] md:flex">
      <div className="flex h-14 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">Gemini Wrapper</span>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNewChat}
          disabled={disabled}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-transparent text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />새 대화
        </button>
      </div>

      <div className="custom-scrollbar mt-4 flex-1 overflow-y-auto px-2">
        <p className="px-2 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
          대화 기록
        </p>
        <ul className="space-y-0.5">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition " +
                  (c.id === activeId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
                }
              >
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground/70">
                  {c.updatedAt}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

const DAILY_REQUEST_LIMIT = 1000;
const DAILY_TOKEN_BUDGET = 1_000_000;

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

function ChatArea({ conversation }: { conversation: Conversation }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const totalChars = conversation.messages.reduce((sum, m) => sum + m.content.length, 0);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [totalChars]);

  if (conversation.messages.length === 0) {
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

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10_000) return (n / 1000).toFixed(2) + "K";
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(2) + "M";
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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
