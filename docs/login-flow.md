# 로그인 흐름 

이 문서는 Gemini Wrapper의 Google 로그인이 어떻게 동작하는지 처음 보는 사람도 따라갈 수 있게 풀어 쓴 글입니다.

## 1. 등장인물

| 누구 | 무슨 일을 함 |
|---|---|
| **브라우저(사용자)** | 로그인 버튼 누르고, 결과 쿠키를 들고 다님 |
| **Next.js 앱** | 로그인 UI와 콜백 처리 |
| **Supabase** | 우리 백엔드 대신 인증을 처리해주는 서비스 |
| **Google** | 실제로 "이 사람이 맞다"를 인증해주는 신원 제공자 |

핵심 개념: **우리는 Google이랑 직접 얘기하지 않습니다.** Supabase가 중간에서 다 처리해주고, 우리는 Supabase하고만 얘기합니다.

## 2. 전체 흐름 한눈에 보기

```
[1] 사용자가 /login 페이지에서 "Continue with Google" 클릭
[2] Supabase가 사용자를 Google 로그인 화면으로 보냄
[3] 사용자가 Google에서 동의 → Google이 Supabase로 돌려보냄
[4] Supabase가 우리 앱의 /auth/callback으로 보냄 (code 라는 임시 키 들고)
[5] /auth/callback이 그 code를 진짜 세션(쿠키)으로 바꿈
[6] 사용자를 /dashboard로 리다이렉트, 끝
```

## 3. 코드로 따라가기

### 3-1. 로그인 페이지 (`app/login/page.tsx`)

```tsx
const { signInWithGoogle } = useAuth();
// ...
<button onClick={signInWithGoogle}>Continue with Google</button>
```

버튼을 누르면 `signInWithGoogle()`이 호출됩니다.

### 3-2. `signInWithGoogle()` (`app/lib/auth/AuthContext.tsx`)

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` },
});
```

Supabase한테 "구글 로그인 시켜줘, 끝나면 `/auth/callback`으로 보내줘"라고 부탁합니다. 그러면 Supabase가 브라우저를 Google 로그인 화면으로 이동시킵니다.

### 3-3. Google에서 동의 후

사용자가 Google에서 "허용"을 누르면 Google이 Supabase로 돌려보내고, Supabase는 다시 우리 앱의 `/auth/callback?code=xxx`로 리다이렉트합니다.

이 `code`는 **임시 인증 코드**입니다. 클럽 입장권 같은 것 — 진짜 회원 카드(세션)는 아니고, 이걸 들고 가서 회원 카드로 교환해야 합니다.

### 3-4. 콜백 라우트 (`app/auth/callback/route.ts`)

```ts
const code = searchParams.get('code');
const { error } = await supabase.auth.exchangeCodeForSession(code);
if (!error) return NextResponse.redirect(`${origin}${next}`);
```

`exchangeCodeForSession(code)`이 임시 코드를 **진짜 세션**으로 교환합니다. 이때 Supabase가 응답으로 쿠키를 심어줍니다(`sb-...-auth-token` 같은 이름). 그리고 `/dashboard`로 리다이렉트합니다.

> **왜 이 단계가 필요할까?** 토큰을 URL로 직접 받으면 브라우저 히스토리/로그에 남아 위험합니다. 코드 → 세션 교환은 서버에서만 일어나므로 안전합니다. 이걸 **PKCE 흐름**이라고 부릅니다.

## 4. 로그인 후 인증 상태 유지

### 4-1. 쿠키가 신분증 역할

3-4에서 심어진 쿠키가 브라우저에 저장됩니다. 다음 요청부터는 브라우저가 알아서 이 쿠키를 모든 요청에 끼워서 보냅니다.

### 4-2. 서버 컴포넌트에서 사용자 확인 (`app/lib/supabase/server.ts`)

```ts
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(URL, KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(...) { /* 쿠키 갱신 */ },
    },
  });
}
```

서버에서 Supabase 클라이언트를 만들 때 **요청에 딸려온 쿠키를 넘겨줍니다**. 그러면 Supabase 서버 클라이언트가 "아, 이 사용자네" 하고 알아봅니다.

그래서 대시보드 페이지에서 이게 가능합니다:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

### 4-3. 클라이언트 컴포넌트에서 사용자 확인 (`AuthContext.tsx`)

서버에서 한 번 `user`를 가져와서 `<AuthProvider initialUser={user}>`로 내려주고, 클라이언트에서는 `onAuthStateChange`로 로그인/로그아웃 이벤트를 구독합니다.

```ts
supabase.auth.onAuthStateChange((_event, nextSession) => {
  setSession(nextSession);
  setUser(nextSession?.user ?? null);
});
```

이렇게 하면 다른 탭에서 로그아웃해도 이 탭이 자동으로 반응합니다.

## 5. 보호된 페이지 막기

### `proxy.ts` (Next.js 미들웨어)

```ts
const PROTECTED_PREFIXES = ['/dashboard'];
// ...
const isProtected = PROTECTED_PREFIXES.some((prefix) =>
  pathname.startsWith(prefix),
);

if (isProtected && !user) {
  return NextResponse.redirect(loginUrl);
}
```

모든 요청이 페이지에 도달하기 **전에** 이 코드가 실행됩니다. `/dashboard`로 들어오는 사람한테 쿠키가 없으면 `/login`으로 튕깁니다.

> 보너스: 이 미들웨어는 만료 직전인 토큰을 자동으로 갱신하는 역할도 합니다. 그래서 며칠 활동 안 해도 로그인이 유지됩니다.

## 6. 로그아웃

```ts
await supabase.auth.signOut();
window.location.assign('/login');
```

Supabase가 쿠키를 지우고 서버에 "이 세션 끝났음"을 알려줍니다. 그 다음 `/login`으로 보냅니다.

## 7. 전체 시퀀스 다이어그램

```
브라우저          Next.js          Supabase          Google
  │                 │                 │                 │
  │ /login 방문     │                 │                 │
  │────────────────>│                 │                 │
  │                 │                 │                 │
  │ "Google 로그인" │                 │                 │
  │ signInWithOAuth │                 │                 │
  │────────────────────────────────────>│                │
  │                                    │ 리다이렉트     │
  │<───────────────────────────────────│                 │
  │                                                      │
  │ Google 로그인 화면                                    │
  │─────────────────────────────────────────────────────>│
  │                                                      │
  │ 동의 후 Supabase로                                   │
  │<─────────────────────────────────────────────────────│
  │                                    │                 │
  │ /auth/callback?code=xxx로 보냄     │                 │
  │<───────────────────────────────────│                 │
  │                 │                  │                 │
  │ GET /auth/callback?code=xxx        │                 │
  │────────────────>│                  │                 │
  │                 │ exchangeCode     │                 │
  │                 │─────────────────>│                 │
  │                 │ 세션+쿠키 응답   │                 │
  │                 │<─────────────────│                 │
  │ 302 /dashboard  │                  │                 │
  │ (Set-Cookie)    │                  │                 │
  │<────────────────│                  │                 │
  │                 │                  │                 │
  │ GET /dashboard (쿠키 들고)         │                 │
  │────────────────>│                  │                 │
  │                 │ getUser (쿠키로) │                 │
  │                 │─────────────────>│                 │
  │                 │ user 반환        │                 │
  │ HTML 응답       │<─────────────────│                 │
  │<────────────────│                  │                 │
```

## 8. 자주 헷갈리는 포인트 (FAQ)

**Q. 왜 서버용/클라이언트용 Supabase 클라이언트가 따로 있어?**

A. 환경이 다릅니다. 서버는 `cookies()` API로 쿠키를 읽고, 브라우저는 `document.cookie`로 읽습니다. 그래서 `createServerClient`(`server.ts`) vs `createBrowserClient`(`client.ts`)로 분리되어 있습니다.

**Q. `NEXT_PUBLIC_` 접두사가 왜 붙어 있지?**

A. Next.js에서 `NEXT_PUBLIC_`이 붙은 환경 변수만 브라우저로 노출됩니다. Supabase URL과 **anon key**는 브라우저에서 써야 해서 붙였습니다. anon key는 공개돼도 안전한 키입니다(권한이 Supabase의 RLS 규칙으로 묶여 있음). 반면 `service_role` 키나 `GOOGLE_API_KEY`는 절대 `NEXT_PUBLIC_` 붙이면 안 됩니다.

**Q. 비밀번호는 어디 저장돼?**

A. **우리 DB에 없습니다.** Google이 인증을 책임지고, Supabase는 "이 Google 계정 → 이 사용자 ID"만 매핑합니다. 그래서 비밀번호 유출 걱정 자체가 없습니다.

**Q. 테스트 모드인데 왜 아무 Google 계정으로나 로그인되지?**

A. Google OAuth의 "테스트 사용자" 제한은 **민감한 범위(scope)** 를 요청할 때만 적용됩니다. 우리는 `openid`, `email`, `profile`만 요청하므로 모든 Google 계정이 로그인 가능합니다. Gmail이나 Drive 같은 민감 API를 추가로 쓰게 되면 그때 프로덕션으로 푸시해야 합니다.

## 9. 관련 파일 빠른 색인

| 파일 | 역할 |
|---|---|
| `app/login/page.tsx` | 로그인 페이지 UI |
| `app/lib/auth/AuthContext.tsx` | 클라이언트 인증 상태, `signInWithGoogle`/`signOut` |
| `app/lib/supabase/client.ts` | 브라우저용 Supabase 클라이언트 |
| `app/lib/supabase/server.ts` | 서버용 Supabase 클라이언트 (쿠키 연동) |
| `app/auth/callback/route.ts` | OAuth 콜백 — code를 세션으로 교환 |
| `proxy.ts` | 미들웨어 — 보호 경로 가드 & 세션 갱신 |
| `app/layout.tsx` | 서버에서 초기 `user`/`session`을 읽어 `AuthProvider`에 주입 |
