import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordPage, movePin } from '../lib/portfolio-data.ts';
import { GET } from '../app/api/bookmarks/route.ts';
test('관리 화면: 잘못된 목록·페이지 응답 거부, 핀 이동의 경계와 원본 보존',()=>{
  assert.throws(()=>recordPage({data:[{id:'invalid',title:'x',record_type:'project'}],page:{has_more:false}}));
  assert.throws(()=>recordPage({data:[],page:{has_more:'false'}}));
  const ids=['a','b','c'];assert.deepEqual(movePin(ids,0,-1),ids);assert.deepEqual(movePin(ids,1,-1),['b','a','c']);assert.deepEqual(movePin(ids,1,1),['a','c','b']);assert.deepEqual(ids,['a','b','c']);
});
test('보관 검색: 사용자 격리·공개/삭제 조건·태그·범위 및 본문 비노출',async()=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
  const original=globalThis.fetch;const owner='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000003';let query:URL|undefined;
  globalThis.fetch=async(input)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.pathname==='/auth/v1/user')return Response.json({id:owner,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-05T00:00:00Z'});query=url;return Response.json([{created_at:'2026-10-05T00:00:00Z',records:{id,owner_id:'other',record_type:'project',title:'100%_test',body:'private full body'.repeat(30),tags:['TS'],version:1}}]);};
  try{const response=await GET(new Request('http://localhost/api/bookmarks?q=100%25_test&type=project&tag=TS&offset=20',{headers:{Authorization:'Bearer test-token'}}));assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.data[0].body,undefined);assert.equal(payload.data[0].excerpt.length,200);assert.equal(query!.searchParams.get('owner_id'),`eq.${owner}`);assert.equal(query!.searchParams.get('records.visibility'),'eq.public');assert.equal(query!.searchParams.get('records.deleted_at'),'is.null');assert.equal(query!.searchParams.get('records.title'),'ilike.%100\\%\\_test%');assert.equal(query!.searchParams.get('offset'),'20');assert.equal(query!.searchParams.get('limit'),'21');assert.equal(query!.searchParams.get('records.record_type'),'eq.project');assert.ok(query!.searchParams.get('records.tags')?.includes('TS'));assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{globalThis.fetch=original;}
});
