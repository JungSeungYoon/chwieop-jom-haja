import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftSaveQueue, memberRequest } from '../lib/workspace-data.ts';
import { ApiRequestError, browserAuth } from '../lib/browser-auth.ts';
import type { Session } from '@supabase/supabase-js';
const id = '11111111-1111-4111-8111-111111111111';
const content = { record_type: 'project' as const, title: '초안', body: '본문', details: {}, tags: [] };
test('작성기: 저장 직렬화·버전 전달·같은 내용 중복 저장 방지', async () => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const queue = new DraftSaveQueue(async (path, method, body) => { calls.push({ path, method, body }); await new Promise(resolve => setTimeout(resolve, 5)); return { data: { ...(body as object), id, version: calls.length } }; });
  const original = { ...content }; const a = queue.save(original); original.body = '요청 중 바뀐 외부 값';
  const b = queue.save({ ...content, body: '새 입력' }); const c = queue.save({ ...content, body: '새 입력' });
  await Promise.all([a, b, c]); assert.equal(calls.length, 2); assert.equal(calls[0].method, 'POST'); assert.equal((calls[0].body as typeof content).body, '본문'); assert.equal((calls[1].body as { version: number }).version, 1); assert.equal(queue.version, 2); assert.equal(JSON.parse(queue.saved).body, '새 입력');
});
test('작성기: 충돌 뒤 대기 중 요청 차단·입력 보존·명시적 서버 재조회', async () => {
  let count = 0; const queue = new DraftSaveQueue(async () => { count++; throw new ApiRequestError('버전 충돌', 409, 'DRAFT_VERSION_CONFLICT'); }); queue.adopt({ ...content, id, version: 1 });
  await assert.rejects(queue.save({ ...content, body: '수정' })); await assert.rejects(queue.save({ ...content, body: '다음 수정' })); assert.equal(count, 1); assert.equal(queue.version, 1); assert.equal(JSON.parse(queue.saved).body, '본문'); queue.adopt({ ...content, id, version: 2 }); assert.equal(queue.blocked, false);
});
test('작성기: 신규 저장 응답 유실 시 중복 POST 차단', async () => {
  let count = 0; const queue = new DraftSaveQueue(async () => { count++; throw new TypeError('네트워크 중단'); }); await assert.rejects(queue.save(content)); await assert.rejects(queue.save(content)); assert.equal(count, 1); assert.equal(queue.id, undefined);
});
test('작성기: 로그인·계정 변경 시 쓰기 차단, 현재 JWT로 JSON 요청', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  const client = browserAuth(), originalSession = client.auth.getSession, originalFetch = globalThis.fetch; let calls = 0;
  const session: Session = { access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-05T00:00:00Z' } };
  try {
    globalThis.fetch = async (_path, options) => { calls++; assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-token'); assert.equal(new Headers(options?.headers).get('content-type'), 'application/json'); assert.deepEqual(JSON.parse(String(options?.body)), content); return Response.json({ data: { saved: true } }); };
    client.auth.getSession = async () => ({ data: { session: null }, error: null }); await assert.rejects(memberRequest(id, '/api/drafts', 'POST', content));
    client.auth.getSession = async () => ({ data: { session }, error: null }); await assert.rejects(memberRequest('different-account', '/api/drafts', 'POST', content)); assert.equal(calls, 0);
    await memberRequest(id, '/api/drafts', 'POST', content); assert.equal(calls, 1);
  } finally { client.auth.getSession = originalSession; globalThis.fetch = originalFetch; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
});
test('작성기: 저장 응답 변조 시 성공으로 처리하지 않고 재조회 요구', async () => {
  const queue = new DraftSaveQueue(async () => ({ data: { ...content, id, version: 9 } })); queue.adopt({ ...content, id, version: 1 });
  await assert.rejects(queue.save({ ...content, body: '새 입력' })); assert.equal(queue.version, 1); assert.equal(queue.blocked, true);
});
