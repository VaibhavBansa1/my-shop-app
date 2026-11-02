import { route } from '../../../../../../lib/http.js';
import { flagsFor } from '../../../../../../lib/flags.js';

// Which optional features are switched on for this business (the UI hides the rest).
export const GET = route(async ({ orgId }) => flagsFor(orgId), { action: 'org.read' });
