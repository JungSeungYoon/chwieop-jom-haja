import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as me } from "../app/api/me/route.ts";
import { POST, PATCH } from "../app/api/profiles/route.ts";
import { GET as publicProfile } from "../app/api/profiles/[handle]/route.ts";

const userId = "00000000-0000-0000-0000-000000000001";
const user = { id: userId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00Z" };
const profile = { id: userId, handle: "seung-yoon", nickname: "승윤", major: "", interests: "", bio: "", created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" };

function request(body?: unknown, token = "test-access-token", method = "POST") {
  return new Request("http://localhost/api/profiles", {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("API 경로: 인증·등록·조회·수정·오류 처리 (Supabase 응답 모의)", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const originalFetch = globalThis.fetch;
  const calls: { url: URL; init?: RequestInit }[] = [];
  let replies: { status?: number; data: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init });
    const reply = replies.shift();
    assert.ok(reply, "예상하지 않은 외부 요청");
    return Response.json(reply.data, { status: reply.status ?? 200 });
  };
  function prepare(data: unknown, status = 200) {
    calls.length = 0;
    replies = [{ data: user }, { data, status }];
  }
  try {
    await t.test("인증 없는 등록·수정·내 프로필 요청은 401", async () => {
      for (const handler of [POST, PATCH, me]) {
        assert.equal((await handler(new Request("http://localhost/api/me"))).status, 401);
      }
      assert.equal(calls.length, 0);
    });
    await t.test("등록은 인증된 ID로 저장하며 선택 필드는 빈 값", async () => {
      prepare(profile, 201);
      const response = await POST(request({ handle: "Seung-Yoon", nickname: "승윤" }));
      assert.equal(response.status, 201);
      assert.deepEqual((await response.json()).data, profile);
      assert.equal(calls[0].url.pathname, "/auth/v1/user");
      assert.equal(calls[1].url.pathname, "/rest/v1/profiles");
      assert.equal(new Headers(calls[1].init?.headers).get("authorization"), "Bearer test-access-token");
      assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { handle: "seung-yoon", nickname: "승윤", major: "", interests: "", bio: "", id: userId });
    });
    await t.test("신규 회원은 needs_profile, 기존 회원은 프로필 반환", async () => {
      prepare(null);
      const response = await me(request(undefined, undefined, "GET"));
      assert.deepEqual((await response.json()).data, { user: { id: userId }, profile: null, needs_profile: true });
      prepare(profile);
      assert.equal((await (await me(request(undefined, undefined, "GET"))).json()).data.needs_profile, false);
      assert.equal(calls[1].url.searchParams.get("id"), `eq.${userId}`);
    });
    await t.test("부분 수정은 본인 ID만 대상으로 지정", async () => {
      prepare({ ...profile, bio: "보안 공부" });
      assert.equal((await PATCH(request({ bio: "보안 공부" }, undefined, "PATCH"))).status, 200);
      assert.equal(calls[1].url.searchParams.get("id"), `eq.${userId}`);
      assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { bio: "보안 공부" });
      prepare(null);
      assert.equal((await PATCH(request({ bio: "없음" }, undefined, "PATCH"))).status, 404);
    });
    await t.test("위조 ID·잘못된 JSON·과대 본문·Content-Type을 거부", async () => {
      prepare(null);
      assert.equal((await POST(request({ ...profile }))).status, 400);
      assert.equal(calls.length, 1);
      for (const [body, contentType, expected] of [["{", "application/json", 400], ["x".repeat(8193), "application/json", 413], ["{}", "text/plain", 415]] as const) {
        prepare(null);
        const response = await POST(new Request("http://localhost/api/profiles", { method: "POST", headers: { Authorization: "Bearer test-access-token", "Content-Type": contentType }, body }));
        assert.equal(response.status, expected);
        assert.equal(calls.length, 1);
      }
    });
    await t.test("중복 주소 409, 만료 인증 401, 외부 장애 503", async () => {
      prepare({ code: "23505", message: "내부 상세 정보" }, 409);
      const conflict = await POST(request({ handle: "seung-yoon", nickname: "승윤" }));
      assert.equal(conflict.status, 409);
      assert.ok(!(await conflict.text()).includes("내부 상세 정보"));
      replies = [{ status: 401, data: { code: "bad_jwt", msg: "expired" } }];
      assert.equal((await me(request(undefined, undefined, "GET"))).status, 401);
      prepare({ code: "PGRST301", message: "expired" }, 401);
      assert.equal((await me(request(undefined, undefined, "GET"))).status, 401);
      prepare({ code: "PGRST000", message: "private connection detail" }, 503);
      assert.equal((await me(request(undefined, undefined, "GET"))).status, 503);
    });
    await t.test("공개 조회는 로그인 없이 허용하며 미등록 주소는 404", async () => {
      calls.length = 0;
      replies = [{ data: profile }];
      const response = await publicProfile(new Request("http://localhost/api/profiles/seung-yoon"), { params: Promise.resolve({ handle: "Seung-Yoon" }) });
      assert.equal(response.status, 200);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url.searchParams.get("handle"), "eq.seung-yoon");
      assert.ok(!calls[0].url.searchParams.get("select")?.includes("email"));
      assert.equal(response.headers.get("cache-control"), "no-store");
      replies = [{ data: null }];
      assert.equal((await publicProfile(new Request("http://localhost/api/profiles/unknown"), { params: Promise.resolve({ handle: "unknown" }) })).status, 404);
    });
    await t.test("설정 누락은 성공을 가장하지 않고 503", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      assert.equal((await me(request(undefined, undefined, "GET"))).status, 503);
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});
