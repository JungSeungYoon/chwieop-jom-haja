import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function browserAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase 연결 설정이 필요합니다.");
  client ??= createClient(url, key, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export async function loginWithGitHub() {
  const { error } = await browserAuth().auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${window.location.origin}/auth/check`,
      scopes: "read:user user:email",
    },
  });
  if (error) throw new Error("GitHub 로그인 요청에 실패했습니다. 인증 설정을 확인해주세요.");
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}

export async function profileRequest(path: string, method = "GET", body?: unknown) {
  const { data, error } = await browserAuth().auth.getSession();
  if (error || !data.session) throw new Error("로그인이 필요합니다.");
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiRequestError(result.error?.message ?? "요청에 실패했습니다.", response.status, result.error?.code);
  return result.data;
}
