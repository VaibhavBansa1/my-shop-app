// GST state codes, sorted, for pickers (web + mobile).
import { GST_STATES } from './gst.js';
export { GST_STATES };
export const STATE_LIST = Object.entries(GST_STATES).sort(([a], [b]) => a.localeCompare(b));
