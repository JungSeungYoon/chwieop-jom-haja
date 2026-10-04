import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./profile.ts";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function withApi(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    return json({ error: { code: "SERVICE_UNAVAILABLE", message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요." } }, 503);
  }
}

export function supabase(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "서버의 Supabase 연결 설정이 필요합니다.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000),
      }),
    },
  });
}

export async function authenticate(request: Request) {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  const client = supabase(match[1]);
  // 토큰의 내용을 직접 신뢰하지 않고 Supabase Auth에서 사용자를 확인한다.
  const { data, error } = await client.auth.getUser(match[1]);
  if (error && (!error.status || error.status === 429 || error.status >= 500)) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "인증 서버에 연결하지 못했습니다.");
  }
  if (error || !data.user) throw new ApiError(401, "UNAUTHORIZED", "다시 로그인해주세요.");
  return { client, user: data.user };
}

export async function readJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type을 application/json으로 지정해주세요.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "JSON 본문이 필요합니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", `요청 본문은 ${maxBytes.toLocaleString("en-US")}바이트 이하로 보내주세요.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "올바른 JSON 본문을 보내주세요.");
  }
}

export function databaseError(error: { code: string }): never {
  if (["PGRST301", "PGRST302", "PGRST303"].includes(error.code)) {
    throw new ApiError(401, "UNAUTHORIZED", "다시 로그인해주세요.");
  }
  if (error.code === "23505") {
    throw new ApiError(409, "PROFILE_CONFLICT", "이미 등록된 프로필이거나 사용 중인 개인 주소입니다.");
  }
  if (["23514", "22001", "22P02"].includes(error.code)) {
    throw new ApiError(400, "INVALID_INPUT", "입력 내용을 확인해주세요.");
  }
  if (error.code === "42501") throw new ApiError(403, "FORBIDDEN", "허용되지 않은 요청입니다.");
  throw new ApiError(503, "SERVICE_UNAVAILABLE", "저장소 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
}
