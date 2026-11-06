import { useEffect, useMemo, useState } from 'react';

/**
 * 开屏：一颗星从左上划过夜空落到正中，亮一下，“星图书房”四个字依次浮出，然后整屏淡出。点一下跳过。
 * 计时从流星真正开始划的那一刻算起：App 刚启动时首帧可能要等一会儿，按挂载时间算会还没看到动画就淡出了。
 */
export function Splash({ onLeave, onDone }: { onLeave: () => void; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [started, setStarted] = useState(false);
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, () => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        r: Math.random() < 0.12 ? 2.2 : 1 + Math.random(),
        d: Math.random() * 2,
      })),
    [],
  );
  // 万一动画事件没来（比如系统关了动画），最多等 4 秒
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!started) return;
    const t1 = setTimeout(() => setLeaving(true), reduce ? 400 : 1900);
    return () => clearTimeout(t1);
  }, [started, reduce]);
  useEffect(() => {
    if (!leaving) return;
    onLeave();
    const t2 = setTimeout(onDone, 450);
    return () => clearTimeout(t2);
  }, [leaving, onLeave, onDone]);
  return (
    <div
      className={`splash ${leaving ? 'leaving' : ''} ${reduce ? 'still' : ''}`}
      onClick={() => setLeaving(true)}
      onAnimationStart={(e) => e.animationName === 'sp-draw' && setStarted(true)}
    >
      {stars.map((s, i) => (
        <i key={i} className="sp-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, animationDelay: `${s.d}s` }} />
      ))}
      <div className="sp-mark">
        <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden>
          <defs>
            <linearGradient id="sp-tail" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8c27a" stopOpacity="0" />
              <stop offset="1" stopColor="#f3dca6" />
            </linearGradient>
            <radialGradient id="sp-core">
              <stop offset="0" stopColor="#fff6dc" />
              <stop offset="0.45" stopColor="#f0cf86" />
              <stop offset="1" stopColor="#e8c27a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path className="sp-tail" d="M10 10 L112 112" stroke="url(#sp-tail)" strokeWidth="5" strokeLinecap="round" />
          <circle className="sp-glow" cx="118" cy="118" r="40" fill="url(#sp-core)" />
          <path className="sp-core" d="M118 96 123 113 140 118 123 123 118 140 113 123 96 118 113 113Z" fill="#fff8e6" />
        </svg>
      </div>
      <h1 className="sp-title">
        {[...'星图书房'].map((c, i) => (
          <span key={i} style={{ animationDelay: `${0.95 + i * 0.12}s` }}>
            {c}
          </span>
        ))}
      </h1>
      <div className="sp-sub">长篇小说的书房</div>
    </div>
  );
}
