import { useMemo, useState } from 'react';
import type { ForeshadowStatus } from '../../../shared/types';
import { latestDone } from '../../../src/lib/analysis';
import { useApp } from '../store';
import { Empty, Seg } from '../ui';

const STATUS: Record<ForeshadowStatus, string> = { open: '未收', resolved: '已收', dropped: '弃用' };

export function ForeshadowTab() {
  const book = useApp((s) => s.book)!;
  const go = useApp((s) => s.go);
  const [f, setF] = useState<'open' | 'resolved' | 'all'>('open');
  const done = latestDone(book.data.chapters);
  const list = useMemo(
    () =>
      book.data.foreshadows
        .filter((x) => f === 'all' || x.status === f)
        .map((x) => ({ x, overdue: x.status === 'open' && x.payoffChapters.length > 0 && Math.max(...x.payoffChapters) < done }))
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.x.planted[0] ?? 0) - (b.x.planted[0] ?? 0)),
    [book, f, done],
  );
  const read = (n: number) => go({ v: 'read', id: book.id, num: n });
  const count = (s: ForeshadowStatus) => book.data.foreshadows.filter((x) => x.status === s).length;
  return (
    <div className="tab-body">
      <div className="list-tools">
        <Seg
          value={f}
          onChange={setF}
          options={[
            { value: 'open', label: `未收 ${count('open')}` },
            { value: 'resolved', label: `已收 ${count('resolved')}` },
            { value: 'all', label: '全部' },
          ]}
        />
      </div>
      {list.length === 0 && <Empty title="没有伏笔" />}
      {list.map(({ x, overdue }) => (
        <section key={x.id} className={`card fs ${overdue ? 'overdue' : ''} ${x.status}`}>
          <div className="fs-text">{x.text}</div>
          <div className="fs-meta">
            <span className="fs-tag">{overdue ? '逾期' : STATUS[x.status]}</span>
            {x.planted.length > 0 && (
              <span>
                埋：
                {x.planted.map((n) => (
                  <button key={n} className="link" onClick={() => read(n)}>
                    {n}
                  </button>
                ))}
              </span>
            )}
            {x.status === 'resolved' && x.resolvedIn ? (
              <span>
                收：
                <button className="link" onClick={() => read(x.resolvedIn!)}>
                  {x.resolvedIn}
                </button>
              </span>
            ) : (
              x.payoffChapters.length > 0 && <span>计划收：{x.payoffChapters.join('、')}</span>
            )}
          </div>
          {x.payoff && <div className="fs-payoff">{x.payoff}</div>}
        </section>
      ))}
    </div>
  );
}
