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
  getSchemaErd: (id, schema) => request(`/oracle/${id}/erd/${encodeURIComponent(schema)}`),
  getViewDDL: (id, schema, view) => request(`/oracle/${id}/views/${encodeURIComponent(schema)}/${encodeURIComponent(view)}/ddl`),
  getSource: (id, schema, type, name) => request(`/oracle/${id}/source/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}`),
  getObjectProperties: (id, schema, type, name) => request(`/oracle/${id}/source/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}/properties`),
  getSequenceInfo: (id, schema, name) => request(`/oracle/${id}/sequences/${encodeURIComponent(schema)}/${encodeURIComponent(name)}`),
  executeQuery: (id, sql, schema, page, limit) => request(`/oracle/${id}/query`, { method: 'POST', body: { sql, schema, page, limit } }),
  countQuery: (id, sql, schema) => request(`/oracle/${id}/count`, { method: 'POST', body: { sql, schema } }),
  explainQuery: (id, sql, schema) => request(`/oracle/${id}/explain`, { method: 'POST', body: { sql, schema } }),
  analyzeExplain: (id, plan) => request(`/oracle/${id}/explain/analyze`, { method: 'POST', body: { plan } }),
  analyzeProcedure: (id, schema, type, name) => request(`/oracle/${id}/analyze/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}`),
  compileSource: (id, schema, type, name) =>
    request(`/oracle/${id}/source/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}/compile`, { method: 'POST' }),
  saveSource: (id, schema, type, name, source) =>
    request(`/oracle/${id}/source/${encodeURIComponent(schema)}/${type}/${encodeURIComponent(name)}`, { method: 'PUT', body: { source } }),

  generateReorderScript: (id, schema, table, columnOrder) =>
    request(`/oracle/${id}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/reorder-script`, {
      method: 'POST', body: { columnOrder },
    }),
  executeScript: (id, statements, schema) =>
    request(`/oracle/${id}/execute-script`, { method: 'POST', body: { statements, schema } }),

  // Table specification export → triggers a file download (xlsx | pdf)
  exportTableSpec: async (id, schema, tables, format) => {
    const res = await fetch(`${BASE}/oracle/${id}/table-spec/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema, tables, format }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename="?([^"]+)"?/.exec(cd);
    const filename = m ? m[1] : `table_spec.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return { filename };
  },

  getBuildVersion: () => request('/build-version'),

  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: data }),
  getJdbcStatus: () => request('/settings/jdbc-status'),
  downloadJdbc: () => request('/settings/download-jdbc', { method: 'POST' }),
};
