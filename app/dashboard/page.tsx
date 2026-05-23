import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { LogoutButton } from './LogoutButton';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    'there';
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-white/10" />
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50">
              Signed in as
            </p>
            <p className="text-base font-medium text-white">{name}</p>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold text-white">
          Welcome back.
        </h1>
        <p className="mt-2 text-sm text-white/60">
          You&apos;re authenticated. This is your protected dashboard.
        </p>

        <div className="mt-8">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
