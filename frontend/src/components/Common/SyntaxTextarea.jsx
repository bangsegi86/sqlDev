import React, { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { highlightTokens } from '../../utils/sqlHighlight.js';

const FONT_FAMILY  = 'var(--code-font)';
const FONT_SIZE    = 12;
const LINE_HEIGHT  = 1.55;
const LINE_NUM_W   = 44;   // px — matches read-mode column width
const PAD_V        = 8;    // top / bottom padding (px)
const PAD_H        = 8;    // left / right padding inside code area (px)

/**
 * Editable textarea with line numbers and syntax highlighting.
 *
 * Layout:
 *   ┌────────────┬────────────────────────────────┐
 *   │ line nums  │  highlighted-pre (visual only) │
 *   │ (44 px)    │  transparent textarea (input)  │
 *   └────────────┴────────────────────────────────┘
 *
 * Forwards ref to the inner <textarea> so callers can call
 * focus() / setSelectionRange() on it directly.
 */
const SyntaxTextarea = forwardRef(function SyntaxTextarea(
  { value = '', onChange, style = {}, ...rest },
  ref,
) {
  const textareaRef  = useRef(null);
  const highlightRef = useRef(null);
  const lineNumRef   = useRef(null);

  // Expose the raw <textarea> element via ref
  useImperativeHandle(ref, () => textareaRef.current, []);

  // Tokenize for syntax highlighting (memoised)
  const highlightNodes = useMemo(() => {
    const tokens = highlightTokens(value);
    return tokens.map((tok, i) =>
      tok.color
        ? <span key={i} style={{ color: tok.color }}>{tok.value}</span>
        : tok.value,
    );
  }, [value]);

  // Line numbers array
  const lineCount = useMemo(() => value.split('\n').length, [value]);

  // Keep highlight layer and line-num column in sync with textarea scroll
  function syncScroll() {
    const ta = textareaRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop  = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (lineNumRef.current) {
      // translateY so the numbers track vertical scroll without native scrollbar
      lineNumRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
  }

  // Styles shared between the highlight <pre> and the <textarea>
  const sharedCode = {
    position: 'absolute', inset: 0,
    margin: 0,
    paddingTop: PAD_V, paddingBottom: PAD_V,
    paddingLeft: PAD_H, paddingRight: PAD_H,
    fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT,
    whiteSpace: 'pre',       // no wrap → horizontal scroll, perfect line alignment
    tabSize: 2,
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'flex', flex: 1, overflow: 'hidden',
      background: 'var(--bg-primary)',
      ...style,
    }}>

      {/* ── Line-number column ── */}
      <div style={{
        width: LINE_NUM_W, flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Inner div moved via transform to track vertical scroll */}
        <div
          ref={lineNumRef}
          style={{
            paddingTop: PAD_V,
            willChange: 'transform',
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              style={{
                height: `${FONT_SIZE * LINE_HEIGHT}px`,
                lineHeight: `${FONT_SIZE * LINE_HEIGHT}px`,
                fontSize: FONT_SIZE,
                fontFamily: FONT_FAMILY,
                textAlign: 'right',
                paddingRight: 10,
                color: 'var(--text-dim)',
                userSelect: 'none',
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* ── Code area: highlight layer + textarea overlay ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Highlighted pre — visual only, never scrolls on its own */}
        <pre
          ref={highlightRef}
          aria-hidden="true"
          style={{
            ...sharedCode,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            pointerEvents: 'none',
            userSelect: 'none',
            border: 'none',
          }}
        >
          {highlightNodes}
          {'\n'}{/* ensure final empty line has height */}
        </pre>

        {/* Transparent textarea — captures all input and scroll */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{
            ...sharedCode,
            background: 'transparent',
            color: 'transparent',
            caretColor: '#4fc1ff',
            border: 'none',
            resize: 'none',
            outline: 'none',
            overflow: 'auto',
            WebkitTextFillColor: 'transparent',
          }}
          {...rest}
        />
      </div>
    </div>
  );
});

export default SyntaxTextarea;
