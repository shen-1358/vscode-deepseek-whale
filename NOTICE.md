# 第三方归属声明

## DeepSeek-Balance-Whale-Widget（记账内核）

- 来源：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
- 许可：MIT License，Copyright (c) 2026 MeteorNOX
- 使用方式：`src/core/accounting.mjs` 为该仓库 `lib/accounting.mjs` 的**逐字节原样复制**，未做任何修改
- 校验：`sha256sum` 与上游 `main` 分支同名文件一致

该文件的完整 MIT 许可文本见仓库根 `LICENSE`（与本项目同一许可类型）。
本项目对上游代码未做修改，因此不产生衍生作品声明；若未来需要修改该文件，须在文件头保留上游版权声明。

## 未使用的上游资产

上游仓库 `assets/` 目录下的图片、动图与音效**不在 MIT 覆盖范围内**（见上游 `PROVENANCE.md`），
本项目**未使用**其中任何文件。

本项目 `media/activity-icon.svg`（Activity Bar 图标）为本项目原创，随本项目 MIT 许可发布。
`media/whale-*.png`（侧边栏的鲸鱼少女三态图）**不在 MIT 覆盖范围内**，按 CC BY-NC-SA 4.0 发布，
署名与改动说明见下文「鲸鱼少女形象」一节。

## 鲸鱼少女形象（侧边栏美术，CC BY-NC-SA 4.0）

### 来源

- 仓库：<https://github.com/Small-tailqwq/dsh-deep-whale>
- 路径：`maid-atelier/assets/icons/`
- **锁定 commit**：`80630009aee821fe69a9bcd1078c7098300f2c26`（素材可用 `tools/fetch-artwork.mjs` 按此 commit + sha256 重新取回）

### 署名链（上游 `maid-atelier/NOTICE` 声明，逐层转写）

| 层 | 作者 | 贡献 |
|---|---|---|
| 一次创作 | Pixiv 画师（<https://www.pixiv.net/users/62155430>） | 原始**鲸鱼少女角色设计** |
| 二次创作 | zipzip（<https://www.pixiv.net/users/18604994>） | 女仆版改设计（加入 DeepSeek 元素，GPT Image 2 生成） |
| 三次创作 | Small-tailqwq | 本皮肤素材（`assets/icons/`，2026-09-07 提供原图） |

### 许可

**CC BY-NC-SA 4.0**（署名—非商业—相同方式共享）。条款全文与边界见仓库根 `LICENSE-ARTWORK`。
**本项目为免费、非商业项目**，不满足该许可的商用条件时不得使用这些素材。

### 我们做的改动（CC BY 的"说明改动"义务）

| 改动 | 说明 |
|---|---|
| 缩放 | 长边缩到 **512px**（面积平均、alpha 加权），供侧边栏 240px 显示 |
| 裁剪 | 仅取原图内容，未裁切画面 |
| 转码 | 统一重编码为 RGBA8 PNG（去掉原文件的元数据块） |
| 用途 | 侧边栏三种状态的表情图；未做二次绘制或调色 |

改作部分同样以 CC BY-NC-SA 4.0 释出（见 `LICENSE-ARTWORK`）。

### 如实说明

- 上游声明这些素材为**使用者提供 / AI 生成或 AI 辅助**，上游亦不声称其为原创作品；
  本项目的署名链完全转写自上游 `NOTICE`，我们无法独立核实原始设计的权利状态。
- 上游 `PROVENANCE.md` 的做法是"收到权利主张即替换或移除"。本项目沿用同一承诺：
  **如权利人提出主张，我们会立即移除或替换上述素材**，不附加条件。
