<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tech stack

- **Framework**: Next.js 16.2.6 (App Router, Turbopack)
- **Runtime**: React 19.2.4, TypeScript 5
- **Styling**: Tailwind CSS v4 (config in `app/globals.css`, dark theme by default)
- **Auth + DB**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Billing**: Polar (`@polar-sh/sdk`)
- **LLM**: Google Gemini (`@google/genai`, streaming)

# Commands

- `npm run dev` — start dev server (Turbopack, port 3000)
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check without emitting

Always run `npx tsc --noEmit` and `npm run lint` before claiming work is done.

# Project conventions

- **Path alias**: `@/` resolves to the project root (see `tsconfig.json`). Use `@/app/lib/...` over relative paths that go up two or more levels.
- **UI language**: User-facing copy is in **Korean**. Match the existing tone (polite, concise).
- **Dark theme**: CSS variables in `app/globals.css` (`--background`, `--foreground`, `--card`, etc.). Reference them via `bg-background`, `text-muted-foreground`, etc. Do not hardcode hex colors when a token exists.
- **Middleware lives at the root as `proxy.ts`** — not `middleware.ts`. This is a Next.js 16 rename. Protected routes are listed in `PROTECTED_PREFIXES`.
- **Server components by default**; add `"use client"` only when you need state, effects, or browser APIs.
- **Directory layout**:
  - `app/<route>/page.tsx` — pages
  - `app/api/<route>/route.ts` — route handlers
  - `app/lib/` — shared server/client logic (auth, supabase, polar, etc.)
  - `app/components/` — shared UI components
- **Route handlers** that hit user-scoped data should set `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.

# Supabase rules

- **Two clients, do not mix them up**:
  - `app/lib/supabase/server.ts` → `createClient()` for server components, route handlers, and `proxy.ts`. Reads/writes cookies via `next/headers`.
  - `app/lib/supabase/client.ts` → `createClient()` for client components only. Uses `createBrowserClient`.
- **Auth state in client components** flows through `AuthContext` (`app/lib/auth/AuthContext.tsx`). The root layout seeds it with the server-side `user`/`session` so the first render isn't blank.
- **RLS is assumed to be on**. Write queries as the authenticated user; do not bypass RLS by reaching for service-role keys in the app layer.
- **Never expose the `service_role` key.** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe to prefix with `NEXT_PUBLIC_`. Anything else (Google API key, Polar token, service-role key) stays server-only.
- **Always call `supabase.auth.getUser()`** (not `getSession()`) before trusting a user identity on the server — `getUser()` re-verifies the JWT.

# Polar billing rules

- **SDK client**: Create via `createPolarClient()` in `app/lib/polar.ts`. Do not instantiate `new Polar()` ad-hoc.
- **Environment**:
  - `POLAR_ACCESS_TOKEN` — organization access token (server-only)
  - `POLAR_SERVER` — `production` or `sandbox` (controls which API endpoint the SDK hits)
  - `POLAR_PRODUCT_ID_PRO`, `POLAR_PRODUCT_ID_UNLIMITED` — product UUIDs, must match the chosen `POLAR_SERVER` environment
  - `POLAR_WEBHOOK_SECRET` — used by webhook verifier (`@polar-sh/sdk/webhooks`)
- **Customer mapping**: When creating checkouts or customer sessions, always pass `externalCustomerId: user.id` (Supabase user UUID). This is the join key between Supabase and Polar.
- **Plan → product mapping**: Use the `PLAN_PRODUCT_IDS` and `planIdFromProductId()` helpers in `app/lib/polar.ts`. Do not hardcode product IDs in route handlers or pages.
- **Routes already wired**:
  - `POST /api/checkout` — starts a checkout session, 303-redirects to Polar
  - `POST /api/billing/portal` — opens the Polar Customer Portal
- **Pages**: `/pricing`, `/pricing/success`, `/dashboard/billing`
- **Success URL template**: Polar substitutes `{CHECKOUT_ID}` in the `successUrl` — keep the placeholder literal when building URLs.
