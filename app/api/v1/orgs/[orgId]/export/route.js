import { route, json } from '../../../../../../lib/http.js';
import { exportOrganization } from '../../../../../../lib/services/exportData.js';
import { securityEvent } from '../../../../../../lib/services/securityLog.js';

// Owners and admins can download everything in their business as JSON.
export const GET = route(async ({ db, user }) => {
  const data = await exportOrganization(db);
  await securityEvent('export.downloaded', { userId: user.id, orgId: db.orgId });
  const name = `${data.organization.name}-backup-${data.exportedAt.slice(0, 10)}.json`.replace(/[^\w.-]+/g, '-');
  return json(data, 200, { 'content-disposition': `attachment; filename="${name}"` });
}, { action: 'org.update' });
