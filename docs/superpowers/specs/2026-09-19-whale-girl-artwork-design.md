# 鲸鱼少女形象落地 · 设计文档

> 归属：#1 的第一个增量（#0 骨架与通信层已交付，见 `2026-09-19-skeleton-and-bridge-design.md`）
> 日期：2026-09-19

## 0. 背景

#0 交付时侧边栏用的是**几何占位鲸鱼**（`tools/make-placeholder.mjs` 生成，自有版权，仅为了不阻塞通信层验收）。本次要把它换成用户想要的**鲸鱼少女形象**。

### 素材来源的两次筛选

| 候选 | 结论 |
|---|---|
| `MeteorNOX/DeepSeek-Balance-Whale-Widget` 的 `assets/DSniang1.png` | ❌ **不可用**。该仓库 `PROVENANCE.md` 明确：`assets/**` 不适用 MIT，"按 as-is 随插件分发，仅用于运行本插件；**不授予再许可**"。我们无法把它打进自己的 `.vsix` 分发 |
| `Small-tailqwq/dsh-deep-whale` 的 `maid-atelier` 皮肤图标 | ✅ **可用**。代码 MIT、**美术 CC BY-NC-SA 4.0**（署名 + 非商业 + 同许可），条款允许非商业再分发 |

用户已明确用途：**免费公开、非商业**。因此走 CC BY-NC-SA 4.0 合规路线。

### 署名链（上游 `maid-atelier/NOTICE` 声明）

1. **原始鲸鱼少女角色设计** —— Pixiv 画师 `pixiv.net/users/62155430`（一次创作）
2. **女仆版改设计**（加入 DeepSeek 元素，GPT Image 2 生成）—— zipzip，`pixiv.net/users/18604994`（二次创作）
3. **本皮肤素材** —— Small-tailqwq（三次创作，2026-09-07 提供 `assets/icons/` 原图）

我们用的是第 3 层的 `*-cutout.png`（透明抠图版）。

---

## 1. 决策清单

| # | 决策 | 依据 |
|---|---|---|
| D1 | 采用 `maid-atelier/assets/icons/` 的 `delighted` / `sleepy` / `determined` 三张透明抠图 | 三张表情现成、明暗主题都已适配过 |
| D2 | 许可按 **CC BY-NC-SA 4.0** 合规：完整署名链 + 非商业声明 + 我们的改作同许可释出 | 上游条款 |
| D3 | 表情**按余额健康度**决定，而非按网络/错误状态 | 用户选择（避免"数字很健康但她在哭"的割裂） |
| D4 | 阈值做成配置项 `whaleWidget.lowBalanceThreshold`，默认 `5`，`minimum: 0` | 用户选择；一个数字阈值为最简可用形态 |
| D5 | 形象放在**侧边栏顶部主图**（约 240px 宽），下面才是数字 | 用户选择；也是唯一能让三张表情被看见的布局 |
| D6 | 数据流：首次 `fetch('/dsh-whale/balance.json')` + 之后监听 `dshw:event` 的 `balance` 事件（**不轮询**） | shim 已把宿主广播转成 DOM 事件，无需新增通道 |
| D7 | 素材管线：**锁定上游 commit + sha256 校验**下载 → 零依赖脚本缩到长边 512px → 成品进 git | 可复现、可审计；构建与运行期不依赖网络 |
| D8 | 占位鲸鱼退役：删除 `media/placeholder-whale.png`、`tools/make-placeholder.mjs`、`test/placeholder-image.test.ts` | 计划 Task 3 已预留注释："#1 用真实形象替换占位图时，此测试需同步更新或删除" |
| D9 | M1 探针页退出侧边栏，改由命令 `whale.showSelfCheck` 用独立面板打开 | 保住自检能力（CSP/shim 改动后的第一道排查工具） |
| D10 | **表情由宿主计算**并随数据下发（路由响应与广播都带 `mood` 字段） | webview 读不到 `workspace` 配置；两处用同一个纯函数避免不一致 |
| D11 | 侧边栏的"设置 API Key"/"立即刷新"按钮走新增路由 `/dsh-whale/command.json`（**命令白名单**） | webview 不能直接执行命令；白名单保证只放行我们自己的命令 |

---

## 2. 范围

**做**

1. 素材下载与缩放脚本、三张成品图进仓库
2. 许可落地（`NOTICE.md` 增补、新增 `LICENSE-ARTWORK`、`package.json`/`README` 的许可字段）
3. 表情规则纯函数 + 阈值配置
4. 侧边栏新界面（主图 + 余额 + 今日 + 上次时间 + 状态按钮）
5. `html.ts` 参数化（入口脚本与根元素可传）、第四个构建入口
6. 命令白名单路由
7. 配套测试

**不做**（明确留后）

- 动效、气泡对话、音效（上游另有 gif/mp3，属更大的改作，NC/SA 同样适用）
- Activity Bar 图标换成她的单色剪影（VSCode 要求单色 SVG，得另画，属改作）
- 状态栏插画（**技术不可能**：`StatusBarItem` 只能文字 + codicon 字体图标）
- 多币种分别设阈值（当前只用数字直接比较，见 §3）

---

## 3. 表情规则

纯函数，签名与判定顺序如下（`src/webview/mood.ts`）：

```ts
export type Mood = 'delighted' | 'sleepy' | 'determined'

export interface MoodInput {
  state: 'ok' | 'no-key' | 'auth-error' | 'network-error'
  balance?: number
  threshold: number
}

export function pickMood(input: MoodInput): Mood
```

| 顺序 | 条件 | 表情 |
|---|---|---|
| 1 | `state === 'ok'` 且 `balance` 是有限数且 `balance >= threshold` | `delighted` |
| 2 | `state === 'ok'` 且 `balance` 是有限数且 `balance < threshold` | `determined` |
| 3 | `state === 'ok'` 但 `balance` 不是有限数（异常兜底） | `determined` |
| 4 | `state === 'no-key'` | `sleepy` |
| 5 | 其余（`auth-error` / `network-error`） | `determined` |

**边界说明**

- **`stale` 不参与判定**：沿用旧值时 `state` 仍是 `ok`，表情照旧按余额 —— 这是 D3 的直接结果。不新鲜这件事由 `~` 前缀与文案承担，不由表情承担。
- **阈值比较不换算币种**：`balance` 与 `threshold` 都是纯数字。`threshold = 5` 时，`¥4.2` 与 `$4.2` 都判为 `determined`。配置项的 `description` 必须写明这一点，避免跨币种时产生误解。
- `threshold = 0` 等价于"永不预警"（余额恒 `>= 0`），这是允许的。
- 余额 0（欠费用尽）自然落入 `determined`，无需特判；DeepSeek 不会返回负余额。

---

## 4. 素材管线

### 4.1 溯源（写死进脚本与 NOTICE）

- 上游仓库：`https://github.com/Small-tailqwq/dsh-deep-whale`
- 锁定 commit：`80630009aee821fe69a9bcd1078c7098300f2c26`

| 文件（`maid-atelier/assets/icons/`） | 字节数 | sha256 |
|---|---|---|
| `delighted-cutout.png` | 1669896 | `5f8149d52b8cbdba7b5efeacbda9d1abd9c55a1ee129551b476540452ad83ec9` |
| `sleepy-cutout.png` | 1542451 | `4dd731cad7b132fb47f4fedd6848efbf21b8c5acb792a9c56bc25b421a0ab3e0` |
| `determined-cutout.png` | 700815 | `85628c8003043147248eeeb6ba425975c7873b08cf5da498b4ac4b9f452000d5` |

> 该 sha256 已用**锁定 commit 的 URL** 与 `@main` 两种路径分别取回并比对一致（2026-09-19 实测）。

### 4.2 `tools/fetch-artwork.mjs`

- 输出：`media/raw/{delighted,sleepy,determined}-cutout.png`（**`media/raw/` 进 `.gitignore`**）
- 镜像按序重试，任一个成功即停：`ghfast.top` → `ghproxy.net` → `cdn.jsdelivr.net/gh/...@{commit}` → `raw.githubusercontent.com`
  （实测：本次只有 `ghfast.top` 稳定可用，`jsdelivr` 与 `raw` 在这台机器上时不时超时）
- 每个文件下载后**校验 sha256**：不匹配即报错退出（退出码非 0），并打印"上游已变动，需人工复核后更新 pin"
- 已存在且 sha256 正确的文件**跳过下载**（可重复执行）

### 4.3 `tools/resize-artwork.mjs`

- 输入 `media/raw/*.png` → 输出 `media/whale-{delighted,sleepy,determined}.png`
- 长边缩到 **512px**（面积平均下采样），输出 **RGBA8 PNG**，保留 alpha
- 零依赖：只用 `node:zlib`（`inflateSync` / `deflateSync`）与 `node:fs`
- 实现要点：解析 IHDR/IDAT → 逐行**反滤波**（filter 0–4）→ 缩放 → 重新逐行滤波 → `deflateSync` → 写 IHDR/IDAT/IEND（自算 CRC32）
- 预计成品约 250–400KB/张（原图合计 3.9MB，不缩会把 `.vsix` 从 53KB 撑到 4MB）

### 4.4 媒体映射（shim 侧）

| 媒体键（webview 里写的 URL） | 实际文件 |
|---|---|
| `/dsh-whale/whale-delighted.png` | `media/whale-delighted.png` |
| `/dsh-whale/whale-sleepy.png` | `media/whale-sleepy.png` |
| `/dsh-whale/whale-determined.png` | `media/whale-determined.png` |
| `/dsh-whale/image.png` | `media/whale-delighted.png`（保留给探针页用） |

---

## 5. 许可与归属

| 文件 | 改动 |
|---|---|
| `NOTICE.md` | 新增「鲸鱼少女形象」段：三位署名 + 上游仓库/commit 链接 + **改动说明**（缩放到 512px、仅保留运行时所需的三张）+ "仅限非商业" + 与上游 `PROVENANCE.md` 一致的**收到权利主张即替换/移除**承诺 |
| `LICENSE-ARTWORK`（新） | CC BY-NC-SA 4.0 的**适用说明 + 官方链接**（不复制 20KB 法律全文，避免转写错误）；写明"本仓库代码 MIT、美术 CC BY-NC-SA 4.0" |
| `package.json` | `license` 由 `"MIT"` 改为 `"SEE LICENSE IN LICENSE"`（包内已非单一许可） |
| `README.md` | 「许可」段补充：代码 MIT / 美术 CC BY-NC-SA 4.0 **仅非商业**；想商用必须替换美术 |

> 依据 CC BY-NC-SA 4.0 的 SA 条款：我们缩放/裁切后的图属于**改作**，同样以 CC BY-NC-SA 4.0 释出。代码不受影响（图片与代码是聚合，不是同一作品）。

---

## 6. 界面

```
┌─────────────────────────┐
│      〔 鲸鱼少女主图 〕    │  max-width 240px，居中，透明底
│                         │
│  余额  ¥23.45            │  20px / 600
│  今日  ¥1.02             │  12px，--vscode-descriptionForeground
│  上次成功 14:32（北京）    │  12px，同上
│  [ 立即刷新 ]            │  次要按钮
└─────────────────────────┘
```

- 根元素 `#app`；主图 `<img id="whale">`，`alt` 随表情变化（如"鲸鱼少女（开心）"）
- `stale` 时：余额前加 `~`，并追加一行「网络异常，正在显示上次数据」
- `no-key` / `auth-error` 时：仍显示主图（`sleepy` / `determined`），追加一行说明 + **`[ 设置 API Key ]` 按钮**
- 样式只用 VSCode 主题变量（`--vscode-foreground`、`--vscode-descriptionForeground`、`--vscode-button-*`），明暗主题都要可读
- 数字用 `tabular-nums`，避免刷新时宽度跳动
- 侧边栏可能被拖得很窄（<200px）：主图 `width:100%; max-width:240px`，文字换行不溢出

---

## 7. 数据流

```
webview 加载
  └─ installShims()
       ├─ fetch('/dsh-whale/balance.json')      ← 首屏：含 mood 字段
       └─ 监听 'dshw:event'（name === 'balance'） ← 之后：宿主推送

宿主
  ├─ 定时器 / 命令 → refresh() → RefreshResult
  ├─ mood = pickMood({ state, balance, threshold })     ← 与路由共用同一纯函数
  ├─ statusBar.renderResult(result)                     ← 状态栏（文字，不变）
  └─ host.broadcast('balance', { ...result, mood })

按钮
  └─ POST /dsh-whale/command.json { command: 'whale.setApiKey' }
       └─ 宿主：白名单校验 → vscode.commands.executeCommand
```

- 阈值配置变化时：不重新拉网络，直接 `host.broadcast('balance', { ...refresh.last(), mood })` 让界面立刻换脸
- **`mood` 在成功与失败分支都要下发**：路由的 `{ok:false, code}` 分支同样带 `mood`（否则未配置密钥时前端不知道该显示 `sleepy`）；两个分支都用 `moodOf(result)` 计算，不做特例
- 首屏 `fetch` 失败（理论上只有宿主未接线时）：显示一行兜底文案，不空白、不抛未捕获异常

---

## 8. 文件清单

**新增**

| 文件 | 职责 |
|---|---|
| `src/webview/mood.ts` | 表情规则纯函数（不 import `vscode`） |
| `src/webview/sidebar-ui.ts` | 侧边栏前端（第四构建入口） |
| `src/routes/command.ts` | 命令白名单路由 |
| `tools/fetch-artwork.mjs` / `tools/resize-artwork.mjs` | 素材管线 |
| `media/whale-{delighted,sleepy,determined}.png` | 成品素材（进 git） |
| `LICENSE-ARTWORK` | 美术许可说明 |
| `test/mood.test.ts` / `test/artwork.test.ts` / `test/notice.test.ts` / `test/routes-command.test.ts` | 测试 |

**修改**

| 文件 | 改动 |
|---|---|
| `src/webview/html.ts` | `uris` 增加 `entry`，新增 `rootId` 参数（保持纯函数、可测） |
| `src/webview/host.ts` | `attach(target, { page })`，按页选入口脚本与根元素 |
| `src/webview/probe.ts` | 媒体断言的文件名改为 `whale-delighted.png` |
| `src/routes/balance.ts` | 响应增加 `mood` 字段（注入 `moodOf`） |
| `src/extension.ts` | 接线：新入口、阈值配置、配置变更重广播、自检命令、命令路由 |
| `src/statusbar.ts` / `src/statusview.ts` | 不变（状态栏仍是文字） |
| `esbuild.mjs` | 增加 `sidebar-ui` 入口 |
| `package.json` | 配置项 `lowBalanceThreshold`、`license` 字段、`dist/sidebar-ui.js` 相关 |
| `NOTICE.md` / `README.md` | 见 §5 |
| `.vscodeignore` | 确认 `media/whale-*.png` **不被排除**、`media/raw/` 被排除 |

**删除**

`media/placeholder-whale.png`、`tools/make-placeholder.mjs`、`test/placeholder-image.test.ts`

---

## 9. 测试

| 文件 | 覆盖 |
|---|---|
| `test/mood.test.ts` | 三条判定分支 + 边界（`balance === threshold` 取 `delighted`）+ `balance` 为 `undefined`/`NaN` + `stale` 不影响结果 |
| `test/artwork.test.ts` | 三张成品存在；长边 `=== 512`；PNG 颜色类型 `=== 6`（RGBA）；**存在 alpha < 255 的像素**（证明真是抠图而非白底）；`media/raw/` 不存在于 git 索引（用 `git ls-files` 断言） |
| `test/notice.test.ts` | `NOTICE.md` 必含：三位署名标识（`62155430`、`18604994`、`Small-tailqwq`）、`CC BY-NC-SA 4.0`、上游仓库 URL、"非商业"字样；`LICENSE-ARTWORK` 存在且含官方链接 |
| `test/routes-command.test.ts` | 白名单内命令 → 200 且真的调用；白名单外 → 403；非 `POST`（GET/PUT）→ 405；缺 `command` → 400 |
| `test/html.test.ts` | 补：传入自定义 `entry` 与 `rootId` 时 HTML 正确；仍无裸尖括号 |
| `test/activate.test.ts` | 更新：断言侧边栏页加载的是 `sidebar-ui.js`，且 `balance.json` 响应含 `mood` |

> 为什么给 `NOTICE.md` 写测试：署名是 **CC BY 的强制义务**，删掉它是"测试全绿但违法"的那类回归，值得用一条断言钉住。

---

## 10. 风险与未决

| 风险 | 处理 |
|---|---|
| 上游署名链本身有瑕疵（第三方画师的原创角色被下游 CC 化，严格说下游无权 CC 化） | 按上游声明的条款**善意合规**（完整署名 + 非商业 + 同许可），并在 `NOTICE.md` 写明这一情况；承诺收到权利主张即替换/移除 |
| 素材是 AI 生成/AI 辅助 | `NOTICE.md` 如实标注（上游自己也这么标），不声称原创 |
| 非商业限制（NC） | README 与 `LICENSE-ARTWORK` 双处写明；一旦商业化必须替换美术 |
| 缩图引入重采样损失 | 512px 长边供 240px 显示（2x DPI 够用）；损失可接受，且有像素级测试兜底尺寸 |
| 上游删除仓库/改动素材 | 成品已进 git，构建与运行**不依赖网络**；`fetch-artwork.mjs` 仅开发期使用，sha256 不符即报错 |
| 侧边栏过窄导致主图与文字挤压 | `max-width` + 换行；人工验收时把侧边栏拖到最窄看一次 |

**未决**：无。所有影响实现的决策已在 §1 定稿。

---

## 11. 验收（怎么算做完）

1. `npm run typecheck` 0 错误、`npm run test` 全绿（含本设计新增的 5 个测试文件）
2. `npm run package` 产出的 `.vsix` 内包含 `media/whale-*.png` 与 `LICENSE-ARTWORK`，且**不含** `media/raw/`
3. F5 打开侧边栏：顶部是鲸鱼少女（余额健康 → 开心），余额数字与状态栏一致
4. 把 `whaleWidget.lowBalanceThreshold` 调到大于余额：**不重新拉取网络**，表情当场变坚定
5. 未配置密钥：她变困，出现「设置 API Key」按钮，点击能弹出输入框；点「立即刷新」能触发一次拉取（日志可见）
6. 填入错误密钥：表情坚定 + 文案提示；填入正确密钥：恢复开心
7. 断网后刷新：数字沿用旧值 + `~` 前缀 + 「正在显示上次数据」，**表情不变**（D3 的验收点）
8. 命令 `鲸鱼: 显示自检页` 能打开 M1 探针页，且探针全部通过
