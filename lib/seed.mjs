// First-run data for Job HQ. Empty on purpose: applications come from career-ops' applications.md,
// and contacts, notes and timeline entries are added from the web UI and kept in data/store.json.
import { parseScanHistory } from './parse.mjs';

export function buildSeed() {
  // Everything already in scan history counts as seen, so "New" only lights up after a rescan.
  const seenKeys = parseScanHistory().filter((r) => r.status === 'added').map((r) => r.url);
  return { version: 1, apps: {}, contacts: [], dismissed: {}, tracked: {}, seenKeys, filters: { hideStaff: true }, rates: null, scan: { last: null } };
}
