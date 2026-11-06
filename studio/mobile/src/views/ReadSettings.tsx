import type { CSSProperties } from 'react';
import { DEFAULT_READ, FONTS, LETTER_OPTS, LIMITS, LINE_OPTS, MARGIN_OPTS, PARA_OPTS, THEMES, TURN_OPTS, type ReadPrefs } from '../prefs';
import { useApp } from '../store';

/** 正文的排版样式，阅读页和设置预览共用 */
export function proseStyle(r: ReadPrefs): CSSProperties {
  return {
    fontFamily: FONTS.find((f) => f.id === r.font)?.family,
    fontSize: r.size,
    lineHeight: r.line,
    letterSpacing: `${r.letter}em`,
    paddingLeft: r.margin,
    paddingRight: r.margin,
    fontWeight: r.bold ? 600 : 400,
    ['--para' as string]: `${r.para}em`,
    ['--indent' as string]: r.indent ? '2em' : '0',
  };
}

function Opts<T extends number>({ value, opts, onPick }: { value: T; opts: { v: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="seg rs-seg">
      {opts.map((o) => (
        <button key={o.v} className={Math.abs(o.v - value) < 1e-6 ? 'on' : ''} onClick={() => onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ReadSettings() {
  const read = useApp((s) => s.read);
  const setRead = useApp((s) => s.setRead);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  return (
    <div className="rs">
      <div className="rs-row">
        <span className="rs-label">字号</span>
        <button className="btn rs-step" onClick={() => setRead({ size: read.size - 1 })} aria-label="缩小">
          A−
        </button>
        <input
          className="rs-range"
          type="range"
          min={LIMITS.size[0]}
          max={LIMITS.size[1]}
          value={read.size}
          onChange={(e) => setRead({ size: Number(e.target.value) })}
        />
        <button className="btn rs-step" onClick={() => setRead({ size: read.size + 1 })} aria-label="放大">
          A+
        </button>
        <span className="rs-val nums">{read.size}</span>
      </div>

      <div className="rs-row">
        <span className="rs-label">字体</span>
        <div className="rs-fonts">
          {FONTS.map((f) => (
            <button key={f.id} className={`rs-font ${read.font === f.id ? 'on' : ''}`} style={{ fontFamily: f.family }} onClick={() => setRead({ font: f.id })}>
              {f.name}
            </button>
          ))}
        </div>
      </div>

      <div className="rs-row top">
        <span className="rs-label">底色</span>
        <div className="rs-themes">
          {THEMES.map((t) => (
            <button key={t.id} className={`rs-theme ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>
              <span className="sw" style={{ background: t.bg, color: t.text }}>
                文
              </span>
              <span className="nm">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rs-row">
        <span className="rs-label">翻页</span>
        <div className="seg rs-seg">
          {TURN_OPTS.map((o) => (
            <button key={o.v} className={read.turn === o.v ? 'on' : ''} onClick={() => setRead({ turn: o.v })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rs-row">
        <span className="rs-label">行距</span>
        <Opts value={read.line} opts={LINE_OPTS} onPick={(line) => setRead({ line })} />
      </div>
      <div className="rs-row">
        <span className="rs-label">段距</span>
        <Opts value={read.para} opts={PARA_OPTS} onPick={(para) => setRead({ para })} />
      </div>
      <div className="rs-row">
        <span className="rs-label">字距</span>
        <Opts value={read.letter} opts={LETTER_OPTS} onPick={(letter) => setRead({ letter })} />
      </div>
      <div className="rs-row">
        <span className="rs-label">边距</span>
        <Opts value={read.margin} opts={MARGIN_OPTS} onPick={(margin) => setRead({ margin })} />
      </div>
      <div className="rs-row">
        <span className="rs-label">其他</span>
        <div className="rs-toggles">
          <button className={`btn ${read.indent ? 'on' : ''}`} onClick={() => setRead({ indent: !read.indent })}>
            首行缩进
          </button>
          <button className={`btn ${read.bold ? 'on' : ''}`} onClick={() => setRead({ bold: !read.bold })}>
            加粗
          </button>
          <button className={`btn ${read.fullscreen ? 'on' : ''}`} onClick={() => setRead({ fullscreen: !read.fullscreen })}>
            全屏阅读
          </button>
          <button className="btn ghost" onClick={() => setRead({ ...DEFAULT_READ, turn: read.turn })}>
            恢复默认
          </button>
        </div>
      </div>
    </div>
  );
}
