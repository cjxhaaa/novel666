import { useEffect, type ReactNode } from 'react';
import { Icon } from '../../src/components/Icon';
import { useApp } from './store';

export { Icon };

export function ago(t?: number) {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  const d = new Date(t);
  const today = new Date();
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `今天 ${hm}`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hm}`;
}

export function TopBar({ title, sub, right, onBack }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onBack?: () => void }) {
  const back = useApp((s) => s.back);
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onBack ?? back} aria-label="返回">
        <Icon name="left" size={22} />
      </button>
      <div className="topbar-title">
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, [onClose]);
  return (
    <div className="sheet-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-grip" />
        <h3>{title}</h3>
        {children}
      </div>
    </div>
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

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
