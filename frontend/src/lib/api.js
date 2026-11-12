// Small client for the ORBIT API (backend/). In dev, Vite forwards /api to port 8010.
const BASE = import.meta.env.VITE_API_URL ?? '/api'

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null)
    throw new Error(typeof detail === 'string' ? detail : `API error ${res.status}`)
  }
  return res.json()
}

// POST that streams NDJSON lines (the assistant's answer); calls onLine for each parsed line.
async function stream(path, body, onLine) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null)
    throw new Error(typeof detail === 'string' ? detail : `API error ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) if (line.trim()) onLine(JSON.parse(line))
  }
  if (buffer.trim()) onLine(JSON.parse(buffer))
}

export const api = {
  assistantStatus: () => request('/assistant/status'),
  ask: (body, onLine) => stream('/assistant/ask', body, onLine),
  mission: (id) => request(`/mission/${id}`),
  day: (id, n) => request(`/mission/${id}/day/${n}`),
  days: (id) => request(`/mission/${id}/days`),
  analysis: (id, n) => request(`/analysis/${id}/day/${n}`),
  timeline: (id) => request(`/timeline/${id}`),
  checkin: (payload) => request('/checkin', { method: 'POST', body: JSON.stringify(payload) }),
  whatif: (body) => request('/whatif', { method: 'POST', body: JSON.stringify(body) }),
  plan: (body) => request('/plan', { method: 'POST', body: JSON.stringify(body) }),
  alert: (id, n) => request(`/alert/${id}/day/${n}`),
  ack: (id, n) => request(`/alert/${id}/day/${n}/ack`, { method: 'POST' }),
  tick: (id, n, actionId, done) =>
    request(`/alert/${id}/day/${n}/actions/${actionId}`, { method: 'POST', body: JSON.stringify({ done }) }),
}
