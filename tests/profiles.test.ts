import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ApiError, parseProfile } from "../lib/profile.ts";

test("프로필 입력: 필수값·길이·예약 주소·소유자 위조 검사", () => {
  assert.deepEqual(parseProfile({ nickname: " 승윤 ", handle: " My-Portfolio " }, "create"), {
    nickname: "승윤", handle: "my-portfolio", major: "", interests: "", bio: "",
  });
  assert.deepEqual(parseProfile({ bio: "" }, "update"), { bio: "" });
  for (const input of [null, [], {}, { nickname: "승윤" }, { nickname: "a", handle: "abc" },
    { nickname: "승윤", handle: "admin" }, { nickname: "승윤", handle: "-abc" },
    { nickname: "승윤", handle: "ab" }, { nickname: "승윤", handle: "한글주소" },
    { nickname: "승윤", handle: "abc", id: "other-user" },
    { nickname: "승윤", handle: "abc", bio: "x".repeat(201) },
    { nickname: "승윤", handle: "abc", bio: "a\u0000b" },
    { nickname: "승윤", handle: "abc", major: null }]) {
    assert.throws(() => parseProfile(input, "create"), ApiError);
  }
  assert.throws(() => parseProfile({}, "update"), ApiError);
  assert.equal(parseProfile({ nickname: "😀".repeat(30) }, "update").nickname?.length, 60);
});

test("실제 PostgreSQL 실행: 공개 조회·본인 등록/수정·중복·타인 변경 차단", async () => {
  // Supabase Auth의 최소 계약만 재현하고 실제 마이그레이션을 실행한다.
  // 호스팅 Supabase/Auth/PostgREST 통합 검증을 대체하지 않는다.
  const db = new PGlite();
  const owner = "00000000-0000-0000-0000-000000000001";
  const other = "00000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth, public to anon, authenticated;
      insert into auth.users values ('${owner}'), ('${other}');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/202610050001_profiles.sql", import.meta.url), "utf8"));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
    await db.query("insert into public.profiles (id,handle,nickname) values ($1,'seung-yoon','승윤')", [owner]);
    const initial = (await db.query<{ updated_at: Date }>("select updated_at from public.profiles")).rows[0];
    assert.equal((await db.query("update public.profiles set bio='보안 공부' where id=$1 returning bio", [owner])).rows.length, 1);
    const changed = (await db.query<{ updated_at: Date }>("select updated_at from public.profiles")).rows[0];
    assert.ok(new Date(changed.updated_at).getTime() >= new Date(initial.updated_at).getTime());
    await assert.rejects(db.query("update public.profiles set id=$1", [other]), { code: "42501" });
    await assert.rejects(db.query("update public.profiles set created_at=now()"), { code: "42501" });
    await assert.rejects(db.query("delete from public.profiles"), { code: "42501" });
    await assert.rejects(db.query("insert into public.profiles (id,handle,nickname) values ($1,'forged-user','위조')", [other]), { code: "42501" });

    await db.exec(`select set_config('request.jwt.claim.sub', '${other}', false);`);
    assert.deepEqual((await db.query("update public.profiles set nickname='타인 수정' where id=$1 returning id", [owner])).rows, []);
    await assert.rejects(db.query("insert into public.profiles (id,handle,nickname) values ($1,'seung-yoon','중복')", [other]), { code: "23505" });
    for (const handle of ["admin", "abc-", "ABCD", "한글주소"]) {
      await assert.rejects(db.query("insert into public.profiles (id,handle,nickname) values ($1,$2,'검사')", [other, handle]), { code: "23514" });
    }
    await db.query("insert into public.profiles (id,handle,nickname) values ($1,'another-user','다른 회원')", [other]);
    await assert.rejects(db.query("update public.profiles set bio=$1 where id=$2", ["x".repeat(201), other]), { code: "23514" });

    await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);");
    assert.equal((await db.query("select * from public.profiles")).rows.length, 2);
    await assert.rejects(db.query("insert into public.profiles (id,handle,nickname) values ($1,'visitor','방문자')", [owner]), { code: "42501" });
    await assert.rejects(db.query("update public.profiles set nickname='익명 변경'"), { code: "42501" });
    assert.equal((await db.query<{ nickname: string }>("select nickname from public.profiles where id=$1", [owner])).rows[0].nickname, "승윤");
  } finally {
    await db.close();
  }
});
