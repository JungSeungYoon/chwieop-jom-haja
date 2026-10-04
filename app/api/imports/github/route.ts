import { authenticate,databaseError,json,readJson,withApi } from "../../../../lib/api.ts";
import { draftFields } from "../../../../lib/draft.ts";
import { importRepository,parseRepositoryUrl } from "../../../../lib/github-import.ts";
import { ApiError } from "../../../../lib/profile.ts";

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client,user } = await authenticate(request);
    const imported = await importRepository(parseRepositoryUrl(await readJson(request)));
    const { data,error } = await client.from("record_drafts").insert({ ...imported.draft,owner_id:user.id }).select(draftFields).single();
    if (error?.code === "23503") throw new ApiError(404,"PROFILE_NOT_FOUND","먼저 프로필을 등록해주세요.");
    if (error) databaseError(error);
    return json({ data,import:{ source_url:imported.source_url,languages:imported.languages,readme_missing:imported.readme_missing } },201);
  });
}
