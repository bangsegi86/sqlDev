import React from 'react';

export default function DataGrid({ columns = [], rows = [], onSort, sortColumn, sortDir }) {
  return (
    <div style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'auto' }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <th style={thStyle({ width: 44, cursor: 'default' })}>#</th>
            {columns.map(col => (
              <th
                key={col}
                style={thStyle({ cursor: onSort ? 'pointer' : 'default', whiteSpace: 'nowrap' })}
                onClick={() => onSort?.(col)}
              >
                {col}
                {sortColumn === col && (
                  <span style={{ marginLeft: 4, color: 'var(--accent-bright)' }}>
                    {sortDir === 'DESC' ? '▼' : '▲'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
              <td style={tdStyle({ color: 'var(--text-dim)', textAlign: 'right', userSelect: 'none' })}>{i + 1}</td>
              {columns.map(col => {
                const val = row[col];
                return (
                  <td key={col} style={tdStyle({ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                    {val === null || val === undefined
                      ? <span className="null-val">(null)</span>
                      : String(val)}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 20 }}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    background: 'var(--bg-panel)',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    padding: '5px 8px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    ...extra,
  };
}

function tdStyle(extra = {}) {
  return {
    padding: '3px 8px',
    borderBottom: '1px solid rgba(62,62,66,0.5)',
    borderRight: '1px solid rgba(62,62,66,0.3)',
    color: 'var(--text-primary)',
    ...extra,
  };
}
