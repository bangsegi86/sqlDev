import React, { useState, useRef, useCallback } from 'react';

export default function DataGrid({ columns = [], rows = [], onSort, sortColumn, sortDir }) {
  const [colWidths, setColWidths] = useState({});
  const containerRef = useRef(null);
  const hasWidths = Object.keys(colWidths).length > 0;

  function fitToData() {
    const pad = 24;
    const charW = 7.5;
    const newW = {};
    columns.forEach(col => {
      const maxLen = Math.max(
        col.length,
        ...rows.map(row => { const v = row[col]; return v == null ? 6 : String(v).length; })
      );
      newW[col] = Math.min(Math.max(Math.ceil(maxLen * charW) + pad, 60), 400);
    });
    setColWidths(newW);
  }

  function fitToHeader() {
    const newW = {};
    columns.forEach(col => { newW[col] = Math.max(col.length * 8 + 24, 60); });
    setColWidths(newW);
  }

  function fitToScreen() {
    if (!containerRef.current || !columns.length) return;
    const w = Math.max(Math.floor((containerRef.current.clientWidth - 44) / columns.length), 60);
    const newW = {};
    columns.forEach(col => { newW[col] = w; });
    setColWidths(newW);
  }

  const startResize = useCallback((e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = e.currentTarget.parentElement.offsetWidth;
    function onMove(ev) {
      setColWidths(prev => ({ ...prev, [col]: Math.max(40, startW + ev.clientX - startX) }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '3px 8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, flexShrink: 0 }}>
        <span style={{ color: 'var(--text-secondary)' }}>열 너비:</span>
        <button className="btn-secondary" onClick={fitToData} style={{ padding: '1px 7px' }}>데이터에 맞추기</button>
        <button className="btn-secondary" onClick={fitToHeader} style={{ padding: '1px 7px' }}>컬럼명에 맞추기</button>
        <button className="btn-secondary" onClick={fitToScreen} style={{ padding: '1px 7px' }}>화면에 맞추기</button>
        {hasWidths && (
          <button className="btn-secondary" onClick={() => setColWidths({})} style={{ padding: '1px 7px', color: 'var(--text-dim)' }}>초기화</button>
        )}
      </div>
      <div ref={containerRef} style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: hasWidths ? 'fixed' : 'auto' }}>
          {hasWidths && (
            <colgroup>
              <col style={{ width: 44 }} />
              {columns.map(col => <col key={col} style={{ width: colWidths[col] }} />)}
            </colgroup>
          )}
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={thStyle({ width: 44, cursor: 'default' })}>#</th>
              {columns.map(col => (
                <th
                  key={col}
                  style={thStyle({ cursor: onSort ? 'pointer' : 'default', whiteSpace: 'nowrap', position: 'relative', userSelect: 'none' })}
                  onClick={() => onSort?.(col)}
                >
                  {col}
                  {sortColumn === col && (
                    <span style={{ marginLeft: 4, color: 'var(--accent-bright)' }}>
                      {sortDir === 'DESC' ? '▼' : '▲'}
                    </span>
                  )}
                  <div
                    style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'col-resize', zIndex: 2 }}
                    onMouseDown={e => startResize(e, col)}
                    onClick={e => e.stopPropagation()}
                  />
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
                    <td key={col} style={tdStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
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
