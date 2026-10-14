import { useMemo } from 'react';
import { useStore } from '../store';
import { runGuard, scanMentions, type Issue, type MentionMap } from './analysis';

// 扫描正文的代价不小，按输入对象的引用做单例缓存，多个组件共享一次计算。
let mKey: unknown[] = [];
let mVal: { charM: MentionMap; locM: MentionMap } | null = null;

function same(a: unknown[], b: unknown[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function useMentions() {
  const texts = useStore((s) => s.texts);
  const chars = useStore((s) => s.data.characters);
  const locs = useStore((s) => s.data.locations);
  return useMemo(() => {
    const key = [texts, chars, locs];
    if (!mVal || !same(key, mKey)) {
      mVal = { charM: scanMentions(chars, texts), locM: scanMentions(locs, texts) };
      mKey = key;
    }
    return mVal;
  }, [texts, chars, locs]);
}

let gKey: unknown[] = [];
let gVal: Issue[] = [];

export function useIssues() {
  const data = useStore((s) => s.data);
  const texts = useStore((s) => s.texts);
  const docs = useStore((s) => s.docs);
  const { charM, locM } = useMentions();
  return useMemo(() => {
    const key = [data, texts, charM, locM, docs];
    if (!same(key, gKey)) {
      gVal = runGuard(data, texts, charM, locM, docs);
      gKey = key;
    }
    return gVal;
  }, [data, texts, charM, locM, docs]);
}
