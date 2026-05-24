import Link from "next/link";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout_id?: string }>;
}) {
  const { checkout_id } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
          <CheckIcon className="h-7 w-7 text-emerald-300" />
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">결제가 완료되었습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          업그레이드해 주셔서 감사합니다. 이제 새로운 한도로 바로 사용하실 수 있어요.
        </p>

        {checkout_id && (
          <p className="mt-4 break-all rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            주문 ID: {checkout_id}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="flex h-11 items-center justify-center rounded-full bg-white text-sm font-medium text-black transition hover:bg-white/90"
          >
            대시보드로 이동
          </Link>
          <Link
            href="/pricing"
            className="flex h-11 items-center justify-center rounded-full border border-border text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            플랜 다시 보기
          </Link>
        </div>
      </div>
    </main>
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
