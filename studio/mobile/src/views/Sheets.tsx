import { useState } from 'react';
import { useApp } from '../store';
import { Sheet } from '../ui';
import { ReadSettings } from './ReadSettings';

const close = () => useApp.getState().setSheet(null);

export function PairSheet() {
  const pending = useApp((s) => s.pending ?? s.server);
  const pair = useApp((s) => s.pair);
  const [code, setCode] = useState('');
  const ok = /^\d{6}$/.test(code);
  return (
    <Sheet title="输入配对码" onClose={close}>
      <p className="muted">
        找到了电脑{pending?.name ? `「${pending.name}」` : ''}。在电脑上的星图书房里点标题栏的“手机”，把那里显示的 6 位配对码填在这里。只需要填一次。
      </p>
      <input
        className="code-input nums"
        inputMode="numeric"
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && ok && pair(code)}
        placeholder="······"
      />
      <button className="btn primary block" disabled={!ok} onClick={() => pair(code)}>
        配对并同步
      </button>
    </Sheet>
  );
}

export function HostSheet() {
  const server = useApp((s) => s.server);
  const setHost = useApp((s) => s.setHost);
  const [v, setV] = useState(server?.host ?? '');
  return (
    <Sheet title="电脑地址" onClose={close}>
      <p className="muted">自动找不到电脑时（比如路由器拦了广播），在电脑上的星图书房里点标题栏的“手机”，把二维码下面的地址填在这里，比如 192.168.1.5:5210。</p>
      <input className="input" inputMode="url" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && setHost(v)} placeholder="192.168.1.5:5210" />
      <button className="btn primary block" disabled={!v.trim()} onClick={() => setHost(v)}>
        连接并同步
      </button>
    </Sheet>
  );
}

export function SettingsSheet() {
  const s = useApp();
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet title="设置" onClose={close}>
      <h4 className="set-sub">阅读</h4>
      <ReadSettings />
      <h4 className="set-sub">同步</h4>
      <div className="set-row">
        <span>电脑</span>
        <span className="grow muted ellipsis">{s.server ? `${s.server.name ?? ''} ${s.server.host}` : '还没连过'}</span>
      </div>
      <div className="set-actions">
        <button className="btn" onClick={() => s.setSheet('host')}>
          手动输入电脑地址
        </button>
        <button className="btn" disabled={!s.server} onClick={() => s.setSheet('pair')}>
          重新输入配对码
        </button>
        {confirm ? (
          <button className="btn danger" onClick={() => s.forget()}>
            确定清除？书会从手机上删掉，再同步一次就回来
          </button>
        ) : (
          <button className="btn ghost" onClick={() => setConfirm(true)}>
            清除手机上的数据
          </button>
        )}
      </div>
    </Sheet>
  );
}
