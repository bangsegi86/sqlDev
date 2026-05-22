import React, { useEffect, useRef, useState } from 'react';

const ITEM_H    = 26; // px per row
const FOOTER_H  = 22; // px for hint footer
const MAX_VISIBLE = 10;

const TYPE_META = {
  TABLE:     { color: '#66bb6a', icon: '⊞' },
  VIEW:      { color: '#42a5f5', icon: '⊟' },
  PROCEDURE: { color: '#ab47bc', icon: '⚙' },
  FUNCTION:  { color: '#ffa726', icon: 'ƒ' },
  SEQUENCE:  { color: '#4dd0e1', icon: '#' },
  COLUMN:    { color: '#9e9e9e', icon: '·' },
};

export default function AutocompleteDropdown({
  items,        // [{ name, type }]
  filter,       // current typed prefix
  anchorRect,   // { top, left, bottom } from getBoundingClientRect of textarea
  onSelect,     // (name) => void
  onDismiss,    // () => void
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef(null);

  const filtered = filter
    ? items.filter(it => it.name.toUpperCase().startsWith(filter.toUpperCase()))
    : items;

  // Reset active index when filter changes
  useEffect(() => { setActiveIdx(0); }, [filter, items.length]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[activeIdx];
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[activeIdx]) onSelect(filtered[activeIdx].name);
      } else if (e.key === 'Escape') {
        onDismiss();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [filtered, activeIdx, onSelect, onDismiss]);

  if (!filtered.length) return null;

  // Position: appear below cursor, flip up if near bottom of viewport
  const vpH = window.innerHeight;
  const dropH = Math.min(filtered.length, MAX_VISIBLE) * ITEM_H + FOOTER_H;
  const spaceBelow = vpH - anchorRect.bottom;
  const top = spaceBelow >= dropH + 4
    ? anchorRect.bottom + 2
    : anchorRect.top - dropH - 2;

  return (
    <div
      style={{
        position: 'fixed',
        top, left: anchorRect.left,
        minWidth: 240, maxWidth: 400,
        height: dropH,
        background: '#252526',
        border: '1px solid #454545',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
      // prevent blur on textarea when clicking
      onMouseDown={e => e.preventDefault()}
    >
      <div
        ref={listRef}
        style={{ overflow: 'auto', flex: 1 }}
      >
        {filtered.map((item, i) => {
          const meta = TYPE_META[item.type] || TYPE_META.TABLE;
          const active = i === activeIdx;
          return (
            <div
              key={`${item.type}-${item.name}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => onSelect(item.name)}
              style={{
                height: ITEM_H,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px',
                cursor: 'pointer',
                background: active ? '#094771' : 'transparent',
                fontSize: 12,
                fontFamily: 'var(--code-font)',
              }}
            >
              <span style={{ color: meta.color, fontSize: 11, width: 14, textAlign: 'center', flexShrink: 0 }}>
                {meta.icon}
              </span>
              <span style={{ color: active ? '#fff' : 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {/* bold-highlight the matched prefix */}
                {filter ? (
                  <>
                    <b style={{ color: active ? '#fff' : 'var(--accent-bright)' }}>{item.name.slice(0, filter.length)}</b>
                    {item.name.slice(filter.length)}
                  </>
                ) : item.name}
              </span>
              <span style={{ color: '#555', fontSize: 10, flexShrink: 0 }}>{item.type}</span>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '2px 8px', borderTop: '1px solid #3e3e42',
        fontSize: 10, color: '#555', display: 'flex', gap: 8,
        background: '#1e1e1e', flexShrink: 0,
      }}>
        <span>↑↓ 이동</span>
        <span>Enter/Tab 선택</span>
        <span>Esc 닫기</span>
        <span style={{ marginLeft: 'auto' }}>{filtered.length}건</span>
      </div>
    </div>
  );
}
