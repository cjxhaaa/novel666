import type { View } from './store';

export const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: '总览', icon: 'dashboard' },
  { id: 'plot', label: '剧情线', icon: 'plot' },
  { id: 'chapters', label: '章节', icon: 'chapters' },
  { id: 'characters', label: '人物', icon: 'characters' },
  { id: 'locations', label: '地点', icon: 'locations' },
  { id: 'timeline', label: '脉络', icon: 'timeline' },
  { id: 'foreshadow', label: '伏笔', icon: 'foreshadow' },
  { id: 'codex', label: '设定', icon: 'codex' },
  { id: 'guard', label: '守卫', icon: 'guard' },
];
