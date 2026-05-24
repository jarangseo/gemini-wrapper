import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";

type PlanId = "free" | "pro" | "unlimited";

type Plan = {
  id: PlanId;
  name: string;
  priceLabel: string;
  priceSuffix: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    priceSuffix: "",
    tagline: "가볍게 시작하기",
    features: ["월 10회 메시지", "Gemini Flash 모델", "기본 채팅 기록"],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$9.99",
    priceSuffix: "/월",
    tagline: "일상적인 사용에 충분한 한도",
    features: ["월 100회 메시지", "Gemini Flash 모델", "채팅 기록 무제한 보관", "우선 응답"],
    highlighted: true,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    priceLabel: "$29.99",
    priceSuffix: "/월",
    tagline: "마음껏 쓰는 무제한 플랜",
    features: ["무제한 메시지", "Gemini Flash 모델", "채팅 기록 무제한 보관", "우선 응답"],
  },
];

const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, unlimited: 2 };

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentPlan = (user?.user_metadata?.plan as PlanId | undefined) ?? "free";
  const currentRank = PLAN_RANK[currentPlan] ?? 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Gemini Wrapper
        </Link>
        <nav className="flex items-center gap-3 text-sm text-muted-foreground">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-full border border-border px-4 py-1.5 transition hover:bg-accent hover:text-foreground"
            >
              대시보드
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-border px-4 py-1.5 transition hover:bg-accent hover:text-foreground"
            >
              로그인
            </Link>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <div className="text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            플랜을 선택하세요
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            취소나 변경은 언제든 가능합니다. 결제는 Polar로 안전하게 처리됩니다.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isUpgrade = PLAN_RANK[plan.id] > currentRank;
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={isCurrent}
                isUpgrade={isUpgrade}
                isAuthed={Boolean(user)}
              />
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          모든 가격은 USD 기준입니다. 부가세는 결제 시점에 별도 적용될 수 있습니다.
        </p>
      </section>
    </main>
  );
}

function PlanCard({
  plan,
  isCurrent,
  isUpgrade,
  isAuthed,
}: {
  plan: Plan;
  isCurrent: boolean;
  isUpgrade: boolean;
  isAuthed: boolean;
}) {
  const highlight = plan.highlighted;

  return (
    <div
      className={
        "relative flex flex-col rounded-2xl border p-6 transition " +
        (highlight
          ? "border-white/30 bg-gradient-to-b from-white/[0.07] to-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_20px_60px_-30px_rgba(255,255,255,0.25)]"
          : "border-border bg-card")
      }
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-black">
          추천
        </span>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{plan.name}</h2>
        {isCurrent && (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300">
            현재 플랜
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight">{plan.priceLabel}</span>
        {plan.priceSuffix && (
          <span className="text-sm text-muted-foreground">{plan.priceSuffix}</span>
        )}
      </div>

      <ul className="mt-6 space-y-3 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckIcon
              className={
                "mt-0.5 h-4 w-4 shrink-0 " + (highlight ? "text-white" : "text-emerald-400")
              }
            />
            <span className="text-foreground/90">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 pt-2">
        <PlanCTA plan={plan} isCurrent={isCurrent} isUpgrade={isUpgrade} isAuthed={isAuthed} />
      </div>
    </div>
  );
}

function PlanCTA({
  plan,
  isCurrent,
  isUpgrade,
  isAuthed,
}: {
  plan: Plan;
  isCurrent: boolean;
  isUpgrade: boolean;
  isAuthed: boolean;
}) {
  if (isCurrent) {
    return (
      <button
        type="button"
        disabled
        className="h-11 w-full rounded-full border border-border bg-transparent text-sm font-medium text-muted-foreground"
      >
        현재 이용 중
      </button>
    );
  }

  if (plan.id === "free") {
    return (
      <Link
        href={isAuthed ? "/dashboard" : "/login"}
        className="flex h-11 w-full items-center justify-center rounded-full border border-border bg-transparent text-sm font-medium text-foreground transition hover:bg-accent"
      >
        {isAuthed ? "대시보드로 이동" : "시작하기"}
      </Link>
    );
  }

  if (!isAuthed) {
    return (
      <Link
        href="/login"
        className="flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-black transition hover:bg-white/90"
      >
        로그인 후 결제
      </Link>
    );
  }

  if (!isUpgrade) {
    return (
      <button
        type="button"
        disabled
        className="h-11 w-full rounded-full border border-border bg-transparent text-sm font-medium text-muted-foreground"
      >
        하위 플랜
      </button>
    );
  }

  const buttonClass = plan.highlighted
    ? "bg-white text-black hover:bg-white/90"
    : "border border-border bg-transparent text-foreground hover:bg-accent";

  return (
    <form action="/api/checkout" method="post">
      <input type="hidden" name="plan" value={plan.id} />
      <button
        type="submit"
        className={`flex h-11 w-full items-center justify-center rounded-full text-sm font-medium transition ${buttonClass}`}
      >
        업그레이드
      </button>
    </form>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
