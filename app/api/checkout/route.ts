import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createPolarClient, PLAN_PRODUCT_IDS, type PolarPlanId } from "@/app/lib/polar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPlanId(value: string | null): value is PolarPlanId {
  return value === "pro" || value === "unlimited";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const plan = form.get("plan");
  const planId = typeof plan === "string" ? plan : null;

  if (!isPlanId(planId)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const productId = PLAN_PRODUCT_IDS[planId];
  if (!productId) {
    return NextResponse.json(
      { error: `Product ID for plan "${planId}" is not configured` },
      { status: 500 },
    );
  }

  const origin = new URL(request.url).origin;
  const polar = createPolarClient();

  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${origin}/pricing/success?checkout_id={CHECKOUT_ID}`,
      customerEmail: user.email ?? undefined,
      externalCustomerId: user.id,
      metadata: { plan: planId, userId: user.id },
    });
    return NextResponse.redirect(checkout.url, { status: 303 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Polar checkout failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
