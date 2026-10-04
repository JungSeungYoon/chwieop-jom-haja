import { authenticate, databaseError, json, readJson, withApi } from "../../../lib/api.ts";
import { ApiError, parseProfile, profileFields } from "../../../lib/profile.ts";

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const input = parseProfile(await readJson(request), "create");
    const { data, error } = await client.from("profiles").insert({ ...input, id: user.id }).select(profileFields).single();
    if (error) databaseError(error);
    return json({ data }, 201);
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const input = parseProfile(await readJson(request), "update");
    const { data, error } = await client.from("profiles").update(input).eq("id", user.id).select(profileFields).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new ApiError(404, "PROFILE_NOT_FOUND", "먼저 프로필을 등록해주세요.");
    return json({ data });
  });
}
