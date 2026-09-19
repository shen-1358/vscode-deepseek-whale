import { describe, expect, it } from 'vitest'
import { buildCsp, buildHtml } from '../src/webview/html'
import { MEDIA_MAP_ELEMENT_ID } from '../src/webview/shim'

const uris = {
  shim: 'vscode-webview-resource://x/dist/dshw-shim.js',
  entry: 'vscode-webview-resource://x/dist/probe.js',
  media: 'vscode-webview-resource://x/media',
}

describe('buildCsp', () => {
  it('禁止默认来源，只放行 nonce 脚本与 cspSource 资源', () => {
    const csp = buildCsp('vscode-webview-resource://x', 'NONCE123')
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'nonce-NONCE123'")
    expect(csp).toContain('img-src vscode-webview-resource://x data:')
    expect(csp).toContain('media-src vscode-webview-resource://x blob:')
    expect(csp).toContain("connect-src 'none'")
  })
})

describe('buildHtml', () => {
  it('注入入口脚本并带 nonce', () => {
    const html = buildHtml({ cspSource: 'vscode-webview-resource://x', nonce: 'NONCE123', uris, mediaMap: {} })
    expect(html).toContain('<script nonce="NONCE123" src="vscode-webview-resource://x/dist/dshw-shim.js"></script>')
    expect(html).toContain('<script nonce="NONCE123" src="vscode-webview-resource://x/dist/probe.js"></script>')
  })

  it('shim 排在入口脚本之前（入口依赖 shim 先装好）', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {} })
    expect(html.indexOf('dshw-shim.js')).toBeLessThan(html.indexOf('probe.js'))
  })

  it('媒体映射以 application/json 脚本注入（不执行，故不受 CSP 限制）', () => {
    const html = buildHtml({
      cspSource: 'c', nonce: 'n', uris,
      mediaMap: { '/dsh-whale/image.png': 'vscode-webview-resource://x/media/whale-delighted.png' },
    })
    expect(html).toContain(`<script type="application/json" id="${MEDIA_MAP_ELEMENT_ID}">`)
    expect(html).toContain('whale-delighted.png')
  })

  it('转义 JSON 里的尖括号，避免提前闭合脚本标签', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: { '/a</script>': 'u' } })
    // 取出 JSON 数据块本身，确认里面不存在任何裸尖括号（否则会提前闭合 </script>）
    const block = html.match(new RegExp(`id="${MEDIA_MAP_ELEMENT_ID}">([\\s\\S]*?)</script>`))
    expect(block).not.toBeNull()
    const payload = block![1]!
    expect(payload).not.toContain('<')
    expect(payload).not.toContain('>')
    expect(payload).toContain('\\u003c/script\\u003e')
    expect(html).not.toContain('</script><')
  })

  it('带上 CSP meta 与本扩展的资源根', () => {
    const html = buildHtml({ cspSource: 'vscode-webview-resource://x', nonce: 'n', uris, mediaMap: {} })
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain('img-src vscode-webview-resource://x')
  })

  it('根元素 id 与占位文案可定制（侧边栏用 app，探针用 probe）', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {}, rootId: 'app' })
    expect(html).toContain('<div id="app"></div>')
    const probe = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {}, rootId: 'probe', rootPlaceholder: '正在自检…' })
    expect(probe).toContain('<div id="probe">正在自检…</div>')
  })
})
