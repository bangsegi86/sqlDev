import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useApp, openTab } from '../../store/AppContext.jsx';

const TYPE_ICONS = { sql: '⊢', table: '▦', source: '{}', sequence: '∞', synonym: '≡' };

// ── Context menu ──────────────────────────────────────────────────────────────

function ContextMenu({ x, y, tabId, tabs, onClose, onCloseAll, onCloseToRight, onDismiss }) {
  const ref = useRef(null);
  const isLast = tabs[tabs.length - 1]?.id === tabId;

  // Flip up if near bottom of viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${y - rect.height}px`;
    }
  }, [y]);

  const item = (label, onClick, danger) => (
    <div
      onClick={onClick}
      style={{
        padding: '6px 14px', cursor: 'pointer', fontSize: 12,
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{label}</div>
  );

  return (
    <div
      ref={ref}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', top: y, left: x, zIndex: 3000,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        minWidth: 180, paddingBlock: 4,
      }}
    >
      {item('닫기', () => { onClose(); onDismiss(); })}
      {!isLast && item('오른쪽 탭 모두 닫기', () => { onCloseToRight(); onDismiss(); })}
      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
      {item('모두 닫기', () => { onCloseAll(); onDismiss(); }, true)}
    </div>
  );
}

// ── Tab list dropdown ─────────────────────────────────────────────────────────

function TabListDropdown({ tabs, activeTabId, anchor, onSelect, onClose, onCloseAll, onDismiss }) {
  const style = {
    position: 'fixed',
    top: anchor.bottom + 2,
    right: window.innerWidth - anchor.right,
    zIndex: 3000,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    minWidth: 240, maxWidth: 380,
    maxHeight: 420, overflowY: 'auto',
  };

  return (
    <div style={style} onMouseDown={e => e.stopPropagation()}>
      {tabs.length === 0 && (
        <div style={{ padding: '8px 12px', color: 'var(--text-dim)', fontSize: 12 }}>열린 탭 없음</div>
      )}
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => { onSelect(tab.id); onDismiss(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', cursor: 'pointer', fontSize: 12,
            background: tab.id === activeTabId ? 'var(--bg-selected)' : 'transparent',
            color: tab.id === activeTabId ? '#fff' : 'var(--text-primary)',
          }}
          onMouseEnter={e => { if (tab.id !== activeTabId) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { if (tab.id !== activeTabId) e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>
            {TYPE_ICONS[tab.type] || '○'}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tab.title}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onClose(tab.id); }}
            style={{ background: 'none', color: 'var(--text-dim)', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
          >×</button>
        </div>
      ))}
      {tabs.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div
            onClick={() => { onCloseAll(); onDismiss(); }}
            style={{ padding: '5px 12px', cursor: 'pointer', fontSize: 11, color: 'var(--danger)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >모두 닫기</div>
        </>
      )}
    </div>
  );
}

// ── Individual Tab ────────────────────────────────────────────────────────────

function Tab({ tab, active, onActivate, onClose, onContextMenu }) {
  return (
    <div
      data-tabid={tab.id}
      onClick={onActivate}
      onAuxClick={e => e.button === 1 && onClose(e)}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', cursor: 'pointer', flexShrink: 0,
        background: active ? 'var(--bg-tab-active)' : 'var(--bg-tab-inactive)',
        borderRight: '1px solid var(--border)',
        borderTop: active ? '2px solid var(--accent-bright)' : '2px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 12, maxWidth: 180,
      }}
    >
      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{TYPE_ICONS[tab.type] || '○'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 13, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
      >×</button>
    </div>
  );
}

// ── TabBar ────────────────────────────────────────────────────────────────────

export default function TabBar() {
  const { state, dispatch } = useApp();
  const { tabs, activeTabId, activeConnectionId } = state;

  const scrollRef   = useRef(null);
  const listBtnRef  = useRef(null);

  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [listOpen,  setListOpen]  = useState(false);
  const [listAnchor, setListAnchor] = useState(null);
  const [menu, setMenu] = useState(null); // { x, y, tabId }

  // ── Scroll state ────────────────────────────────────────────────────────────

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => { checkScroll(); }, [tabs, checkScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeTabId) return;
    const activeEl = el.querySelector(`[data-tabid="${activeTabId}"]`);
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  // ── Close overlay on outside click ─────────────────────────────────────────

  useEffect(() => {
    if (!menu && !listOpen) return;
    function onDown() { setMenu(null); setListOpen(false); setListAnchor(null); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu, listOpen]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  function scroll(dir) {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  }

  function addSqlTab() {
    const id = `sql-${Date.now()}`;
    openTab(dispatch, state, { id, type: 'sql', title: 'SQL Editor', connectionId: activeConnectionId, content: { sql: '' } });
  }

  function closeTab(tabId) { dispatch({ type: 'CLOSE_TAB', payload: tabId }); }
  function closeAllTabs()  { dispatch({ type: 'CLOSE_ALL_TABS' }); }
  function closeToRight(tabId) { dispatch({ type: 'CLOSE_TABS_TO_RIGHT', payload: tabId }); }

  function openList(e) {
    e.stopPropagation();
    const rect = listBtnRef.current?.getBoundingClientRect();
    if (listOpen) { setListOpen(false); setListAnchor(null); }
    else          { setListOpen(true);  setListAnchor(rect); setMenu(null); }
  }

  function handleContextMenu(e, tabId) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, tabId });
    setListOpen(false);
  }

  // ── Shared button style ────────────────────────────────────────────────────

  const navBtn = (enabled, title, char, onClick) => (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '0 8px', background: 'none', flexShrink: 0,
        color: enabled ? 'var(--text-secondary)' : 'var(--text-dim)',
        fontSize: 16, opacity: enabled ? 1 : 0.35,
        cursor: enabled ? 'pointer' : 'default',
        borderRight: '1px solid var(--border)',
      }}
    >{char}</button>
  );

  return (
    <div style={{ display: 'flex', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflow: 'hidden' }}>
      {/* ◂ scroll left */}
      {navBtn(canScrollLeft,  '왼쪽으로 이동', '‹', () => canScrollLeft  && scroll(-1))}

      {/* Tab strip */}
      <div ref={scrollRef} className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
        {tabs.map(tab => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onActivate={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
            onClose={e => { e.stopPropagation(); closeTab(tab.id); }}
            onContextMenu={e => handleContextMenu(e, tab.id)}
          />
        ))}
      </div>

      {/* ▸ scroll right */}
      {navBtn(canScrollRight, '오른쪽으로 이동', '›', () => canScrollRight && scroll(1))}

      {/* ≡ tab list */}
      <button
        ref={listBtnRef}
        onClick={openList}
        title="탭 목록"
        style={{
          padding: '0 10px', background: listOpen ? 'var(--bg-hover)' : 'none',
          color: 'var(--text-secondary)', fontSize: 15, flexShrink: 0,
          borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
        }}
      >≡</button>

      {/* + new tab */}
      <button
        onClick={addSqlTab}
        title="새 SQL 에디터"
        style={{ padding: '0 10px', background: 'none', color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0 }}
      >+</button>

      {/* Tab list dropdown */}
      {listOpen && listAnchor && (
        <TabListDropdown
          tabs={tabs}
          activeTabId={activeTabId}
          anchor={listAnchor}
          onSelect={id => dispatch({ type: 'SET_ACTIVE_TAB', payload: id })}
          onClose={closeTab}
          onCloseAll={closeAllTabs}
          onDismiss={() => { setListOpen(false); setListAnchor(null); }}
        />
      )}

      {/* Right-click context menu */}
      {menu && (
        <ContextMenu
          x={menu.x} y={menu.y}
          tabId={menu.tabId}
          tabs={tabs}
          onClose={() => closeTab(menu.tabId)}
          onCloseAll={closeAllTabs}
          onCloseToRight={() => closeToRight(menu.tabId)}
          onDismiss={() => setMenu(null)}
        />
      )}
    </div>
  );
}
