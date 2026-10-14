# 落星传音

跨时空修仙日常小说（中文）：万年后的穷杂役林凡和万年前的青云圣女苏清月，只能在子时、在落星亭靠声音说话。

## 文件

- `bible.md`：设定集，世界观和规则的唯一来源（世界、落星亭、宗门、资质、功法、丹药、符箓、法器、法宝、炼器、炼丹、阵法、御兽、傀儡、紫气、命名规矩、跨线规则）
- `outline.md`：大纲（第一卷细到章，后续卷粗排）
- `progress.md`：写作进度、已写章节
- `chapters/`：正文，每章一个文件 `chapNN.md`
- `story/`：桌面软件“星图书房”的结构化数据，人物（含随章节变化的状态）、关系、地点、伏笔、剧情线、章节规划、世界脉络的唯一来源。`codex.json` 的设定条目只是引用 `bible.md` 的小节。`story/context/chapNN.md` 是为第 N 章生成的写作上下文（`node studio/scripts/cli.mjs context N`）
- `studio/`：星图书房的源码（Electron），用法见 `studio/README.md`
- `archive_v1/`：弃置的旧稿和旧设定，只作参考，不再维护，内容与新设定冲突时以新设定为准

写正文、改大纲或改设定时，使用 `novel-writer` skill（`.claude/skills/novel-writer/SKILL.md`）。
