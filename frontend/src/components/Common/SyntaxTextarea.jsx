import React, { useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { highlightTokens } from '../../utils/sqlHighlight.js';

/**
 * Editable textarea with syntax highlighting via the overlay technique:
 *   - A syntax-highlighted <pre> sits behind as a visual layer
 *   - A transparent <textarea> sits on top to capture input
 *   - Scroll positions are kept in sync
 *
 * Props match a plain <textarea>: value, onChange, style (for the wrapper), ...rest
 * Forwards ref to the underlying <textarea> element.
 */
const SyntaxTextarea = forwardRef(function SyntaxTextarea({ value, onChange, style = {}, ...rest }, ref) {
  const textareaRef = useRef(null);
  // Expose the inner textarea element via ref so callers can focus / setSelectionRange
  useImperativeHandle(ref, () => textareaRef.current, []);
  const highlightRef = useRef(null);

  // Build highlighted spans for each character of the source
  const highlightHtml = useMemo(() => {
    const tokens = highlightTokens(value || '');
    return tokens.map((tok, i) =>
      tok.color
        ? <span key={i} style={{ color: tok.color }}>{tok.value}</span>
        : <span key={i}>{tok.value}</span>
    );
  }, [value]);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop  = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Shared layout constants — must be identical on both layers
  const FONT_FAMILY = 'var(--code-font)';
  const FONT_SIZE   = 12;
  const LINE_HEIGHT = 1.55;
  const PADDING     = '8px 12px';

  const sharedStyle = {
    position: 'absolute', inset: 0,
    margin: 0, padding: PADDING,
    fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    tabSize: 2,
  };

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', ...style }}>
      {/* ── Highlighted layer (behind, pointer-events off) ── */}
      <pre
        ref={highlightRef}
        aria-hidden="true"
        style={{
          ...sharedStyle,
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          pointerEvents: 'none',
          userSelect: 'none',
          // Must match textarea border so glyphs align perfectly
          border: 'none',
        }}
      >
        {highlightHtml}
        {/* Trailing newline ensures the last empty line has height */}
        {'\n'}
      </pre>

      {/* ── Editable layer (on top, text transparent) ── */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{
          ...sharedStyle,
          background: 'transparent',
          color: 'transparent',
          caretColor: '#4fc1ff',
          border: 'none',
          resize: 'none',
          outline: 'none',
          // Prevent browser from showing its own spell-check highlights that misalign
          WebkitTextFillColor: 'transparent',
        }}
        {...rest}
      />
    </div>
  );
});

export default SyntaxTextarea;
