async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-JobHQ': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  state: () => call('GET', '/api/state'),
  prefs: () => call('GET', '/api/prefs'),
  savePrefs: (body) => call('POST', '/api/prefs', body),
  prepQueue: (url) => call('POST', '/api/prep/queue', { url }),
  prepApp: (id) => call('POST', '/api/prep/app', { id }),
  prepRetry: (url) => call('POST', '/api/prep/retry', { url }),
  prepRemove: (url) => call('POST', '/api/prep/remove', { url }),
  prepSettings: (body) => call('POST', '/api/prep/settings', body),
  scanStatus: () => call('GET', '/api/scan'),
  startScan: (since, scope) => call('POST', '/api/scan', { since, scope }),
  patchApp: (id, body) => call('PATCH', `/api/apps/${id}`, body),
  addEvent: (id, text) => call('POST', `/api/apps/${id}/events`, { text }),
  addApp: (body) => call('POST', '/api/apps', body),
  addContact: (body) => call('POST', '/api/contacts', body),
  patchContact: (id, body) => call('PATCH', `/api/contacts/${id}`, body),
  delContact: (id) => call('DELETE', `/api/contacts/${id}`),
  dismiss: (url, reason) => call('POST', '/api/jobs/dismiss', { url, reason }),
  restore: (url) => call('POST', '/api/jobs/restore', { url }),
  seen: (urls) => call('POST', '/api/jobs/seen', { urls }),
  setFilters: (body) => call('POST', '/api/filters', body),
};
