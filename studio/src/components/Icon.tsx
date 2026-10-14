// 线性图标，统一 1.6 描边
const P: Record<string, string> = {
  dashboard: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z',
  plot: 'M4 6h7M14 6h6M4 12h3M10 12h10M4 18h11M18 18h2M11 4v4M7 10v4M15 16v4',
  chapters: 'M6 4h9l3 3v13H6zM15 4v3h3M9 11h6M9 14h6M9 17h4',
  characters: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.9 3 2.9 3 5.5',
  locations: 'M3 20l5-11 4 6 3-4 6 9H3ZM15 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  timeline: 'M4 5c5 0 5 4 8 4s3-4 8-4M4 12c5 0 5 4 8 4s3-4 8-4M4 19h16',
  foreshadow: 'M3 18c2-9 7-13 9-13s7 4 9 13M3 18h2M19 18h2M12 5v3',
  codex: 'M4 5.5C6 4 9 4 12 5.5 15 4 18 4 20 5.5V19c-2-1.5-5-1.5-8 0-3-1.5-6-1.5-8 0ZM12 5.5V19',
  guard: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3Zm-3.5 9 2.5 2.5 4.5-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  pin: 'M9 4h6l-1 6 3 3v1H7v-1l3-3-1-6ZM12 14v6',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  graph: 'M6 6a2 2 0 1 0 0-.1M18 8a2 2 0 1 0 0-.1M12 18a2 2 0 1 0 0-.1M7.7 7l2.8 9.5M16.4 9.3 13.3 16.5M8 6.3l8.2 1.4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  heat: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM4 16h4v4H4z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  scroll: 'M7 4h11a2 2 0 0 1 0 4H7M7 4a2 2 0 0 0 0 4v10a2 2 0 0 0 2 2h9a2 2 0 0 0 0-4H9',
  check: 'M5 12l4.5 4.5L19 7',
  warn: 'M12 4 2.5 20h19L12 4Zm0 6v4m0 3v.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9v.01',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
};

export function Icon({ name, size = 18, stroke = 1.6, style }: { name: string; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden>
      <path d={P[name] ?? P.spark} />
    </svg>
  );
}

/** 品牌标：一颗坠落的星 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="bm-tail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8c27a" stopOpacity="0" />
          <stop offset="1" stopColor="#e8c27a" />
        </linearGradient>
        <radialGradient id="bm-core">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.5" stopColor="#f0cf86" />
          <stop offset="1" stopColor="#e8c27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M3 4 L21 21" stroke="url(#bm-tail)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="22" cy="22" r="7" fill="url(#bm-core)" />
      <path d="M22 16.5 23.3 20.7 27.5 22 23.3 23.3 22 27.5 20.7 23.3 16.5 22 20.7 20.7Z" fill="#fff8e6" />
    </svg>
  );
}
