import { useMemo, useRef, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { termsOf } from '../lib/analysis';
import type { Character, Location } from '../../shared/types';

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 正文里的人名、地名、套话高亮 */
function highlighter(chars: Character[], locs: Location[], banned: string[]) {
  const color = new Map<string, { cls: string; color?: string; title: string }>();
  for (const l of locs) for (const t of termsOf(l)) color.set(t, { cls: 'cm-loc', title: `地点：${l.name}` });
  for (const c of chars) for (const t of termsOf(c)) color.set(t, { cls: 'cm-char', color: c.color, title: `人物：${c.name}` });
  for (const b of banned) if (b.trim()) color.set(b.trim(), { cls: 'cm-banned', title: '套话' });
  const terms = [...color.keys()].sort((a, b) => b.length - a.length);
  if (!terms.length) return [];
  const re = new RegExp(terms.map(escapeRe).join('|'), 'g');
  const cache = new Map<string, Decoration>();
  const deco = (t: string) => {
    if (!cache.has(t)) {
      const c = color.get(t)!;
      cache.set(t, Decoration.mark({ class: c.cls, attributes: { title: c.title, style: c.color ? `--c:${c.color}` : '' } }));
    }
    return cache.get(t)!;
  };
  const matcher = new MatchDecorator({ regexp: re, decoration: (m) => deco(m[0]) });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = matcher.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

const theme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', color: 'var(--text)', fontSize: '16.5px' },
  '.cm-scroller': { fontFamily: 'var(--font-read)', lineHeight: '2.0', padding: '28px 0 40vh' },
  '.cm-content': { maxWidth: '760px', margin: '0 auto', padding: '0 40px', caretColor: 'var(--gold)' },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--gold)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'rgba(232,194,122,0.28) !important' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { background: 'rgba(143,179,255,0.04)' },
});

export function ProseEditor({
  value,
  onChange,
  chars,
  locs,
  banned,
  onReady,
}: {
  value: string;
  onChange: (v: string) => void;
  chars: Character[];
  locs: Location[];
  banned: string[];
  onReady?: (v: EditorView) => void;
}) {
  const hl = useMemo(() => highlighter(chars, locs, banned), [chars, locs, banned]);
  const exts = useMemo(() => [markdown(), EditorView.lineWrapping, theme, hl], [hl]);
  const ref = useRef<EditorView | null>(null);
  useEffect(() => () => void (ref.current = null), []);
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={exts}
      theme="none"
      height="100%"
      style={{ height: '100%' }}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLineGutter: false, autocompletion: false, searchKeymap: true, bracketMatching: false, closeBrackets: false }}
      onCreateEditor={(v) => {
        ref.current = v;
        onReady?.(v);
      }}
    />
  );
}

export function jumpToLine(view: EditorView | null, line: number) {
  if (!view) return;
  const l = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
  view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
  view.focus();
}
