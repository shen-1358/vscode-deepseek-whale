/**
 * webview 的 HTML 与 CSP 生成。
 *
 * 刻意不 import `vscode`：这里只是字符串拼接，依赖 vscode 会让整个模块
 * 无法在 Node 中被测试（vscode 是宿主注入的运行时模块，不在 node_modules 里）。
 * 与宿主 API 打交道的部分留在 host.ts。
 */
import { MEDIA_MAP_ELEMENT_ID } from './shim'

export interface HtmlUris {
  shim: string
  probe: string
  media: string
}

export interface BuildHtmlInput {
  cspSource: string
  nonce: string
  uris: HtmlUris
  mediaMap: Record<string, string>
}

export function buildCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `media-src ${cspSource} blob:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src 'none'`,
  ].join('; ')
}

export function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

export function buildHtml(input: BuildHtmlInput): string {
  const { cspSource, nonce, uris, mediaMap } = input
  const csp = buildCsp(cspSource, nonce)
  // 以 application/json 注入：不会被执行，因此不受 script-src 的 nonce 限制。
  const mediaJson = escapeJsonForScript(JSON.stringify(mediaMap))
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>小鲸鱼</title>
<style>
  body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
</style>
</head>
<body>
<div id="probe">正在自检…</div>
<script type="application/json" id="${MEDIA_MAP_ELEMENT_ID}">${mediaJson}</script>
<script nonce="${nonce}" src="${uris.shim}"></script>
<script nonce="${nonce}" src="${uris.probe}"></script>
</body>
</html>`
}
