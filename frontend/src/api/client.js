const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  getConnections: () => request('/connections'),
  createConnection: (data) => request('/connections', { method: 'POST', body: data }),
  updateConnection: (id, data) => request(`/connections/${id}`, { method: 'PUT', body: data }),
  deleteConnection: (id) => request(`/connections/${id}`, { method: 'DELETE' }),

  testConnection: (data) => request('/oracle/test', { method: 'POST', body: data }),
  connect: (id) => request(`/oracle/connect/${id}`, { method: 'POST' }),
  disconnect: (id) => request(`/oracle/disconnect/${id}`, { method: 'POST' }),
  reconnect: (id) => request(`/oracle/reconnect/${id}`, { method: 'POST' }),
  getStatus: () => request('/oracle/status'),

  getSchemas: (id) => request(`/oracle/${id}/schemas`),
  getObjects: (id, schema, type) => request(`/oracle/${id}/objects?schema=${encodeURIComponent(schema)}&type=${type}`),
  getColumns: (id, schema, table) => request(`/oracle/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns`),
  getTableData: (id, schema, table, params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))).toString();
    return request(`/oracle/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/data${qs ? `?${qs}` : ''}`);
  },
  getTableDDL: (id, schema, table) => request(`/oracle/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/ddl`),
  getTableReferences: (id, schema, table) => request(`/oracle/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/references`),
  getViewDDL: (id, schema, view) => request(`/oracle/${id}/views/${encodeURIComponent(schema)}/${encodeURIComponent(view)}/ddl`),
  getSource: (id, schema, type, name) => request(`/oracle/${id}/source/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}`),
  getObjectProperties: (id, schema, type, name) => request(`/oracle/${id}/source/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}/properties`),
  getSequenceInfo: (id, schema, name) => request(`/oracle/${id}/sequences/${encodeURIComponent(schema)}/${encodeURIComponent(name)}`),
  executeQuery: (id, sql, schema) => request(`/oracle/${id}/query`, { method: 'POST', body: { sql, schema } }),
};
