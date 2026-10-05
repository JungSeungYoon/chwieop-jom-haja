import { browserAuth } from './browser-auth.ts';
import { apiRequest, object } from './explore-data.ts';
import { parseDraft, type DraftContent } from './draft.ts';
import { ApiRequestError } from './browser-auth.ts';

export async function memberRequest(userId: string, path: string, method = 'GET', body?: unknown) {
  const { data, error } = await browserAuth().auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) throw new Error('로그인 상태가 변경되었습니다. 다시 로그인해주세요.');
  return apiRequest(path, data.session.access_token, undefined, method, body);
}
export function readDraft(value: unknown) {
  const row = object(value);
  const content = parseDraft({ record_type: row.record_type, title: row.title, body: row.body, details: row.details, tags: row.tags });
  if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id) || !Number.isSafeInteger(row.version) || Number(row.version) < 1) throw new Error('초안 응답을 확인하지 못했습니다.');
  return { ...content, id: row.id, version: Number(row.version) };
}
export class DraftSaveQueue {
  id?: string;
  version = 0;
  saved = '';
  blocked = false;
  private tail: Promise<unknown> = Promise.resolve();
  private request: (path: string, method: string, body: unknown) => Promise<Record<string, unknown>>;
  constructor(request: (path: string, method: string, body: unknown) => Promise<Record<string, unknown>>) { this.request = request; }
  adopt(value: unknown) { const draft = readDraft(value); this.id = draft.id; this.version = draft.version; this.saved = JSON.stringify(parseDraft(draftContent(draft))); this.blocked = false; return draft; }
  save(input: DraftContent) {
    const content = parseDraft(input), signature = JSON.stringify(content);
    const task = this.tail.catch(() => {}).then(async () => {
      if (this.blocked) throw new Error('저장 상태 확인이 필요합니다. 현재 입력을 백업하고 서버 초안을 다시 불러와주세요.');
      if (this.saved === signature && this.id) return { id: this.id, version: this.version };
      let response;
      try { response = await this.request(this.id ? `/api/drafts/${this.id}` : '/api/drafts', this.id ? 'PUT' : 'POST', this.id ? { ...content, version: this.version } : content); }
      catch (error) { if ((error instanceof ApiRequestError && error.status === 409) || (!this.id && !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500))) this.blocked = true; throw error; }
      let draft;
      try { draft = readDraft(response.data); if ((!this.id && draft.version !== 1) || JSON.stringify(draftContent(draft)) !== signature) throw new Error('저장 내용 응답을 확인하지 못했습니다.'); if (this.id && (draft.id !== this.id || draft.version !== this.version + 1)) throw new Error('저장 버전 응답을 확인하지 못했습니다.'); }
      catch (error) { this.blocked = true; throw error; }
      this.id = draft.id; this.version = draft.version; this.saved = signature;
      return { id: this.id, version: this.version };
    });
    this.tail = task; return task;
  }
}
export function draftContent(value: DraftContent): DraftContent { return { record_type: value.record_type, title: value.title, body: value.body, details: value.details, tags: value.tags }; }
