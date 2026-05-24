import { createClient } from "@/app/lib/supabase/server";
import type { ConversationRow } from "@/app/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id, user_id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ conversations: (data ?? []) as ConversationRow[] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title = "새 대화";
  try {
    const body = (await request.json()) as { title?: string };
    if (typeof body?.title === "string" && body.title.trim().length > 0) {
      title = body.title.trim().slice(0, 80);
    }
  } catch {
    /* empty body is fine */
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, title })
    .select("id, user_id, title, created_at")
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "Failed to create conversation" },
      { status: 500 },
    );
  }

  return Response.json({ conversation: data as ConversationRow }, { status: 201 });
}
