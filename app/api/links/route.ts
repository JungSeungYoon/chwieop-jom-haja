import { authenticate, json, readJson, withApi } from "../../../lib/api.ts";
import { linkError, parseLink } from "../../../lib/link.ts";

async function change(request: Request, linked: boolean): Promise<Response> {
  return withApi(async () => {
    const { client } = await authenticate(request);
    const input = parseLink(await readJson(request));
    const { data, error } = await client.rpc("set_record_link", { ...input, p_linked: linked });
    if (error) linkError(error);
    return json({ data: data?.[0] });
  });
}
export async function PUT(request: Request) { return change(request,true); }
export async function DELETE(request: Request) { return change(request,false); }
