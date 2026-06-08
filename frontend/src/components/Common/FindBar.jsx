import React from 'react';

const BTN = { padding: '3px 7px', fontSize: 11, minWidth: 28 };
const INPUT = {
  flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
  padding: '4px 8px', outline: 'none', fontFamily: 'var(--code-font)',
};

export default function FindBar({
  findInputRef,
  findText, replaceText, findCase, findRegex, matchIdx, matchCount,
  onFindChange, onReplaceChange, onToggleCase, onToggleRegex,
  onNext, onPrev, onReplaceOne, onReplaceAll, onClose,
  showReplace = true,
  style = {},
}) {
  return (
    <div
      style={{
        position: 'absolute', top: 8, right: 16, zIndex: 50,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)', minWidth: 340,
        ...style,
      }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          ref={findInputRef}
          placeholder="찾기"
          value={findText}
          onChange={e => onFindChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? onPrev() : onNext(); }
          }}
          style={INPUT}
        />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 56, textAlign: 'center' }}>
          {matchCount ? `${matchIdx + 1}/${matchCount}` : '0/0'}
        </span>
        <button className="btn-secondary" style={BTN} title="이전 (Shift+Enter)" onClick={onPrev} disabled={!matchCount}>▲</button>
        <button className="btn-secondary" style={BTN} title="다음 (Enter)" onClick={onNext} disabled={!matchCount}>▼</button>
        <button
          className="btn-secondary"
          style={{ ...BTN, background: findCase ? 'var(--accent)' : undefined, color: findCase ? '#06283a' : undefined }}
          title="대소문자 구분" onClick={onToggleCase}
        >Aa</button>
        <button
          className="btn-secondary"
          style={{ ...BTN, background: findRegex ? 'var(--accent)' : undefined, color: findRegex ? '#06283a' : undefined }}
          title="정규식" onClick={onToggleRegex}
        >.*</button>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}
          title="닫기 (Esc)" onClick={onClose}
        >✕</button>
      </div>
      {showReplace && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            placeholder="바꾸기"
            value={replaceText}
            onChange={e => onReplaceChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onReplaceOne(); } }}
            style={INPUT}
          />
          <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={onReplaceOne} disabled={!matchCount}>바꿈</button>
          <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={onReplaceAll} disabled={!matchCount}>모두 바꿈</button>
        </div>
      )}
    </div>
  );
}
