import { authenticate, databaseError, json, withApi } from "../../../lib/api.ts";
import { profileFields } from "../../../lib/profile.ts";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const { client, user } = await authenticate(request);
    const { data, error } = await client.from("profiles").select(profileFields).eq("id", user.id).maybeSingle();
    if (error) databaseError(error);
    return json({ data: { user: { id: user.id }, profile: data, needs_profile: !data } });
  });
}
