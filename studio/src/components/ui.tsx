import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useStore } from '../store';
import { kindOf } from '../lib/analysis';

/** 印章式章节类型 */
export function Seal({ kind, size, solid }: { kind: string; size?: 'lg'; solid?: boolean }) {
  const k = useStore((s) => kindOf(s.data.project, kind));
  return (
    <span className={`seal ${size ?? ''} ${solid ? 'solid' : ''}`} style={{ ['--c' as any]: k?.color }} title={k?.description ?? k?.name}>
      {k?.name ?? '?'}
    </span>
  );
}

export function EraTag({ eraId }: { eraId: string | null | undefined }) {
  const era = useStore((s) => s.data.project.eras.find((e) => e.id === eraId));
  if (!era) return <span className="tag" style={{ ['--c' as any]: 'var(--gold)' }}>古今</span>;
  return (
    <span className="tag" style={{ ['--c' as any]: era.color }}>
      {era.name}
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 本地编辑、失焦或回车时提交，避免每个按键都写盘、进撤销栈 */
export function Edit({
  value,
  onCommit,
  multiline,
  placeholder,
  className = '',
  style,
  bare,
  autoFocus,
  rows,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  bare?: boolean;
  autoFocus?: boolean;
  rows?: number;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => setV(value), [value]);
  useLayoutEffect(() => {
    if (multiline && ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 2 + 'px';
    }
  }, [v, multiline]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  const common = {
    ref,
    value: v,
    placeholder,
    autoFocus,
    style,
    onChange: (e: any) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setV(value);
        (e.target as HTMLElement).blur();
      }
      if (e.key === 'Enter' && (!multiline || e.ctrlKey)) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
  };
  return multiline ? (
    <textarea {...common} rows={rows ?? 2} className={`textarea ${bare ? 'bare' : ''} ${className}`} />
  ) : (
    <input {...common} className={`input ${bare ? 'bare' : ''} ${className}`} />
  );
}

export function NumEdit({ value, onCommit, placeholder, min, style }: { value?: number; onCommit: (v: number | undefined) => void; placeholder?: string; min?: number; style?: React.CSSProperties }) {
  return (
    <Edit
      value={value == null ? '' : String(value)}
      placeholder={placeholder}
      style={{ width: 80, ...style }}
      onCommit={(s) => {
        const n = parseInt(s, 10);
        onCommit(Number.isFinite(n) ? Math.max(min ?? -Infinity, n) : undefined);
      }}
    />
  );
}

/** 用逗号或顿号分隔的章号列表 */
export function parseNums(s: string) {
  const out: number[] = [];
  for (const part of s.split(/[,，、\s]+/)) {
    const m = part.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i);
    else if (/^\d+$/.test(part)) out.push(+part);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const add = () => {
    const t = q.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setQ('');
  };
  return (
    <div className="chip-input">
      {values.map((v) => (
        <span className="tag" key={v}>
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      <input
        value={q}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => setQ(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            add();
          }
          if (e.key === 'Backspace' && !q && values.length) onChange(values.slice(0, -1));
        }}
      />
    </div>
  );
}

/** 可点击跳转的章号 */
export function ChapterLink({ num, children }: { num: number; children?: ReactNode }) {
  const go = useStore((s) => s.go);
  const ch = useStore((s) => s.data.chapters.find((c) => c.num === num));
  return (
    <span
      className="tag click"
      style={{ ['--c' as any]: 'var(--gold)' }}
      title={ch ? `第 ${num} 章 ${ch.title}` : `第 ${num} 章`}
      onClick={(e) => {
        e.stopPropagation();
        go('chapters', { chapter: num });
      }}
    >
      {children ?? `第${num}章`}
    </span>
  );
}

export function Modal({ title, onClose, children, foot, width, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; width?: number; icon?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="modal-head">
          {icon && <Icon name={icon} style={{ color: 'var(--gold)' }} />}
          <h2>{title}</h2>
          <span className="grow" />
          <button className="btn ghost icon" onClick={onClose} title="关闭 (Esc)">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, icon = 'spark' }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} stroke={1.2} />
      <div className="big">{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

export function ViewHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="view-head">
      <div className="col" style={{ gap: 4 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <span className="grow" />
      {children}
    </div>
  );
}

export function confirmDelete(what: string) {
  return window.confirm(`确定删除「${what}」吗？可以用 Ctrl+Z 撤销。`);
}
