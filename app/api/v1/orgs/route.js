import { route, readJson, json } from '../../../../lib/http.js';
import { orgCreateChecked } from '../../../../lib/validation.js';
import { createOrg, listMyOrgs } from '../../../../lib/services/orgs.js';

export const GET = route(async ({ user }) => ({ orgs: await listMyOrgs(user.id) }));
export const POST = route(async ({ request, user }) => {
  const body = orgCreateChecked.parse(await readJson(request));
  return json(await createOrg(user.id, body), 201);
});
