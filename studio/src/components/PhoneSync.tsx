import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { SyncStatus } from '../../shared/types';
import { api } from '../api';
import { Icon } from './Icon';
import { Modal } from './ui';

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 标题栏上的“手机”按钮：同步服务开着时亮一个小点 */
export function PhoneSyncButton() {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<SyncStatus | null>(null);
  useEffect(() => {
    api.syncStatus().then(setSt);
    return api.onSynced(setSt);
  }, []);
  if (api.platform !== 'electron') return null;
  return (
    <>
      <button className="btn ghost sm no-drag phone-btn" title="手机同步" onClick={() => setOpen(true)}>
        <Icon name="phone" size={16} /> 手机
        {st?.running && <span className="phone-dot" />}
      </button>
      {open && <PhoneSyncModal initial={st} onChange={setSt} onClose={() => setOpen(false)} />}
    </>
  );
}

function PhoneSyncModal({ initial, onChange, onClose }: { initial: SyncStatus | null; onChange: (s: SyncStatus) => void; onClose: () => void }) {
  const [st, setSt] = useState(initial);
  const [ip, setIp] = useState(initial?.addresses[0] ?? '');
  const [qr, setQr] = useState('');
  const [, tick] = useState(0);
  const update = (s: SyncStatus | null) => {
    if (!s) return;
    setSt(s);
    onChange(s);
    if (!s.addresses.includes(ip)) setIp(s.addresses[0] ?? '');
  };
  useEffect(() => {
    api.syncStatus().then(update);
    const off = api.onSynced(update);
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => {
      off();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const url = st && ip ? `http://${ip}:${st.port}/#k=${st.key}` : '';
  useEffect(() => {
    if (!url) return setQr('');
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#10162b', light: '#ffffff' } }).then(setQr);
  }, [url]);

  if (!st) return null;
  return (
    <Modal title="手机同步" icon="phone" onClose={onClose} width={720}>
      {!st.enabled ? (
        <div className="col" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="muted">手机同步关着。开着的时候，同一个 Wi-Fi 下的手机在“星图书房”App 里点一下“同步”，就能把书架上所有书的最新正文、人物、大纲、设定拉过去，离线也能看。</div>
          <button className="btn primary" onClick={() => api.setSync(true).then(update)}>
            开启手机同步
          </button>
        </div>
      ) : (
        <div className="phone-sync">
          <div className="phone-qr">
            {qr ? <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="qr empty-qr">没有找到局域网地址</div>}
            {st.addresses.length > 1 && (
              <select className="select" value={ip} onChange={(e) => setIp(e.target.value)} title="电脑有好几个网卡时，选和手机同一个 Wi-Fi 的那个">
                {st.addresses.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            )}
            <div className="faint mono selectable" style={{ fontSize: 12 }}>
              {ip ? `${ip}:${st.port}` : ''}
            </div>
          </div>
          <div className="col" style={{ gap: 14, flex: 1, minWidth: 0 }}>
            <div>
              <div className="faint" style={{ fontSize: 12 }}>配对码</div>
              <div className="pair-code nums">{st.key}</div>
            </div>
            <ol className="phone-steps">
              <li>手机和这台电脑连同一个 Wi-Fi。</li>
              <li>
                <b>安卓</b>：用手机相机或浏览器扫左边的码，在打开的页面里{st.apk ? '下载安装' : '使用网页版（安装包还没打包）'}“星图书房”App；装好以后打开 App 点“同步”，它会自动找到这台电脑，第一次输入上面的配对码。
              </li>
              <li>
                <b>iPhone</b>：扫码直接用网页版，配对码已经带在码里了。
              </li>
              <li>以后在电脑上改完，手机上点一下“同步”就行，只拉改过的文件。</li>
            </ol>
            {st.error && (
              <div className="row" style={{ gap: 6, color: 'var(--danger)' }}>
                <Icon name="warn" size={15} /> {st.error}
              </div>
            )}
            <div className="faint" style={{ fontSize: 12 }}>
              {st.last ? `${ago(st.last.at)}，${st.last.from} 拉取了 ${st.last.files} 个文件` : '还没有手机来同步过'}
              {' · '}第一次开启时 Windows 可能会问要不要允许“星图书房”访问网络，选“专用网络”并允许。
            </div>
          </div>
        </div>
      )}
      {st.enabled && (
        <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost sm" onClick={() => api.resetSyncKey().then(update)} title="换了以后，已经配对的手机要重新输入">
            <Icon name="refresh" size={14} /> 换一个配对码
          </button>
          <button className="btn ghost sm" onClick={() => api.setSync(false).then(update)}>
            关闭手机同步
          </button>
        </div>
      )}
    </Modal>
  );
}
