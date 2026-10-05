import { object, typeNames } from './explore-data.ts';
export type RecordRow = { id: string; title: string; record_type: keyof typeof typeNames; excerpt?: string };
export function recordRows(value: unknown): RecordRow[] {
  if (!Array.isArray(value)) throw new Error('기록 목록을 확인하지 못했습니다.');
  return value.map(value => { const row = object(value); if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id) || typeof row.title !== 'string' || !Object.hasOwn(typeNames, String(row.record_type)) || (row.excerpt !== undefined && typeof row.excerpt !== 'string')) throw new Error('기록 목록을 확인하지 못했습니다.'); return { id: row.id, title: row.title, record_type: row.record_type as RecordRow['record_type'], excerpt: row.excerpt as string | undefined }; });
}
export function recordPage(value: unknown) { const result = object(value), page = object(result.page); if (typeof page.has_more !== 'boolean') throw new Error('페이지 정보를 확인하지 못했습니다.'); return { rows: recordRows(result.data), more: page.has_more }; }
export function movePin(ids: string[], index: number, direction: -1 | 1) { const next = [...ids], target = index + direction; if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]; return next; }
