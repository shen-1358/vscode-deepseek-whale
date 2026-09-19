# 鲸鱼少女形象落地 · 完成报告（Task 13）

- 计划：`docs/superpowers/plans/2026-09-19-whale-girl-artwork.md`（Task 13 在 L1934-L1996）
- 分支：`feat/1-whale-girl-artwork`
- 本报告落盘时的基点 HEAD：`d854cc1`（`chore(media): 退役几何占位鲸鱼（真实形象已就位）`）
- 环境：Windows / Node v22.23.2 / npm 10.9.8
- 结论：**Step 1、2、3、6 通过**；**Step 4（真实 VSCode + 真密钥人工验收）标记为「待人工验收」**；**Step 5（`git tag v0.1.0`）推迟到人工验收之后**（按 controller 指示执行）。

---

## 一、逐条验收结果

### Step 1 清理重装 + 全量测试 —— ✅ 通过

```bash
rm -rf node_modules dist
npm install        # added 154 packages, audited 155 packages, found 0 vulnerabilities
npm run typecheck  # tsc --noEmit → 0 错误、无输出
npm run test       # vitest run → Test Files 18 passed (18) / Tests 166 passed (166), 837ms
npm run build      # node esbuild.mjs → 四入口全部产出
```

- 安装：`added 154 packages ... found 0 vulnerabilities`（与计划期望「安装 0 漏洞」一致）。
- 类型检查：`tsc --noEmit` 无任何输出，0 错误（strict 模式）。
- 测试：**18 个测试文件 / 166 个用例全绿，0 失败 0 跳过**。用例数比中断前的 19 文件 / 169 用例少，原因是 Task 12 删掉了 `test/placeholder-image.test.ts`（4 个用例），而 Task 11 修复提交 `64355ec` 在 `test/notice.test.ts` 新增了 1 个用例：169 + 1 − 4 = 166，可对账。
- 构建：四入口产出 —— `dist/extension.js` 30.5kb、`dist/dshw-shim.js` 6.5kb、`dist/probe.js` 9.6kb、`dist/sidebar-ui.js` 11.2kb（各带 `.js.map`）。

### Step 2 打包并核对内容 —— ✅ 通过

```bash
npm run package    # npx @vscode/vsce package → DONE Packaged: vscode-whale-widget-0.0.1.vsix (19 files, 1008.86 KB)
npx @vscode/vsce ls
```

`vsce ls` 输出（即 `.vsix` 实际内容清单）：

```text
LICENSE
LICENSE-ARTWORK
NOTICE.md
package.json
README.md
dist/dshw-shim.js
dist/dshw-shim.js.map
dist/extension.js
dist/extension.js.map
dist/probe.js
dist/probe.js.map
dist/sidebar-ui.js
dist/sidebar-ui.js.map
media/activity-icon.svg
media/whale-delighted.png
media/whale-determined.png
media/whale-sleepy.png
```

逐项核对计划期望：

| 期望 | 结果 |
|---|---|
| `media/` 只有 `activity-icon.svg` + 三张 `whale-*.png` | ✅ 恰好 4 个文件：`activity-icon.svg`(0.39KB)、`whale-delighted.png`(332.17KB)、`whale-determined.png`(323.45KB)、`whale-sleepy.png`(282.38KB) |
| **没有** `media/raw/` | ✅ 缺失（`.vscodeignore` 的 `media/raw/**` 生效）；用 `unzip -l` 独立复核 `.vsix`，文件列表中确认无 `raw/` 条目 |
| 包含 `LICENSE-ARTWORK` | ✅ 存在（1.5KB，CC BY-NC-SA 4.0 美术许可见 `extension/LICENSE-ARTWORK`） |
| `dist/` 里有 `sidebar-ui.js` | ✅ 存在（`extension/dist/sidebar-ui.js` 11.16KB） |
| 没有 `placeholder-whale.png` | ✅ 缺失（Task 12 已退役；`unzip -l` 复核无该条目） |
| `src/`、`test/`、`tools/`、`docs/`、`node_modules/`、`*.ts`、`*.mjs` 不进包 | ✅ 清单中均不存在 |

打包含 1 条非阻断 WARNING：`A 'repository' field is missing from the 'package.json' manifest file.` —— 见「二、执行记录 / 与计划的偏差及原因」2.3。

### Step 3 素材溯源复核 —— ✅ 通过

```bash
node tools/fetch-artwork.mjs
```

输出恰为三行「跳过（已存在且校验通过）」（`delighted-cutout.png` / `sleepy-cutout.png` / `determined-cutout.png`），说明 `tools/artwork-pins.mjs` 中锁定的上游 commit `80630009aee821fe69a9bcd1078c7098300f2c26` 与 sha256 与本地 `media/raw/` 完全一致（pin 未漂移、本地未被改写）。

### Step 4 🔍 人工验收（需要真实 VSCode + 真密钥）—— ⏸ 待人工验收

**未执行**：本环境无真实 VSCode 桌面会话、无可用 DeepSeek API Key，且属于不可自动化的主观项（主题下的边缘观感）。按 controller 指示跳过，标记为「待人工验收」，**不得**据本报告视为已通过。

保留验收清单原文，供人工逐条打勾：

```bash
code --install-extension vscode-whale-widget-0.0.1.vsix
```

| # | 操作 | 期望 | 结果 |
|---|---|---|---|
| 1 | 打开侧边栏 | 顶部是鲸鱼少女；余额与状态栏一致；下方「立即刷新」可用 | 待人工验收 |
| 2 | 未配置密钥 | 她显**困**；出现「设置 API Key」按钮，点击能弹出输入框 | 待人工验收 |
| 3 | 填入正确密钥 | 余额健康 → 她变**开心** | 待人工验收 |
| 4 | 把 `whaleWidget.lowBalanceThreshold` 调成大于余额 | 表情**当场**变**坚定**（不重新拉网络、不重载窗口） | 待人工验收 |
| 5 | 填入错误密钥（`sk-wrong`） | 她**坚定** + 「API Key 无效或无权限」；扩展不崩 | 待人工验收 |
| 6 | 断网后点刷新 | 数字沿用旧值 + `~` 前缀 + 「网络异常，正在显示上次数据」，**表情不变** | 待人工验收 |
| 7 | 命令面板 → `鲸鱼: 显示通信层自检页` | 探针页打开且全部通过 | 待人工验收 |
| 8 | 把侧边栏拖到最窄 | 主图跟着缩、文字不溢出 | 待人工验收 |
| 9 | 深色 / 浅色主题各看一次 | 人物边缘不出现白底方块 | 待人工验收 |

可自动化的部分（#4 的阈值→表情规则、#6 的 stale 沿用、#7 的探针路由）已由 `test/mood.test.ts`、`test/refresh.test.ts`、`test/routes-*.test.ts`、`test/host.test.ts` 覆盖，但**不能替代**真机验收。

### Step 5 打 tag —— ⏸ 推迟

```bash
git tag -a v0.1.0 -m "鲸鱼少女形象落地：三态表情 + CC BY-NC-SA 4.0 素材管线"
```

**本次执行不打 tag**（controller 指示）。理由：tag 是「已验收发布」的承诺，而 Step 4 真机验收尚未进行；若人工验收发现问题，已打的 tag 会指向未经验证的构建。人工验收全部通过后再执行该命令。

### Step 6 输出完成报告 —— ✅ 本文件

本文件即 Step 6 的产出（`docs/superpowers/plans/2026-09-19-whale-girl-artwork-completion.md`）。与计划文本的差异：计划写「追加到 `2026-09-19-whale-girl-artwork.md`」，controller 指定改为独立文件，理由见 2.3。

---

## 二、执行记录 / 与计划的偏差及原因

### 2.1 本次执行摘要（Task 1-Task 12）

- **Task 1-10：实现 + spec 合规审查 + 代码质量审查全部通过（各 1 轮），无遗留问题。**
- **Task 11（许可与归属落地）：实现通过、spec 审查通过；代码质量审查判 BLOCK**，发现 **P1**——`NOTICE.md` 仍把整个 `media/` 声明为 MIT 原创图形，与同文件新增的鲸鱼少女 CC BY-NC-SA 4.0 章节、`LICENSE-ARTWORK`、`README` 自相矛盾；且计划里 Task 12 只删占位文件、不动 `NOTICE.md`，该矛盾会被原样带进发布包。修复后复审通过（`64355ec`）。
- **Task 12（退役占位鲸鱼）：实现 DONE、spec 审查通过（1 轮）、质量审查通过（1 轮）**（`d854cc1`）：删除 `media/placeholder-whale.png`、`tools/make-placeholder.mjs`、`test/placeholder-image.test.ts`，改 `src/webview/probe.ts` 断言与 `test/host.test.ts`，并在 `.vscodeignore` 增加窄匹配 `media/raw/**`。工作区干净（`git status --porcelain` 为空）。
- 遗留观察（非缺陷，未改）：`src/webview/probe.ts` 的 `img.alt = '占位鲸鱼'` 仍是「占位」措辞；Task 12 的 Step 1 只授权改断言那一行，`alt` 不是文件名、不在计划的 grep 检查范围内，故忠实规格未动。

### 2.2 已批准的偏差（DEV-1 ~ DEV-7）

| 编号 | 偏差 | 状态 |
|---|---|---|
| DEV-1 | Task 1 测试 alpha 用例勘误（原断言自相矛盾） | 已批准，已落地 |
| DEV-2 | Task 6 顺带改名 `uris.probe` → `uris.entry` | 已批准，已落地 |
| DEV-3 | Task 8 `moodOf` 时序窗口（提交后 `typecheck` 短暂为红） | 已批准，已落地 |
| DEV-4 | 审查不通过时的修复使用新的 `worker`（而非 resume 同一子代理） | 已批准（流程性偏差） |
| DEV-5 | Task 8 提前接线 `moodOf`（DEV-3 的漏判修正） | 已批准，已落地 |
| DEV-6 | Task 8 测试片段 `totalBalance` 笔误 | 已批准，已落地 |
| DEV-7 | Task 11 `NOTICE.md` 的 `media/` 许可描述修正（质量审查 P1 的修复） | 已批准，已落地（`64355ec`） |

### 2.3 本次（Task 13）执行的偏差及原因

1. **Step 4 人工验收跳过、Step 5 打 tag 推迟**（原因：无真实 VSCode 会话与真密钥；tag 应晚于人工验收，避免为未验证构建背书）。二者均已在第一节显式标记，未伪称通过。
2. **完成报告写成独立文件**（计划原文是在计划文件中追加）。原因：controller 明确指定文件名，独立文件也让这份「验收产物」与「计划（含 DEV 附录）」各自可读、便于 diff 审查。内容覆盖计划要求的全部三项：逐条验收结果、偏差及原因、后续清单。
3. **提交信息由本 Task 拟定**：计划 Step 6 未给出 commit message（它只给了 Step 5 的 tag message）。按仓库既有 Conventional Commits 惯例使用 `docs: ...`，且用 `git add <该文件>` 精确暂存，未用 `git add -A`。
4. **打包含 1 条非阻断 WARNING**：`A 'repository' field is missing from the 'package.json' manifest file.`。原因：`package.json` 从未声明 `repository`，这是仓库既有状态（不是本次回归），`vsce` 仅告警仍完成打包。若日后要发到 Marketplace，应补 `repository` 字段；本 Task 为验收与打包，不做超出计划的产品元数据改动。
5. **重新生成了仓库根 `vscode-whale-widget-0.0.1.vsix`**：该文件是构建产物、被 `.gitignore` 忽略，`npm run package` 覆盖了旧产物（旧产物无意义、未被版本控制），未提交。
6. **`package-lock.json` 的一行漂移未提交**：Step 1 的 `rm -rf node_modules && npm install` 会把锁文件里根包的 `"license": "MIT"` 同步为 `"license": "SEE LICENSE IN LICENSE"`（Task 11 改了 `package.json` 的 `license` 但未重生成锁文件，属既有漂移，非本次回归）。本 Task 只做验收与打包、不做超出计划的元数据改动，因此**已把该文件恢复到 HEAD**，工作区保持干净；`npm ci --dry-run` 在恢复后的锁文件上正常通过（无「不在 sync」报错），未提交该改动。若要消除这处不一致，建议后续单独提交一次 `chore: 同步 package-lock.json 的 license 字段`。

### 2.4 DeepSeek API 402 中断及恢复

**执行中断**：Task 11 的修复子代理**两次**失败于 `DeepSeek API 402 Insufficient Balance`（账号余额不足），工作流按设计停机。

**恢复前核实**：controller 确认工作区干净、**19 个测试文件 / 169 个用例全绿**、`typecheck` 0 错误、无非预期改动；随后重启继续执行（重启后完成 Task 11 修复 `64355ec`、Task 12 `d854cc1`、Task 13 本轮）。中断属外部 API 配额问题，与代码正确性无关；中断点的绿灯基线与本轮 Task 13 Step 1 的重新验证结果可互相印证（169 用例 → 现 166 用例的差额已在上文对账）。

---

## 三、留给后续的清单

- **动效**：三态之间的过渡（淡入/位移）目前是硬切换，留给后续做视觉打磨。
- **气泡**：鲸鱼少女的对话/提示气泡（文案系统）尚未实现，当前只有状态栏与侧边栏文本。
- **Activity Bar 剪影**：Activity Bar 图标仍是 `media/activity-icon.svg` 的线性图标，未换成人物剪影。
- **多币种阈值**：`whaleWidget.lowBalanceThreshold` 目前「按当前币种的数字直接比较，不做汇率换算」；若 DeepSeek 支持多币种余额，需要汇率/分币种阈值策略。
- 另记与本 Task 相关的发布前待办：**人工验收（Step 4）**、**打 tag `v0.1.0`（Step 5）**、`package.json` 的 `repository` 字段补全（若要上 Marketplace）、以及 `package-lock.json` 根包 `license` 字段的同步（见 2.3 第 6 条）。

---

## 四、验收后补记（controller）

Task 13 完成后，controller 在**仓库之外**搭了一套 B 级验收台（真 Chromium + 真实 `buildHtml` 生成的页面 + 真实 `balance`/`command` 路由表 + 真实 `dist/sidebar-ui.js`/`dshw-shim.js`，仅把 `acquireVsCodeApi`/`asWebviewUri`/`getConfiguration` 换成最小实现），共 **46 项断言全部通过**：三态表情与文案/按钮决策、`stale` 沿用旧值时表情不变、`~` 前缀与时间戳、阈值当场生效（前端确实重取 `balance.json` 而**上游 refresh 次数不变**、页面未重载）、两个按钮发出 `whale.setApiKey`/`whale.refresh`、成品图 512px 且外圈 1368/1368 全透明、170px 最窄宽度无横向溢出。

随后做了发布前清理并提交 **`92c9cb5`**（`chore: 同步锁文件 license 与探测页 alt 文案`）：

- `package-lock.json` 根包 `license` 由 `MIT` 同步为 `SEE LICENSE IN LICENSE`（用 `npm install --package-lock-only` 生成，diff 恰为 1 行；lock 内其余 `MIT` 均为第三方 devDependencies，属正常）。
- `src/webview/probe.ts` 的 `img.alt` 由 `'占位鲸鱼'` 改为 `'鲸鱼少女'`（Task 12 退役占位图后的陈旧文案）。
- 重新构建并重新打包 `.vsix`（22:37，19 文件 / 1008.86 KB）；解包核对 `extension/dist/probe.js` 与 `dist/probe.js` 逐字节一致，`media/` 仅 `activity-icon.svg` + 三张 `whale-*.png`。
- 独立复核（另一个只读子代理）：`92c9cb5` 恰为 2 文件、lock 仅 1 行差异、`npm run typecheck` 0 错误、`npx vitest run` 18 文件 / 166 用例全绿、工作区干净 —— verdict pass。

**决定**：`package.json` 的 `repository` 字段**暂不补**（本仓库无 git remote，不填猜测的 URL）；`vsce` 的非阻断 WARNING 保留，待要发布到 Marketplace 时再补。**tag `v0.1.0` 仍待人工验收通过后打。**

---

## 五、人工验收记录（Step 4）

- **方式**：`code --install-extension vscode-whale-widget-0.0.1.vsix`（安装成功，`shen-1358.vscode-whale-widget@0.0.1` 已落盘），`Developer: Reload Window` 后在真实 VSCode 中操作。
- **结果**：验收人确认「**功能完全没问题**」——侧边栏形象正确、三态表情与文案随状态切换、密钥设置与刷新链路均正常。
- **过程中真实踩到的两条 UX 缺口（非阻断，非计划范围）**：
  1. 点「立即刷新」时**没有任何视觉反馈**（执行中/刚完成）；余额未变时看起来像按钮失灵（验收过程中确实误判过一次，后经输出面板日志证实命令已执行、余额未变）。
  2. 「清除 API Key」命令**不广播**（`src/extension.ts` 的 `whale.clearApiKey` 只更新状态栏），侧边栏要等下一个自动刷新周期（默认 ≤60s）才变。
  两条都记为后续改进项，不影响本次验收结论。
- **未逐项回报的可选条目**：断网沿用旧值、命令面板自检页（均已有 B 级 46 项断言覆盖，真机未单独回报）。

**结论**：Step 4 通过；Step 5 打 tag `v0.1.0`。


