# vscode_whale_widget

在 VSCode 里实时查看 DeepSeek API 余额的小鲸鱼挂件。

> 当前进度：**#0 骨架与通信层**。状态栏已可显示真实余额；鲸鱼形象与交互在 #1 落地。
> 规划见 `docs/superpowers/specs/`。

## 功能（#0）

- 状态栏常驻：`🐋 ¥23.45 · 今日 ¥1.02`
- 60 秒自动刷新（可配置，最小 15 秒），点击立即刷新
- 侧边栏自检页，用于验证通信层
- 今日已用 = 当日余额下降的累计值；充值不冲抵消费
- 密钥存于系统凭据管理器，可回退读取环境变量

## 安装

从 GitHub Releases 下载 `vscode-whale-widget-<version>.vsix`，然后：

```bash
code --install-extension vscode-whale-widget-0.0.1.vsix
```

## 配置密钥

命令面板（`Ctrl+Shift+P`）执行 **鲸鱼: 设置 DeepSeek API Key**。

密钥写入 VSCode `SecretStorage`（Windows 走凭据管理器），不落进 `settings.json`。
也可以改用环境变量：设置 `whaleWidget.envVarName`（默认 `DEEPSEEK_API_KEY`）指向的环境变量。

## 命令

| 命令 | 说明 |
|---|---|
| 鲸鱼: 设置 DeepSeek API Key | 输入并保存密钥 |
| 鲸鱼: 清除已保存的 API Key | 删除凭据管理器中的密钥 |
| 鲸鱼: 立即刷新余额 | 跳过定时器立刻刷新 |
| 鲸鱼: 显示日志 | 打开输出面板 |

## 开发

```bash
npm install
npm run build     # 三入口：extension / shim / probe
npm run watch     # 监听构建
npm run typecheck
npm run test      # vitest
npm run package   # 产出 .vsix
```

按 `F5` 启动扩展开发宿主。

## 设计文档

- 设计：`docs/superpowers/specs/2026-09-19-skeleton-and-bridge-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-19-skeleton-and-bridge.md`

## 许可

MIT。记账内核复用自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT, Copyright (c) 2026 MeteorNOX），详见 `NOTICE.md`。上游的美术素材不在 MIT 范围内，本项目未使用。
