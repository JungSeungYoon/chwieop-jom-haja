import assert from "node:assert/strict";
import { test } from "node:test";
import { browserAuth, loginWithGitHub, profileRequest } from "../lib/browser-auth.ts";
import type { Session } from "@supabase/supabase-js";

test("로그인 연결: PKCE 준비·최소 권한·토큰 전달·미로그인/저장 실패", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const client = browserAuth();
  const originalFetch = globalThis.fetch;
  const originalSession = client.auth.getSession.bind(client.auth);
  const originalOAuth = client.auth.signInWithOAuth.bind(client.auth);
  Object.defineProperty(globalThis, "window", { value: { location: { origin: "http://localhost:3000" } }, configurable: true });
  try {
    client.auth.signInWithOAuth = async (options) => {
      assert.equal(options.provider, "github");
      assert.equal(options.options?.redirectTo, "http://localhost:3000/auth/check");
      assert.equal(options.options?.scopes, "read:user user:email");
      return { data: { provider: "github", url: "https://example.supabase.co/auth/v1/authorize" }, error: null };
    };
    await loginWithGitHub();
    client.auth.getSession = async () => ({ data: { session: null }, error: null });
    await assert.rejects(profileRequest("/api/me"), /로그인이 필요합니다/);
    const session: Session = {
      access_token: "test-access-token", refresh_token: "test-refresh-token", expires_in: 3600, token_type: "bearer",
      user: { id: "test-user", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00Z" },
    };
    client.auth.getSession = async () => ({ data: { session }, error: null });
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/profiles");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-access-token");
      assert.deepEqual(JSON.parse(String(init?.body)), { handle: "test-user", nickname: "회원" });
      return Response.json({ data: { handle: "test-user" } }, { status: 201 });
    };
    assert.deepEqual(await profileRequest("/api/profiles", "POST", { handle: "test-user", nickname: "회원" }), { handle: "test-user" });
    globalThis.fetch = async () => Response.json({ error: { code: "PROFILE_CONFLICT", message: "주소 중복" } }, { status: 409 });
    await assert.rejects(profileRequest("/api/profiles", "PATCH", { handle: "duplicate" }), /주소 중복/);
  } finally {
    client.auth.getSession = originalSession;
    client.auth.signInWithOAuth = originalOAuth;
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "window");
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});
