import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, changeBookmark, demoBookmarkKey, demoFeed, demoRecords, emptyQuery, feedPath, formatDate, optimisticBookmark, parseFeed, readDemoBookmarks } from "../lib/explore-data.ts";

test("탐색: 실제 응답 검증·한국 날짜·검색과 태그 AND·페이지 분리", () => {
  const first = demoFeed(emptyQuery, 0, new Set([demoRecords[0].id])), second = demoFeed(emptyQuery, 20, new Set());
  assert.equal(first.posts.length, 20); assert.equal(first.hasMore, true);
  assert.equal(second.posts.length, 4); assert.equal(second.hasMore, false);
  assert.ok(!first.posts.some(post => second.posts.some(next => post.id === next.id)));
  assert.equal(first.posts[0].isBookmarked, true);
  assert.equal(demoFeed({ query: "RLS", type: "study", tags: ["Supabase", "Security"] }, 0, new Set()).posts.length, 3);
  assert.equal(demoFeed({ ...emptyQuery, tags: ["없는 태그"] }, 0, new Set()).posts.length, 0);
  assert.equal(formatDate("2026-10-04T18:00:00Z"), "2026.10.05");
  assert.equal(formatDate("invalid"), "날짜 없음");
  const params = new URL(feedPath({ query: "TCP", type: "project", tags: ["Python", "TCP/IP"] }, 20), "http://localhost").searchParams;
  assert.deepEqual(params.getAll("tag"), ["Python", "TCP/IP"]); assert.equal(params.get("feed"), "1"); assert.equal(params.get("offset"), "20");
  const post = demoRecords[0];
  const row = { id: post.id, owner_id: post.ownerId, title: post.title, excerpt: post.summary, record_type: post.type,
    visibility: "public", tags: post.tags, created_at: post.createdAt, updated_at: post.updatedAt, author: post.author,
    is_pinned: true, is_bookmarked: false, linked_study_count: 1 };
  assert.equal(parseFeed({ data: [row], page: { has_more: false } }).posts[0].author.nickname, "서연");
  for (const broken of [{ ...row, visibility: "private" }, { ...row, author: null }, { ...row, is_bookmarked: undefined }, { ...row, created_at: "bad" }]) assert.throws(() => parseFeed({ data: [broken], page: { has_more: false } }));
});

test("데모 보관: 영속 데이터·손상·저장소 접근 실패를 구분", () => {
  assert.equal(readDemoBookmarks({ getItem: () => null }).size, 0);
  assert.deepEqual([...readDemoBookmarks({ getItem: key => { assert.equal(key, demoBookmarkKey); return JSON.stringify([demoRecords[0].id]); } })], [demoRecords[0].id]);
  assert.throws(() => readDemoBookmarks({ getItem: () => "bad-json" }));
  assert.throws(() => readDemoBookmarks({ getItem: () => '["unknown"]' }));
  assert.throws(() => readDemoBookmarks({ getItem: () => { throw new Error("denied"); } }));
});

test("보관 통신: PUT/DELETE·인증·실패 롤백·서버 결과 확정", async () => {
  const original = globalThis.fetch, id = demoRecords[0].id, states: boolean[] = [];
  try {
    globalThis.fetch = async (path, init) => {
      assert.equal(path, `/api/bookmarks/${id}`); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer member-token");
      return Response.json({ data: { record_id: id, saved: init?.method === "PUT" } });
    };
    await optimisticBookmark(false, next => changeBookmark(id, next, "member-token"), value => states.push(value));
    assert.deepEqual(states, [true, true]);
    assert.equal(await changeBookmark(id, false, "member-token"), false);
    globalThis.fetch = async () => Response.json({ error: { code: "RECORD_NOT_FOUND", message: "공개 기록을 찾을 수 없습니다." } }, { status: 404 });
    states.length = 0;
    await assert.rejects(optimisticBookmark(false, next => changeBookmark(id, next, "member-token"), value => states.push(value)), /공개 기록/);
    assert.deepEqual(states, [true, false]);
    globalThis.fetch = async () => Response.json({ data: { saved: true, record_id: "wrong" } });
    await assert.rejects(changeBookmark(id, true, "member-token"), /응답 형식/);
    globalThis.fetch = async () => new Response("broken", { status: 503 });
    await assert.rejects(apiRequest("/api/records?feed=1"), /응답을 읽지/);
  } finally { globalThis.fetch = original; }
});
