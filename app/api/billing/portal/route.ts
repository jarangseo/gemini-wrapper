import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createPolarClient } from "@/app/lib/polar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const polar = createPolarClient();

  try {
    const session = await polar.customerSessions.create({
      externalCustomerId: user.id,
      returnUrl: `${origin}/dashboard/billing`,
    });
    return NextResponse.redirect(session.customerPortalUrl, { status: 303 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Polar portal session failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
