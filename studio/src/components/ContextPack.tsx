import { useMemo, useState } from 'react';
import { marked } from 'marked';
import { useStore } from '../store';
import { api } from '../api';
import { contextPack, countChars } from '../lib/analysis';
import { useMentions } from '../lib/derived';
import { Modal, Seg } from './ui';
import { Icon } from './Icon';

/** 写作上下文：把第 N 章需要的设定、人物当时状态、伏笔打包成一份 markdown */
export function ContextPackModal() {
  const n = useStore((s) => s.contextFor)!;
  const data = useStore((s) => s.data);
  const texts = useStore((s) => s.texts);
  const docs = useStore((s) => s.docs);
  const close = useStore((s) => s.openContext);
  const toast = useStore((s) => s.toast);
  const { charM, locM } = useMentions();
  const [mode, setMode] = useState<'preview' | 'raw'>('preview');
  const md = useMemo(() => contextPack(data, texts, charM, locM, n, docs), [data, texts, charM, locM, n, docs]);
  const rel = `story/context/chap${String(n).padStart(2, '0')}.md`;

  return (
    <Modal
      icon="spark"
      title={`第 ${n} 章 · 写作上下文`}
      onClose={() => close(null)}
      width={920}
      foot={
        <>
          <span className="faint" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            约 {countChars(md)} 字。保存后，在 Claude 里说“读 {rel} 再写第 {n} 章”即可。
          </span>
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(md);
              toast('已复制到剪贴板', 'ok');
            }}
          >
            <Icon name="copy" size={15} /> 复制
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await api.writeDoc(rel, md);
              toast(`已保存到 ${rel}`, 'ok');
            }}
          >
            <Icon name="save" size={15} /> 保存到 {rel}
          </button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 10 }}>
        <Seg value={mode} onChange={setMode} options={[{ value: 'preview', label: '预览' }, { value: 'raw', label: 'Markdown' }]} />
      </div>
      {mode === 'preview' ? (
        <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(md) as string }} />
      ) : (
        <pre className="selectable mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, margin: 0 }}>
          {md}
        </pre>
      )}
    </Modal>
  );
}
