import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { createPolarClient, planIdFromProductId, PLAN_LABELS } from "@/app/lib/polar";

export const dynamic = "force-dynamic";

type SubscriptionSummary = {
  planLabel: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  amount: number;
  currency: string;
};

async function fetchActiveSubscription(userId: string): Promise<SubscriptionSummary | null> {
  const polar = createPolarClient();

  try {
    const result = await polar.subscriptions.list({
      externalCustomerId: userId,
      active: true,
      limit: 1,
    });

    for await (const page of result) {
      const items = page.result?.items ?? [];
      const sub = items[0];
      if (!sub) return null;

      const planId = planIdFromProductId(sub.productId);
      return {
        planLabel: planId ? PLAN_LABELS[planId] : "Active",
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        amount: sub.amount,
        currency: sub.currency,
      };
    }
  } catch (err) {
    console.error("Failed to fetch Polar subscription", err);
  }

  return null;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatAmount(amountMinor: number, currency: string): string {
  const value = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard/billing");
  }

  const subscription = await fetchActiveSubscription(user.id);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
          Gemini Wrapper
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          대시보드로
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            구독 상태와 결제 정보를 한 곳에서 관리하세요.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            현재 구독
          </h2>

          {subscription ? (
            <ActiveSubscriptionBlock subscription={subscription} />
          ) : (
            <FreePlanBlock />
          )}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ActionCard
            title="플랜 변경"
            description="더 높은 한도로 업그레이드하거나 다른 플랜으로 전환합니다."
          >
            <Link
              href="/pricing"
              className="flex h-11 w-full items-center justify-center rounded-full border border-border bg-transparent text-sm font-medium text-foreground transition hover:bg-accent"
            >
              플랜 보기
            </Link>
          </ActionCard>

          <ActionCard
            title="결제 수단 · 청구서"
            description="카드 변경, 청구서 다운로드, 구독 취소는 고객 포털에서 처리합니다."
          >
            <form action="/api/billing/portal" method="post">
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-black transition hover:bg-white/90"
              >
                고객 포털 열기
              </button>
            </form>
          </ActionCard>
        </div>
      </section>
    </main>
  );
}

function ActiveSubscriptionBlock({ subscription }: { subscription: SubscriptionSummary }) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight">{subscription.planLabel}</span>
        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300">
          {subscription.status}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {subscription.cancelAtPeriodEnd ? "구독 종료일" : "다음 결제일"}
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {formatDate(subscription.currentPeriodEnd)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">청구 금액</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {formatAmount(subscription.amount, subscription.currency)} / 월
          </dd>
        </div>
      </dl>

      {subscription.cancelAtPeriodEnd && (
        <p className="mt-6 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          현재 기간이 끝나면 구독이 자동으로 종료됩니다. 고객 포털에서 다시 활성화할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function FreePlanBlock() {
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight">Free</span>
        <span className="text-xs text-muted-foreground">활성 구독 없음</span>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        유료 플랜으로 업그레이드하면 더 많은 메시지와 우선 응답을 이용할 수 있습니다.
      </p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}
