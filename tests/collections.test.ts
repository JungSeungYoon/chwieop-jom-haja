import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parsePins } from "../lib/collection.ts";
import { GET as pins, PUT as replace } from "../app/api/pins/route.ts";
import { GET as bookmarks } from "../app/api/bookmarks/route.ts";
import { PUT as save, DELETE as remove } from "../app/api/bookmarks/[id]/route.ts";

const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const id = "00000000-0000-0000-0000-000000000003";

test("핀 입력: 최대 3개·순서·빈 배열 해제·대소문자 중복 차단", () => {
  assert.deepEqual(parsePins({ record_ids: [id] }), [id]);
  assert.deepEqual(parsePins({ record_ids: [] }), []);
  const mixed = "abcdef00-0000-0000-0000-000000000003";
  for (const value of [null, [], {}, { record_ids: [id,id] }, { record_ids: [id,id,id,id] }, { record_ids: [7] }, { record_ids: ["bad"] }, { record_ids: [], owner }, { record_ids: [mixed,mixed.toUpperCase()] }]) assert.throws(() => parsePins(value));
});

test("핀·보관 API: 인증·페이지·RPC 인수·권한 오류", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  const original = globalThis.fetch;
  let replies: { data: unknown; status?: number }[] = [];
  const calls: { url: URL; init?: RequestInit }[] = [];
  const user = { id: owner, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T00:00:00Z" };
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url), init });
    const reply = replies.shift(); assert.ok(reply); return Response.json(reply.data, { status: reply.status ?? 200 });
  };
  const req = (path: string, method = "GET", body?: unknown) => new Request(`http://localhost${path}`, {
    method, headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const context = { params: Promise.resolve({ id }) };
  try {
    assert.equal((await pins(new Request("http://localhost/api/pins"))).status, 401);
    assert.equal((await bookmarks(new Request("http://localhost/api/bookmarks"))).status, 401);
    assert.equal((await save(new Request("http://localhost", { method: "PUT" }), context)).status, 401);
    replies = [{ data: [{ id, sort_order: 1 }] }];
    const response = await pins(new Request(`http://localhost/api/pins?owner=${owner}`));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(calls.at(-1)?.url.pathname, "/rest/v1/rpc/list_pins");
    replies = [{ data: user }, { data: [{ id, sort_order: 1 }] }];
    assert.equal((await replace(req("/api/pins", "PUT", { record_ids: [id] }))).status, 200);
    assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)), { p_ids: [id] });
    replies = [{ data: user }, { data: Array.from({ length: 21 }, (_, n) => ({ id: n })) }];
    const result = await (await bookmarks(req("/api/bookmarks?offset=20"))).json();
    assert.equal(result.data.length, 20); assert.equal(result.page.has_more, true);
    assert.equal(JSON.parse(String(calls.at(-1)?.init?.body)).p_offset, 20);
    for (const [handler, method, saved] of [[save, "PUT", true], [remove, "DELETE", false]] as const) {
      replies = [{ data: user }, { data: [{ record_id: id, saved }] }];
      assert.deepEqual(await (await handler(req("/api/bookmarks/" + id, method), context)).json(), { data: { record_id: id, saved } });
      assert.equal(JSON.parse(String(calls.at(-1)?.init?.body)).p_saved, saved);
    }
    for (const [code, status] of [["P0002",404],["P0005",409],["22023",400],["PGRST000",503]] as const) {
      replies = [{ data: user }, { data: { code, message: "private" }, status: 400 }];
      const response = await replace(req("/api/pins", "PUT", { record_ids: [id] }));
      assert.equal(response.status, status); assert.ok(!(await response.text()).includes('"private"'));
    }
    replies = [{ data: user }]; assert.equal((await bookmarks(req("/api/bookmarks?owner=" + other))).status, 400);
    assert.equal((await pins(new Request("http://localhost/api/pins?owner=bad"))).status, 400);
  } finally { globalThis.fetch = original; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
});

test("핀·보관 PostgreSQL: 한도·소유자·순서·상태 전환·복원·보관함 격리", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;
      insert into auth.users values ('${owner}'),('${other}');`);
    for (const name of ["202610050001_profiles.sql", "202610050002_record_drafts.sql", "202610050003_records.sql", "202610050004_search_trash.sql", "202610050005_pins_bookmarks.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.exec(`insert into profiles(id,handle,nickname) values ('${owner}','owner-user','회원'),('${other}','other-user','타인'); set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const publish = async (type = "project", visibility = "public") => {
      const row = (await db.query<{ id: string }>("insert into record_drafts(owner_id,record_type,title,body) values ($1,$2,'검증 기록','기능 검증 본문') returning id", [owner,type])).rows[0];
      await db.query("select * from apply_record($1,1,0,$2)", [row.id,visibility]); return row.id;
    };
    const projects = await Promise.all([publish(),publish(),publish(),publish()]);
    const study = await publish("study"); const privateId = await publish("project","private");
    const setPins = (ids: string[]) => db.query<{ id: string; sort_order: number }>("select * from replace_pins($1)", [ids]);
    assert.equal((await setPins(projects.slice(0,3))).rows.length, 3);
    await assert.rejects(setPins(projects), { code: "22023" });
    await assert.rejects(setPins([projects[0],projects[0]]), { code: "22023" });
    await assert.rejects(setPins([study]), { code: "P0002" });
    await assert.rejects(setPins([privateId]), { code: "P0002" });
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 3);
    assert.deepEqual((await setPins([projects[2],projects[0],projects[1]])).rows.map((r) => r.id), [projects[2],projects[0],projects[1]]);
    await assert.rejects(db.query("insert into project_pins values ($1,$2,1)", [owner,projects[3]]), { code: "42501" });
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    await assert.rejects(setPins([projects[0]]), { code: "P0002" });
    const bookmark = (record: string, saved = true) => db.query("select * from set_bookmark($1,$2)", [record,saved]);
    for (const record of [projects[0],study,projects[0]]) await bookmark(record);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length, 2);
    assert.equal((await db.query("select * from bookmarks")).rows.length, 2);
    await assert.rejects(bookmark(privateId), { code: "P0002" });
    await assert.rejects(db.query("insert into bookmarks(owner_id,record_id) values ($1,$2)", [other,projects[1]]), { code: "42501" });
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length, 0);
    assert.equal((await db.query("select * from bookmarks")).rows.length, 0);
    await assert.rejects(bookmark(projects[0]), { code: "22023" });
    await db.query("select * from apply_record($1,1,1,'private')", [projects[0]]);
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 2);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length, 1);
    await bookmark(projects[0],false); await bookmark(projects[0],false);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from apply_record($1,1,2,'public')", [projects[0]]);
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 2);
    await db.query("select * from set_record_deleted($1,1,1,true)", [projects[2]]);
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 1);
    await db.query("select * from set_record_deleted($1,2,2,false)", [projects[2]]);
    await db.query("select * from apply_record($1,3,3,'public')", [projects[2]]);
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 1);
    await db.query("update record_drafts set record_type='study' where id=$1", [projects[1]]);
    await db.query("select * from apply_record($1,2,1,'public')", [projects[1]]);
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    await bookmark(study); await bookmark(study);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length, 1);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from set_record_deleted($1,1,1,true)", [study]);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
    await db.query("select * from set_record_deleted($1,2,2,false)", [study]);
    await db.query("select * from apply_record($1,3,3,'public')", [study]);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query("select * from list_bookmarks(0)")).rows.length, 1);
    for (let n = 0; n < 21; n++) {
      await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
      const record = await publish("other");
      await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
      await bookmark(record);
    }
    const first = (await db.query<{ id: string }>("select * from list_bookmarks(0)")).rows;
    const next = (await db.query<{ id: string }>("select * from list_bookmarks(20)")).rows;
    assert.equal(first.length,21); assert.equal(next.length,2);
    assert.ok(!first.slice(0,20).some((row) => next.some((item) => item.id===row.id)));
    await assert.rejects(db.query("select * from list_bookmarks(-1)"), { code: "22023" });
    await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false);");
    assert.equal((await db.query("select * from list_pins($1)", [owner])).rows.length, 0);
    for (const sql of ["select * from bookmarks", "select * from replace_pins('{}')", "select * from list_bookmarks(0)", `select * from set_bookmark('${study}',true)`, "select remove_ineligible_pins()"])
      await assert.rejects(db.query(sql), { code: "42501" });
  } finally { await db.close(); }
});
