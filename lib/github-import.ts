import { ApiError } from "./profile.ts";
import { parseDraft } from "./draft.ts";

export function parseRepositoryUrl(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "url")) throw new ApiError(400,"INVALID_INPUT","공개 저장소 url만 입력해주세요.");
  const url = (value as { url?: unknown }).url;
  const match = typeof url === "string" && url.length <= 300 ? /^https:\/\/github\.com(?::443)?\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/?$/i.exec(url.trim()) : null;
  const owner = match?.[1] ?? ""; const repo = (match?.[2] ?? "").replace(/\.git$/i,"");
  if (!match || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !repo || repo.length > 100 || [".",".."].includes(repo)) {
    throw new ApiError(400,"INVALID_INPUT","https://github.com/소유자/저장소 형식으로 입력해주세요. 파일·브랜치 주소는 지원하지 않습니다.");
  }
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

async function text(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new ApiError(422,"GITHUB_CONTENT_TOO_LARGE","GitHub 응답이 가져오기 크기 제한을 넘었습니다."); }
  const reader = response.body?.getReader(); if (!reader) return "";
  let bytes = 0, result = ""; const decoder = new TextDecoder("utf-8",{ fatal:true });
  try {
    while (true) {
      const { done,value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new ApiError(422,"GITHUB_CONTENT_TOO_LARGE","GitHub 응답이 가져오기 크기 제한을 넘었습니다."); }
      result += decoder.decode(value,{ stream:true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function importRepository(input: ReturnType<typeof parseRepositoryUrl>) {
  const signal = AbortSignal.timeout(8000);
  const base = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  async function request(suffix: string, raw = false, optional = false) {
    const response = await fetch(base + suffix, { signal, redirect:"manual", cache:"no-store", headers: {
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "User-Agent":"chwieop-jom-haja", "X-GitHub-Api-Version":"2026-03-10",
    } });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404 && optional) return null;
      if (response.status === 404) throw new ApiError(404,"GITHUB_REPOSITORY_NOT_FOUND","존재하지 않거나 접근할 수 없는 공개 저장소입니다.");
      if ([403,429].includes(response.status)) throw new ApiError(429,"GITHUB_RATE_LIMIT","GitHub 요청이 제한됐습니다. 잠시 후 다시 시도해주세요.");
      if ([301,302,307,308].includes(response.status)) throw new ApiError(422,"GITHUB_REPOSITORY_MOVED","저장소 주소가 변경됐습니다. 현재 GitHub 주소로 다시 입력해주세요.");
      throw new ApiError(502,"GITHUB_UNAVAILABLE","GitHub 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    const result = await text(response,raw ? 400*1024 : 64*1024);
    if (raw) return result;
    try { return JSON.parse(result) as unknown; }
    catch { throw new ApiError(502,"GITHUB_INVALID_RESPONSE","GitHub 응답을 읽을 수 없습니다."); }
  }
  try {
    const metadata = await request("") as { name?: unknown; description?: unknown; private?: unknown; full_name?: unknown } | null;
    if (!metadata || metadata.private !== false) throw new ApiError(404,"GITHUB_REPOSITORY_NOT_FOUND","공개 저장소만 가져올 수 있습니다.");
    if (typeof metadata.name !== "string" || typeof metadata.full_name !== "string" || (metadata.description !== null && typeof metadata.description !== "string")) throw new ApiError(502,"GITHUB_INVALID_RESPONSE","GitHub 저장소 정보를 읽을 수 없습니다.");
    let canonical;
    try { canonical = parseRepositoryUrl({ url:`https://github.com/${metadata.full_name}` }); }
    catch { throw new ApiError(502,"GITHUB_INVALID_RESPONSE","GitHub 저장소 주소를 읽을 수 없습니다."); }
    if (canonical.owner.toLowerCase() !== input.owner.toLowerCase() || canonical.repo.toLowerCase() !== input.repo.toLowerCase() || metadata.name !== canonical.repo) throw new ApiError(502,"GITHUB_INVALID_RESPONSE","GitHub 저장소 주소를 확인하지 못했습니다.");
    const [rawLanguages,readme] = await Promise.all([request("/languages"),request("/readme",true,true)]);
    if (!rawLanguages || typeof rawLanguages !== "object" || Array.isArray(rawLanguages)) throw new ApiError(502,"GITHUB_INVALID_RESPONSE","GitHub 사용 언어를 읽을 수 없습니다.");
    const entries = Object.entries(rawLanguages);
    if (entries.some(([name,bytes]) => !name || /\p{Cc}/u.test(name) || typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0)) throw new ApiError(502,"GITHUB_INVALID_RESPONSE","GitHub 사용 언어 응답이 올바르지 않습니다.");
    const languages = entries.sort((a,b) => Number(b[1])-Number(a[1]) || a[0].localeCompare(b[0])).map(([name]) => name);
    const body = `${typeof readme === "string" ? readme : ""}\n\n---\n\n원본 저장소: [${canonical.owner}/${canonical.repo}](${canonical.url})`.trim();
    let draft;
    try { draft = parseDraft({ record_type:"project",title:metadata.name,body,details:{ intro:metadata.description ?? "",tools:languages.join(", ") },tags:languages.filter((name) => name.trim()===name && Array.from(name).length<=30).slice(0,10) }); }
    catch { throw new ApiError(422,"GITHUB_CONTENT_INVALID","README와 출처를 합친 본문은 100,000자 이하, 설명·언어는 각 5,000자 이하의 허용된 문자여야 합니다. 원문을 직접 정리해주세요."); }
    return { draft,source_url:canonical.url,languages,readme_missing:readme===null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal.aborted) throw new ApiError(504,"GITHUB_TIMEOUT","GitHub 응답 시간이 초과됐습니다. 다시 시도해주세요.");
    throw new ApiError(502,"GITHUB_UNAVAILABLE","GitHub 연결 또는 응답 처리에 실패했습니다.");
  }
}
