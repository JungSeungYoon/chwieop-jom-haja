import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseDraft } from "../lib/draft.ts";
import { ApiError } from "../lib/profile.ts";
import { POST, GET as list } from "../app/api/drafts/route.ts";
import { GET, PUT } from "../app/api/drafts/[id]/route.ts";

const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const id = "00000000-0000-0000-0000-000000000003";
const context = { params: Promise.resolve({ id }) };

test("초안 입력: 미완성 허용, 안내 항목·태그·버전·위조 필드 검증", () => {
  assert.deepEqual(parseDraft({ record_type: "project" }), { record_type: "project", title: "", body: "", details: {}, tags: [] });
  const input = { record_type: "study", body: "  ```ts\nconst x = 1;\n```\n", details: { learned: "복습\n기록" }, tags: [" TCP ", "TCP", "보안"] };
  assert.equal(parseDraft(input).body, input.body);
  assert.deepEqual(parseDraft(input).tags, ["TCP", "보안"]);
  assert.equal(parseDraft({ ...input, version: 2 }, true).version, 2);
  for (const invalid of [null, [], {}, { record_type: "__proto__" }, { record_type: "project", owner_id: other },
    { record_type: "project", details: { learned: "wrong type" } }, { record_type: "other", details: { intro: "no" } },
    { record_type: "study", details: { learned: 1 } }, { record_type: "project", tags: [""] },
    { record_type: "project", tags: Array(11).fill("a") }, { record_type: "project", title: "x".repeat(201) },
    { record_type: "project", body: "x".repeat(100001) }, { record_type: "project", body: "\u0000" },
    ...["title", "body", "details", "tags"].map((field) => ({ record_type: "project", [field]: null }))]) {
    assert.throws(() => parseDraft(invalid), ApiError);
  }
  for (const version of [undefined, 0, 1.5, "1", 2147483647]) assert.throws(() => parseDraft({ ...input, version }, true), ApiError);
});

test("초안 API: 소유자 필터, 저장 버전, 권한·충돌·본문 제한 (Supabase 모의)", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const original = globalThis.fetch;
  const calls: { url: URL; init?: RequestInit }[] = [];
  let replies: { data: unknown; status?: number }[] = [];
  const user = { id: owner, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00Z" };
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init });
    const reply = replies.shift(); assert.ok(reply, "예상하지 않은 외부 요청");
    return Response.json(reply.data, { status: reply.status ?? 200 });
  };
  const request = (method = "GET", body?: unknown, suffix = "") => new Request(`http://localhost/api/drafts${suffix}`, {
    method, headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const prepare = (...data: unknown[]) => { calls.length = 0; replies = [{ data: user }, ...data.map((item) => ({ data: item }))]; };
  try {
    assert.equal((await POST(new Request("http://localhost/api/drafts", { method: "POST" }))).status, 401);
    assert.equal((await GET(new Request("http://localhost/api/drafts"), context)).status, 401);
    assert.equal((await PUT(new Request("http://localhost/api/drafts", { method: "PUT" }), context)).status, 401);
    assert.equal((await list(new Request("http://localhost/api/drafts"))).status, 401);
    assert.equal(calls.length, 0);
    prepare({ id, version: 1 });
    assert.equal((await POST(request("POST", { record_type: "project" }))).status, 201);
    assert.equal(JSON.parse(String(calls[1].init?.body)).owner_id, owner);
    prepare([{ id }]);
    assert.equal((await list(request("GET", undefined, "?offset=20"))).status, 200);
    assert.equal(calls[1].url.searchParams.get("owner_id"), `eq.${owner}`);
    assert.equal(calls[1].url.searchParams.get("offset"), "20");
    assert.equal(calls[1].url.searchParams.get("limit"), "20");
    prepare(null);
    assert.equal((await list(request("GET", undefined, "?offset=-1"))).status, 400);
    prepare({ id });
    assert.equal((await GET(request(), context)).status, 200);
    assert.equal(calls[1].url.searchParams.get("id"), `eq.${id}`);
    assert.equal(calls[1].url.searchParams.get("owner_id"), `eq.${owner}`);
    prepare(null);
    assert.equal((await GET(request(), context)).status, 404);
    prepare({ id, version: 2 });
    assert.equal((await PUT(request("PUT", { record_type: "study", body: "복습", version: 1 }), context)).status, 200);
    assert.equal(calls[1].url.searchParams.get("version"), "eq.1");
    assert.ok(!Object.hasOwn(JSON.parse(String(calls[1].init?.body)), "version"));
    prepare(null, { id });
    const conflict = await PUT(request("PUT", { record_type: "study", version: 1 }), context);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "DRAFT_VERSION_CONFLICT");
    prepare(null, null);
    assert.equal((await PUT(request("PUT", { record_type: "study", version: 1 }), context)).status, 404);
    prepare(null);
    assert.equal((await POST(request("POST", { record_type: "project", owner_id: other }))).status, 400);
    prepare(null);
    assert.equal((await POST(new Request("http://localhost/api/drafts", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: "x".repeat(512 * 1024 + 1) }))).status, 413);
    prepare(null);
    replies[1] = { data: { code: "23503" }, status: 409 };
    assert.equal((await POST(request("POST", { record_type: "project" }))).status, 404);
    prepare(null);
    replies[1] = { data: { code: "PGRST000", message: "private" }, status: 503 };
    assert.equal((await GET(request(), context)).status, 503);
  } finally {
    globalThis.fetch = original;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});

test("초안 PostgreSQL: 본인만 조회·수정, 위조·익명 차단, 오래된 저장 차단", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      insert into auth.users values ('${owner}'), ('${other}');`);
    for (const file of ["202610050001_profiles.sql", "202610050002_record_drafts.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    await db.exec(`insert into profiles(id,handle,nickname) values ('${owner}','owner-user','회원'), ('${other}','other-user','타인');
      set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
    const created = await db.query<{ id: string; version: number }>("insert into record_drafts(owner_id,record_type) values ($1,'project') returning id,version", [owner]);
    const draft = created.rows[0]; assert.equal(draft.version, 1);
    await assert.rejects(db.query("insert into record_drafts(owner_id,record_type) values ($1,'study')", [other]), { code: "42501" });
    await assert.rejects(db.query("update record_drafts set version=99"), { code: "42501" });
    await assert.rejects(db.query("update record_drafts set owner_id=$1", [other]), { code: "42501" });
    await assert.rejects(db.query("update record_drafts set created_at=now()"), { code: "42501" });
    await assert.rejects(db.query("update record_drafts set tags=array['']"), { code: "23514" });
    await assert.rejects(db.query("update record_drafts set details='{" + '"learned":"study only"' + "}'"), { code: "23514" });
    const updated = await db.query<{ version: number }>("update record_drafts set body='최신 내용' where id=$1 and version=1 returning version", [draft.id]);
    assert.equal(updated.rows[0].version, 2);
    assert.equal((await db.query("update record_drafts set body='오래된 내용' where id=$1 and version=1 returning id", [draft.id])).rows.length, 0);
    assert.equal((await db.query<{ body: string }>("select body from record_drafts")).rows[0].body, "최신 내용");
    await db.exec(`select set_config('request.jwt.claim.sub', '${other}', false);`);
    assert.deepEqual((await db.query("select * from record_drafts")).rows, []);
    assert.deepEqual((await db.query("update record_drafts set title='타인 수정' where id=$1 returning id", [draft.id])).rows, []);
    await db.exec("set role anon;");
    await assert.rejects(db.query("select * from record_drafts"), { code: "42501" });
  } finally { await db.close(); }
});
