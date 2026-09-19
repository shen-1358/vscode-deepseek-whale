# vscode_whale_widget —— #0 骨架与通信层 · 设计文档

| 项 | 值 |
|---|---|
| 日期 | 2026-09-19 |
| 阶段 | C 档满血复刻 · 第 0 期（存活子系统共 8 期：#0–#7） |
| 状态 | 设计已获用户批准，待用户复审本文档 |
| 上游内核 | [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（`main` 分支，v0.3.7） |
| 项目路径 | `D:\github_project\vscode_whale_widget` |

---

## 1. 背景

上游项目是 **DSH（DeepSeek Harness）的 Web 界面插件**：一只常驻右下角的小鲸鱼，显示 DeepSeek API 余额、今日已用、峰谷定价与每轮对话消耗。它不能装进 VSCode —— 它是 DSH bundle 插件，靠 `dsh plugin --profile web add` 挂载进 DSH 的 web profile，前端脚本要求宿主页面存在 DSH 聊天界面的 composer 输入区。

本项目把它的**能力**搬到 VSCode：做一个原生扩展，实时查看 DeepSeek 余额并保留鲸鱼挂件的视觉与交互。

上游资产盘点（已核实）：

| 层 | 文件 | 行数 | 可复用性 |
|---|---|---|---|
| 记账内核 | `lib/accounting.mjs` | 187 | **逐字节复用**。纯函数、零依赖、自身不做文件 IO |
| DSH 宿主层 | `lib/index.js` | 3387 | 仅作**语义参考**。注册 21 条 `/dsh-whale/*` 路由、读 DSH 凭据服务、往 `$DSH_HOME` 落盘、34 个厂商模板 |
| 前端挂件 | `assets/whale-widget.js` | 14949 | **改造后复用**（#1 起）。35 处 `fetch` 走数据类路由；媒体类走 `img.src` / `new Audio()`，不过 fetch |
| 美术素材 | `assets/*.png|gif|mp3|wav` | — | **不可用**（见 §13） |

---

## 2. 目标与分期

用户目标是 **C 档：满血复刻**，并且**要发布到 GitHub**。C 档不是单个项目，是 9 个子系统，必须分期推进，每期一份 spec、一份计划、一次验收。

| # | 子系统 | 来源 | VSCode 可行性 |
|---|---|---|---|
| **0** | **骨架 + 通信层**（本文档） | 重写 | ✅ |
| 1 | 鲸鱼本体 + 泡泡交互 | 改造 `whale-widget.js` | ✅（拖拽限定在面板内部） |
| 2 | 记账内核 + 数据窗口 | 复用 `accounting.mjs` | ✅ |
| 3 | 泡泡编辑器（模块化 / 随机 / 加权 / 排版） | `whale-widget.js` | ✅ |
| 4 | 资源管理（角色图 / 图库 / 音频裁剪） | 双端 | ✅ |
| 5 | 多厂商 34 模板 + 额度 / 订阅窗口 | 宿主 | ⚠️ 无法逐个真机验证 |
| 6 | 提醒体系（余额预警 / 今日预算） | 前端 | ✅ |
| 7 | 音效系统 | 前端 | ✅ |
| 8 | ~~每轮对话消耗~~ | DSH 会话事件 | ❌ **已砍**：VSCode 无等价数据源 |
| 9 | ~~DSH 安全栅栏 / 热重载 / 插件市场~~ | — | ❌ **已砍**：VSCode 有原生机制（CSP+nonce / `vsce package` / 扩展市场） |

推进顺序：

```
0 → 1 → 2 → 6 → 7
              ↓
        3 → 4 → 5
```

---

## 3. 全局已定决策

| # | 决策 | 理由 / 被否决的选项 |
|---|---|---|
| **D1** | 发布目标：**GitHub 公开仓库优先**，结构上兼容 VSCode 市场 | 用户明确要求发 GitHub。市场发布需要 publisher 账号 + PAT + 图标，属后续补充，不返工 |
| **D2** | 挂载点：**状态栏 + 侧边栏 WebviewView + （#3 起）编辑器 WebviewPanel** | 三种需求对应三个 VSCode 原生容器。已否决"只做状态栏"（丢了鲸鱼感）与"只做编辑器面板"（常驻感差、易手滑关掉）。注意 **VSCode 无 API 可做覆盖在编辑器上的浮层**，"悬浮在编辑器右下角"物理上不可实现 |
| **D3** | 密钥：**`SecretStorage` 优先 → 环境变量 `DEEPSEEK_API_KEY` 回退**，附设置/清除命令 | 已否决"只读 DSH 的 `~/.dsh/.credentials.yaml`"：用户机器上未装 DSH，纯增耦合 |
| **D4** | 项目路径 `D:\github_project\vscode_whale_widget`；**目录名** `vscode_whale_widget`，**`package.json` 的 `name`** 为 `vscode-whale-widget` | 实测 `@vscode/vsce@4.0.0` 的 `validateExtensionName` 用 `/^[a-z0-9][a-z0-9\-]*$/i`，**下划线会被直接拒绝**，连打包都过不去 |
| **D5** | `publisher` 暂定 `shen-1358`（用户的 GitHub 登录名） | 打包必需字段；该字符串通过 vsce 的 `validatePublisher` |
| **D6** | 通信方案：**分治桥**（数据过消息通道，媒体走 `asWebviewUri`） | 见 §6.5 |

---

## 4. #0 范围

### 4.1 交付

拆成两个里程碑，**M1 是探针**（先验证架构里唯一有风险的假设，再往上垒）：

**M1 · 探针**
1. 可在 F5 启动的扩展骨架（`activate` 能跑）
2. 一个侧边栏 `WebviewView`，加载一段自研前端脚本
3. **两个 shim 在真 VSCode 里跑通**：
   - fetch shim 合成的 `Response` 对象，其 `.json()` / `.ok` / `.status` 行为正确
   - 媒体 shim 把 `/dsh-whale/image.png` 改写成 `asWebviewUri` 后，图片**在 webview 里真的显示出来**
4. 一条打通的示例路由（`image.png` + 一条返回 JSON 的路由）

**M2 · 完整 #0**
5. 状态栏 `StatusBarItem`：`🐋 ¥23.45 · 今日 ¥1.02`，60 秒自动刷新 + 点击手动刷新
6. 凭据层：`SecretStorage` + 环境变量回退 + `设置/清除 API Key` 两条命令
7. `provider/deepseek.ts`：`GET https://api.deepseek.com/user/balance` → `{balance, currency}`
8. 记账内核接入：余额快照 → 当日"已观测消费"
9. 持久化：`globalStorageUri/ledger.json`，原子写
10. 路由表 + 3 条路由：`balance.json`、`size.json`、`image.png`
11. vitest 测试套件
12. `npx @vscode/vsce package` 产出可安装 `.vsix`
13. `LICENSE` + `NOTICE.md`（归属声明，见 §13）

### 4.2 不交付

鲸鱼形象与任何实际视觉（#1）· 其余 18 条路由 · 泡泡编辑器（#3）· 音效（#7）· 多厂商（#5）· 编辑器 `WebviewPanel` 实例化（#3，但抽象层在 #0 建好）

---

## 5. 架构

### 5.1 目录结构

```
vscode_whale_widget/
├─ package.json                 扩展清单：commands / viewsContainers / views / configuration
├─ tsconfig.json                strict: true, allowJs: true
├─ esbuild.mjs                  三入口构建脚本（见 §10）
├─ LICENSE                      MIT（本项目）+ 上游 MIT 声明
├─ NOTICE.md                    第三方归属：accounting.mjs 来源与许可
├─ README.md                    面向 GitHub 访客
├─ .gitignore                   node_modules / dist / *.vsix
├─ .gitattributes               强制 LF（保护 accounting.mjs 的逐字节一致性）+ 媒体标二进制
├─ .vscode/
│  ├─ launch.json               F5 启动扩展宿主
│  └─ tasks.json                调用 esbuild 构建
├─ media/                       asWebviewUri 提供的静态资源
│  └─ placeholder-whale.png     #0 自研占位图（纯几何图形，见 §13）
├─ src/
│  ├─ extension.ts              装配根：activate/deactivate、注册命令
│  ├─ core/
│  │  ├─ accounting.mjs         ← 上游内核，逐字节原样搬运
│  │  ├─ accounting.d.ts        手写类型声明
│  │  └─ ledger.ts              账本读写 + 原子写
│  ├─ credentials.ts            密钥解析链
│  ├─ provider/
│  │  ├─ deepseek.ts            余额查询（纯 HTTP，不依赖 vscode）
│  │  └─ types.ts
│  ├─ routes/
│  │  ├─ registry.ts            registerRoute / dispatch
│  │  └─ balance.ts             #0 的 3 条路由
│  ├─ webview/
│  │  ├─ host.ts                WebviewHost 抽象（View 与 Panel 共用）+ 内联生成 HTML（含 CSP/nonce）
│  │  ├─ sidebar.ts             侧边栏实例化
│  │  ├─ shim.ts                注入 webview 的 shim（fetch + 媒体），独立打包
│  │  └─ probe.ts               探针前端（M1 用，M2 后保留作自检页）
│  ├─ statusbar.ts              状态栏渲染与轮询
│  └─ log.ts                    OutputChannel
└─ test/                        vitest
   ├─ registry.test.ts
   ├─ credentials.test.ts
   ├─ accounting.test.ts
   └─ deepseek.test.ts
```

### 5.2 模块职责与边界

| 模块 | 职责 | 明确不知道的事 |
|---|---|---|
| `routes/registry` | path → handler 的映射与分发、信封编解码 | 不知道 DeepSeek、不知道 VSCode、不知道 UI |
| `provider/deepseek` | key → `{balance, currency}`，含超时与响应解析 | **不 import `vscode`**，纯 Node，可直接单测 |
| `credentials` | 密钥解析链（SecretStorage → env）与读写 | 不做网络请求 |
| `core/ledger` | 账本 JSON 的读/写/原子替换 | 不含任何记账算法 |
| `core/accounting.mjs` | 定点金额运算、余额观测账本、校正 | **不做任何 IO**（上游原话：never reads or writes files） |
| `statusbar` | 把一份 summary 渲染成状态栏文字；持有 60s 定时器 | 不知道路由表、不知道 webview |
| `webview/host` | 接管 WebviewView/WebviewPanel、注入 shim、收发信封、广播事件 | 不知道具体业务路由 |
| `webview/shim` | 在 webview 内拦截 fetch 与媒体 URL | 不含业务逻辑 |

**依赖方向单向**：`extension.ts` → 各模块；`provider` 与 `core` 不依赖 `vscode`；`routes` 只依赖 `provider`/`core` 的接口。

### 5.3 为什么状态栏是驱动源

状态栏持有唯一的 60 秒定时器并触发刷新，webview **只是订阅者**（通过 `broadcast` 事件）。这样侧边栏关闭时余额照常在刷，面板打开时立刻同步 —— 避免"面板一关就不刷新"的典型缺陷。

---

## 6. 通信协议

### 6.1 信封

webview 与宿主之间只走三条消息形状：

```jsonc
// webview → 宿主：请求
{ "ch": "dshw", "id": 12, "kind": "request",
  "method": "GET", "path": "/dsh-whale/balance.json", "query": "refresh=1" }

// 宿主 → webview：响应
{ "ch": "dshw", "id": 12, "kind": "response", "status": 200,
  "contentType": "application/json", "body": "{\"ok\":true,\"totalBalance\":23.45}" }

// 宿主 → webview：主动推送（余额变化、错误）
{ "ch": "dshw", "kind": "event", "name": "balance", "payload": { /* summary */ } }
```

- `ch` 频道字段用于忽略非本插件的消息。
- `body` 恒为字符串；二进制不经过此通道（见 6.3）。
- 保留 `status` / `contentType` 是为了**让 shim 能合成真实的 HTTP 响应语义**。

### 6.2 Shim 1 —— fetch

在 webview 里包裹 `window.fetch`：凡是 `path` 以 `/dsh-whale/` 开头的请求，不发给网络，而是包成 §6.1 的信封、经 `acquireVsCodeApi()` 的 `postMessage` 转交宿主，拿到响应后**合成一个真正的 `Response` 对象**返回给调用方。

webview 运行在 Chromium 上，`Response` 构造器可用，因此合成对象带完整语义：

| 上游前端的用法 | 合成响应下的行为 |
|---|---|
| `fetch(url).then(r => r.json())` | ✅ 正常 |
| `r.ok` / `r.status` | ✅ 正常 |
| `fetch(url, { method:'PUT', headers:{...}, body: json })` | ✅ method/body 透传 |
| `fetch(url, { cache:'no-store' })` | ✅ 忽略 cache 选项 |

**收益：上游前端那 35 处 `fetch` 一行都不用改。**

非 `/dsh-whale/` 的请求原样放行给真实网络。

### 6.3 Shim 2 —— 媒体 URL 改写

上游前端的媒体**不走 fetch**（已核实）：`var IMG_URL = '/dsh-whale/image.png?v=2'`、`im.src = '/dsh-whale/bubble-img.png?id=' + ...`、`dshwvSound('/dsh-whale/sound/press.mp3?set=' + ...)`。

因此第二个 shim 拦截 URL 赋值点，把 `/dsh-whale/<资源>` 映射为 `webview.asWebviewUri()` 指向扩展 `media/` 目录的地址：

- `HTMLImageElement.prototype.src` 的 setter
- `HTMLAudioElement.prototype.src` 的 setter
- `new Audio(url)` 的构造入口
- `HTMLSourceElement.prototype.src` 的 setter

命中改写前缀的 URL 一律改写；整条 URL 的 **query 部分原样保留**（上游用 `?id=` / `?set=` 区分资源）。

**媒体不过消息通道**：走 VSCode 原生文件服务，因此不产生 base64 膨胀，也不占 postMessage 带宽。

`media/` 目录同时登记进 `localResourceRoots`（并含 `dist/`，因为 shim 与前端脚本自身要能从磁盘加载）。

### 6.4 路由注册与分期

宿主侧提供一张路由表：

```ts
registerRoute(path: string, handler: (req) => Promise<Response>): void
```

- 未注册路径 → 返回 `{status: 404, body: '{"ok":false,"error":"route not registered"}'}`，日志记一条。
- **路由按子系统增量注册**：#0 只注册 3 条（`balance.json`、`size.json`、`image.png`），其余 18 条谁用谁注册（#2 账本类、#4 媒体类、#5 厂商类）。

| #0 路由 | 方法 | 语义 |
|---|---|---|
| `/dsh-whale/balance.json` | GET | `{ok, totalBalance, currency, todayUsage}`；`?refresh=1` 强制立即拉取 |
| `/dsh-whale/size.json` | GET / PUT | #0 为存根：GET 返回 `{}`，PUT 接受任意 JSON 并落盘到 `globalStorageUri/size.json` |
| `/dsh-whale/image.png` | GET | 返回 `media/placeholder-whale.png`（自研，见 §13） |

### 6.5 被否决的通信方案

| 方案 | 否决理由 |
|---|---|
| **全桥**（连媒体也走 postMessage） | `bubble-money1.gif` 2.7 MB、`DSniang1.png` 256 KB 每次启动 base64 过内存；音频无 range 支持需自行分片；blob URL 需手动 revoke，易泄漏 |
| **干净 RPC**（自定义 `{type:'getBalance'}`，前端重写） | 上游 14949 行前端与 21 条路由语义全部作废，C 档退化为从零开发，与"以原仓库为内核"目标冲突 |

---

## 7. 数据流

```
定时器(60s) / 用户点击
      │
      ▼
statusbar.refresh()
      ├─▶ credentials.resolve()           ← SecretStorage → env
      ├─▶ deepseek.fetchBalance(key)      ← HTTPS GET /user/balance，8s 超时
      ├─▶ accounting.observeBalance(ledger, {balance, currency, scope:'deepseek', at})
      ├─▶ ledger.save()                   ← 原子写 globalStorageUri/ledger.json
      ├─▶ statusbar.render(summary)
      └─▶ webviewHost.broadcast({kind:'event', name:'balance', payload: summary})

webview 侧（#1 起）
      fetch('/dsh-whale/balance.json') ──▶ fetch shim ──▶ 信封 ──▶ registry.dispatch ──▶ 复用同一份 summary
```

`scope` 固定为 `'deepseek'`；`accounting.mjs` 内部按 `scope + '-' + currency` 分账本，因此多币种天然隔离。

---

## 8. 错误处理

| 情况 | 行为 |
|---|---|
| 未配置密钥 | 状态栏 `$(key) 鲸鱼 · 未配置`，点击 → 引导设置命令；**不弹窗** |
| 密钥无效（HTTP 401） | 状态栏 `🐋 Key 无效`，详情写 OutputChannel |
| 网络失败 / 8s 超时 | **沿用最近一次余额**（上游既有行为），状态栏加 `~` 前缀标 stale，下个周期自动重试 |
| 响应格式异常 | 按网络失败处理；OutputChannel 记原始响应前 500 字符 |
| 币种非 CNY | 照常显示（内核按币种分账本），状态栏带币种符号 |
| 账本写盘失败 | 记日志，内存账本继续工作，**不阻塞 UI** |
| 未注册路由 | 404 + 日志，不抛异常到宿主 |

---

## 9. 测试策略

**vitest（纯 Node，秒级）**：

| 测试文件 | 覆盖 |
|---|---|
| `registry.test.ts` | 信封编解码往返、路由命中、未注册路径 → 404、query 透传、method/body 透传 |
| `credentials.test.ts` | 回退链四种组合（SecretStorage 有/无 × env 有/无）、空字符串与空白串视为未配置 |
| `accounting.test.ts` | 观测序列、余额上升（充值）不冲抵已有消费、重复与乱序观测被忽略、校正流程、8 位小数边界、非法金额抛错 |
| `deepseek.test.ts` | 正常响应解析、字段缺失、非 CNY 币种、401、超时、畸形 JSON |

**手动验收清单**：见 §11。

**本期不引入 `@vscode/test-electron`**：它需下载整个 VSCode、单次运行数十秒，而 #0 的逻辑已全部可纯函数化测试。等 #1 有鲸鱼 DOM 后再引入。此为主动取舍，非省略。

---

## 10. 技术栈与构建

| 项 | 选择 |
|---|---|
| 语言 | TypeScript，`strict: true`，`allowJs: true` |
| 构建 | esbuild 三入口：`src/extension.ts` → `dist/extension.js`（CJS，`vscode` 标 external）；`src/webview/shim.ts` → `dist/dshw-shim.js`（IIFE）；`src/webview/probe.ts` → `dist/probe.js`（IIFE） |
| 测试 | vitest |
| 类型 | `@types/vscode`、`@types/node` |
| 运行时依赖 | **零** |
| 引擎 | `engines.vscode: ^1.85.0` |
| 打包 | `npx @vscode/vsce package` |

---

## 11. 验收标准（#0 完成的定义）

1. F5 启动 → 状态栏出现 `$(key) 鲸鱼 · 未配置`
2. 执行 `鲸鱼: 设置 DeepSeek API Key` → 状态栏 10 秒内显示真实余额
3. 侧边栏打开 → 占位页显示的余额与状态栏**数字一致**
4. 密钥改错 → 状态栏显示 `Key 无效`，扩展不崩
5. 断网 → 显示旧值 + `~` 标记；恢复网络后自动转正常
6. `npx vitest run` 全绿
7. `npx @vscode/vsce package` 产出 `.vsix`，装入干净的 VSCode 可运行
8. 探针项的结论被记录（见 §12）

---

## 12. 风险与待验证项

| 项 | 状态 | 影响面 | 处理 |
|---|---|---|---|
| `asWebviewUri` 加载的音频**是否支持 HTTP range** | **未实测**（此前口头表述为"自带 range"属推断） | 仅 #4 的音频拖动/大文件播放 | #4 开工前实测；本期不受影响 |
| 上游前端（14949 行）的"只挂载在 DSH 聊天页"自检 | 未处理 | #1 主体工作量 | #1 设计时改写挂载入口 |
| 上游前端假设页面级 DOM（`document.body` 挂载、整页拖拽、右键菜单） | 未处理 | #1 的交互退化 | #1 设计时限定到面板内部 |
| webview CSP 对 blob / data URL 的限制 | M1 验证 | 媒体显示 | M1 探针即为验证手段 |
| 34 个厂商模板无法逐个真机验证 | 已知限制（#5） | #5 的可信度 | #5 设计时标注"未验证"并给出探活机制 |

---

## 13. 许可与归属

- 上游**代码**为 MIT：`Copyright (c) 2026 MeteorNOX`。
- 上游 `assets/**`（图片 / 动图 / 音效）**不适用 MIT**：按其 `PROVENANCE.md`，「按 as-is 随插件分发、仅用于运行本插件；不授予再许可」。**本项目为公开发布项目，故一律不使用上游美术素材。**
- `src/core/accounting.mjs` **逐字节原样搬运**，不添加任何注释或改动，以保证可随时与上游 diff。归属声明写在 `LICENSE` 与 `NOTICE.md`，而非源文件内。
- 为保这个逐字节承诺不被静默破坏，仓库根放 `.gitattributes`，用 `* text=auto eol=lf` 抵消 Windows 默认的 `core.autocrlf=true`（否则 checkout 会把 LF 转 CRLF，上游比对与哈希校验全部失效），并把 `*.png|gif|jpg|mp3|wav|vsix` 标为 `binary` 以免媒体被当文本转换。
- `#0` 的 `media/` 占位图**由本项目自行生成**（纯几何图形），不使用任何第三方素材，随本项目 MIT 授权。
- #1 起的鲸鱼形象需另做设计决策（自绘 / 自行生成 / 选用可自由再分发的开源素材），不在本期范围。

---

## 14. 术语

| 术语 | 含义 |
|---|---|
| **DSH** | DeepSeek Harness，上游插件的目标宿主 |
| **上游** | `MeteorNOX/DeepSeek-Balance-Whale-Widget` 仓库 |
| **路由** | `/dsh-whale/*` 风格的虚拟 HTTP 端点，由宿主路由表实现，不经过真实网络 |
| **shim** | 注入 webview 的拦截层：fetch shim 处理数据类，媒体 shim 处理资源类 |
| **信封** | §6.1 定义的三条消息形状（request / response / event） |
| **探针（M1）** | #0 的第一个里程碑，只为验证两个 shim 在真 VSCode 中成立 |
| **已观测消费** | 由余额下降累计得出的当日消费，区别于按 token 估算 |
