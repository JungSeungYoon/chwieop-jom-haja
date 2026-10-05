import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? '');
assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)), 'HTTPS 배포 주소를 입력해주세요.');
assert.equal(base.username + base.password, '', '인증 정보를 URL에 넣지 마세요.');
base.pathname = '/'; base.search = ''; base.hash = '';

async function check(path, status, json = false) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, status, `${path}: 예상 ${status}, 실제 ${response.status}`);
  if (json) assert.ok(response.headers.get('cache-control')?.includes('no-store'), `${path}: no-store 누락`);
  console.log(`PASS ${status} ${path}`);
  return response;
}
for (const path of ['/', '/archive', '/settings/profile', '/write', '/?demo=1']) await check(path, 200);
for (const path of ['/auth/check', '/.env', '/.env.local']) await check(path, 404);
for (const path of ['/api/me', '/api/archive', '/api/drafts', '/api/bookmarks']) await check(path, 401, true);
const feed = await (await check('/api/records?feed=1', 200, true)).json();
assert.ok(Array.isArray(feed.data) && typeof feed.page?.has_more === 'boolean', '피드 응답 형식 오류');
await check('/api/records?offset=invalid', 400, true);
await check('/api/records/00000000-0000-4000-8000-000000000000', 404, true);
console.log('배포 읽기·인증 거부 검사 완료. 로그인·작성·사진의 실제 브라우저 검증은 별도로 진행합니다.');
