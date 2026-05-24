import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { DashboardShell } from "./DashboardShell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "사용자";
  const userEmail = user.email ?? "";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <DashboardShell
      userName={userName}
      userEmail={userEmail}
      avatarUrl={avatarUrl}
    />
  );
}
