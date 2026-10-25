# 大英默写器 · 网页版

把桌面版「大英默写器」的核心功能搬进一个单文件网页：**打开就能用，不联网、不安装**。

- 词库：第二册 / 第三册，共 32 个单元、1815 条词条（内嵌在网页里）
- 模式：中文 → 英文 / 例句填空 / 听写（系统发音）
- 错题本：自动记录，保存在浏览器本地，支持复习
- 顺序、仅单词 / 仅短语、首字母提示、答错重试
- 电脑、手机都能用，支持深色模式

## 使用方法

**在线使用**：打开 GitHub Pages 地址（见仓库 About 或右侧 Environments）即可。

**本地使用**：下载 `index.html`，双击用浏览器打开。整个网页只有一个文件，断网也能用。

答题时在输入框里打英文，**回车提交**：

| 操作 | 说明 |
| --- | --- |
| 回车 / 提交 | 判分；答错后回车进入下一题 |
| 跳过 | 直接下一题，不计入错题 |
| Esc | 结束本轮 |
| 听写模式 | 点「🔊 重听」再播一遍 |

错题会按英文单词去重存进浏览器 localStorage，换浏览器或清缓存会丢失。复习时答对的词自动移出，答错的保留。

## 数据来源

词库与出题逻辑来自 [Lucent-Snow/ZJU-English-dictation-tool](https://github.com/Lucent-Snow/ZJU-English-dictation-tool)，感谢原作者。词库仅供个人学习使用。

## 开发

```bash
python build/build.py     # 把 data/**/*.csv 内联进 build/template.html，生成 index.html
node build/smoke.mjs      # 用 Edge 的 DevTools 协议跑一遍主要流程并截图
```

目录：

```
index.html          # 构建产物，自包含单文件（发布用）
data/book2, book3   # 词库 CSV（english,chinese,examples）
build/template.html # 页面模板与全部逻辑
build/build.py      # 构建脚本
build/smoke.mjs     # 冒烟测试
```

改词库：直接编辑 `data/` 下的 CSV，重新运行 `build.py`。例句里的 `[[单词]]` 会被替换成填空。
