import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useApp, openTab } from '../../store/AppContext.jsx';
import { useColResize } from '../../hooks/useColResize.js';
import ColContextMenu from '../Common/ColContextMenu.jsx';

const HEADERS = ['Constraint', 'Column', 'Ref Schema', 'Ref Table', 'Ref Column'];

export default function ReferencesTab({ connectionId, schema, tableName }) {
  const { state, dispatch } = useApp();
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const { colWidths, hasWidths, menu, openMenu, closeMenu, resetWidths, fitToData, fitToHeader, fitToScreen, startResize } =
    useColResize(HEADERS);

  useEffect(() => {
    setLoading(true);
    api.getTableReferences(connectionId, schema, tableName)
      .then(setRefs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [connectionId, schema, tableName]);

  if (loading) return <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading references...</div>;
  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;
  if (refs.length === 0) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>No foreign key references</div>;

  function goToTable(rSchema, rTable) {
    openTab(dispatch, state, {
      id: `TABLE-${connectionId}-${rSchema}-${rTable}`, type: 'table', title: rTable,
      connectionId, content: { schema: rSchema, objectType: 'TABLE', name: rTable, activeTab: 'columns' },
    });
  }

  function handleFitData() {
    fitToData(refs.map(ref => ({
      'Constraint': ref.CONSTRAINT_NAME ?? '',
      'Column': ref.COLUMN_NAME ?? '',
      'Ref Schema': ref.R_OWNER ?? '',
      'Ref Table': ref.R_TABLE ?? '',
      'Ref Column': ref.R_COLUMN ?? '',
    })));
  }

  function handleFitScreen() {
    fitToScreen(containerRef.current?.clientWidth ?? 600, 0);
  }

  return (
    <div ref={containerRef} style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, tableLayout: hasWidths ? 'fixed' : 'auto' }}>
        {hasWidths && (
          <colgroup>
            {HEADERS.map(h => <col key={h} style={{ width: colWidths[h] }} />)}
          </colgroup>
        )}
        <thead>
          <tr>
            {HEADERS.map(h => (
              <th key={h} style={{ ...thStyle, ...(colWidths[h] ? { width: colWidths[h] } : {}), position: 'relative' }} onContextMenu={openMenu}>
                {h}
                <div
                  style={{ position: 'absolute', right: 0, top: 0, width: 5, height: '100%', cursor: 'col-resize', zIndex: 1 }}
                  onMouseDown={e => startResize(e, h)}
                  onContextMenu={e => e.stopPropagation()}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {refs.map((ref, i) => (
            <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
              <td style={tdStyle({ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{ref.CONSTRAINT_NAME}</td>
              <td style={tdStyle({ color: 'var(--fk-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{ref.COLUMN_NAME}</td>
              <td style={tdStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{ref.R_OWNER}</td>
              <td style={tdStyle()}>
                <span
                  style={{ cursor: 'pointer', color: 'var(--accent-bright)', textDecoration: 'underline' }}
                  onClick={() => goToTable(ref.R_OWNER, ref.R_TABLE)}
                >{ref.R_TABLE}</span>
              </td>
              <td style={tdStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{ref.R_COLUMN}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ColContextMenu
        menu={menu}
        onClose={closeMenu}
        onFitData={handleFitData}
        onFitHeader={fitToHeader}
        onFitScreen={handleFitScreen}
        onReset={resetWidths}
        hasWidths={hasWidths}
      />
    </div>
  );
}

const thStyle = { background: 'var(--bg-panel)', color: 'var(--text-secondary)', fontWeight: 600, padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', position: 'sticky', top: 0, userSelect: 'none' };
function tdStyle(extra = {}) { return { padding: '3px 8px', borderBottom: '1px solid rgba(62,62,66,0.5)', borderRight: '1px solid rgba(62,62,66,0.3)', ...extra }; }
