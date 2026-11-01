import { route } from '../../../../../lib/http.js';
import { aiStatus } from '../../../../../lib/ai/index.js';

export const GET = route(async () => aiStatus());
