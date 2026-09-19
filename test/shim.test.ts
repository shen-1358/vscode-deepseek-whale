import { describe, expect, it } from 'vitest'
import { MEDIA_MAP_ELEMENT_ID, normalizeMediaKey, parseMediaMap, splitPathQuery } from '../src/webview/shim'

describe('splitPathQuery', () => {
  it('拆分路径与查询串', () => {
    expect(splitPathQuery('/dsh-whale/a.png?id=1')).toEqual({ path: '/dsh-whale/a.png', query: 'id=1' })
  })

  it('无查询串时 query 为空', () => {
    expect(splitPathQuery('/dsh-whale/a.png')).toEqual({ path: '/dsh-whale/a.png', query: '' })
  })

  it('问号后为空时 query 为空', () => {
    expect(splitPathQuery('/dsh-whale/a.png?')).toEqual({ path: '/dsh-whale/a.png', query: '' })
  })
})

describe('normalizeMediaKey', () => {
  it('查询串按键名排序，保证同一资源只有一个键', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png?b=2&a=1')).toBe('/dsh-whale/b.png?a=1&b=2')
  })

  it('无查询串时键就是路径', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png')).toBe('/dsh-whale/b.png')
  })

  it('丢掉空查询串', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png?')).toBe('/dsh-whale/b.png')
  })

  it('保留重复键的第一个值', () => {
    expect(normalizeMediaKey('/dsh-whale/b.png?a=1&a=2')).toBe('/dsh-whale/b.png?a=1')
  })
})

describe('parseMediaMap', () => {
  it('解析注入的 JSON 映射', () => {
    const map = parseMediaMap('{"\\/dsh-whale\\/image.png":"vscode-webview-resource://x/image.png"}')
    expect(map.get('/dsh-whale/image.png')).toBe('vscode-webview-resource://x/image.png')
  })

  it('键会被归一化', () => {
    const map = parseMediaMap('{"/dsh-whale/b.png?z=1&a=2":"u"}')
    expect(map.get('/dsh-whale/b.png?a=2&z=1')).toBe('u')
  })

  it('空串或非法 JSON 得到空映射而不抛错', () => {
    expect(parseMediaMap('').size).toBe(0)
    expect(parseMediaMap('not json').size).toBe(0)
    expect(parseMediaMap('null').size).toBe(0)
    expect(parseMediaMap('[1,2]').size).toBe(0)
  })

  it('忽略非字符串值', () => {
    expect(parseMediaMap('{"/a":1,"/b":"u"}').size).toBe(1)
  })

  it('导出的元素 id 与宿主约定一致', () => {
    expect(MEDIA_MAP_ELEMENT_ID).toBe('dshw-media')
  })
})
