import { databaseError, json, supabase, withApi } from "../../../../lib/api.ts";
import { ApiError, normalizeHandle, profileFields } from "../../../../lib/profile.ts";

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }): Promise<Response> {
  return withApi(async () => {
    const handle = normalizeHandle((await context.params).handle);
    const { data, error } = await supabase().from("profiles").select(profileFields).eq("handle", handle).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new ApiError(404, "PROFILE_NOT_FOUND", "프로필을 찾을 수 없습니다.");
    return json({ data });
  });
}
