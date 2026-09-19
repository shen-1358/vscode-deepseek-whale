import { describe, expect, it } from 'vitest'
import {
  CHANNEL, RouteTable, decodeRequest, encodeEvent, encodeResponse,
  jsonResponse, parseQuery,
} from '../src/routes/registry'

describe('decodeRequest', () => {
  it('接受合法请求', () => {
    const req = decodeRequest({
      ch: CHANNEL, id: 7, kind: 'request', method: 'get',
      path: '/dsh-whale/balance.json', query: 'refresh=1',
    })
    expect(req).toEqual({
      method: 'GET', path: '/dsh-whale/balance.json', query: 'refresh=1',
      body: undefined, contentType: undefined,
    })
  })

  it('缺少 method 时默认 GET', () => {
    const req = decodeRequest({ ch: CHANNEL, kind: 'request', path: '/dsh-whale/a.json' })
    expect(req?.method).toBe('GET')
  })

  it('拒绝其他频道', () => {
    expect(decodeRequest({ ch: 'other', kind: 'request', path: '/x' })).toBeNull()
  })

  it('拒绝非 request 形状', () => {
    expect(decodeRequest({ ch: CHANNEL, kind: 'event', name: 'x' })).toBeNull()
  })

  it('拒绝没有 path 的请求', () => {
    expect(decodeRequest({ ch: CHANNEL, kind: 'request' })).toBeNull()
    expect(decodeRequest({ ch: CHANNEL, kind: 'request', path: '' })).toBeNull()
  })

  it('拒绝非对象', () => {
    expect(decodeRequest(null)).toBeNull()
    expect(decodeRequest('nope')).toBeNull()
  })
})

describe('encodeResponse / encodeEvent', () => {
  it('响应带 id 与频道', () => {
    expect(encodeResponse(3, jsonResponse({ ok: true }))).toEqual({
      ch: CHANNEL, id: 3, kind: 'response', status: 200,
      contentType: 'application/json', body: '{"ok":true}',
    })
  })

  it('事件不带 id', () => {
    const env = encodeEvent('balance', { totalBalance: 1 })
    expect(env.ch).toBe(CHANNEL)
    expect(env.kind).toBe('event')
    expect(env.name).toBe('balance')
    expect(env.id).toBeUndefined()
  })
})

describe('parseQuery', () => {
  it('解析查询串', () => {
    expect(parseQuery('a=1&b=x%20y')).toEqual({ a: '1', b: 'x y' })
  })

  it('空串得到空对象', () => {
    expect(parseQuery('')).toEqual({})
  })
})

describe('RouteTable', () => {
  it('命中已注册路由', async () => {
    const table = new RouteTable()
    table.register('/dsh-whale/a.json', () => jsonResponse({ hit: true }))
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/a.json', query: '' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ hit: true })
  })

  it('未注册路径返回 404 且不抛异常', async () => {
    const table = new RouteTable()
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/nope.json', query: '' })
    expect(res.status).toBe(404)
    expect(JSON.parse(res.body).ok).toBe(false)
  })

  it('处理器抛错时返回 500 而不是冒泡', async () => {
    const table = new RouteTable()
    table.register('/dsh-whale/boom.json', () => { throw new Error('炸了') })
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/boom.json', query: '' })
    expect(res.status).toBe(500)
    expect(JSON.parse(res.body).error).toBe('炸了')
  })

  it('异步处理器被 await', async () => {
    const table = new RouteTable()
    table.register('/dsh-whale/slow.json', async () => {
      await new Promise(r => setTimeout(r, 1))
      return jsonResponse({ done: true })
    })
    const res = await table.dispatch({ method: 'GET', path: '/dsh-whale/slow.json', query: '' })
    expect(JSON.parse(res.body).done).toBe(true)
  })

  it('has() 反映注册状态', () => {
    const table = new RouteTable()
    expect(table.has('/dsh-whale/a.json')).toBe(false)
    table.register('/dsh-whale/a.json', () => jsonResponse({}))
    expect(table.has('/dsh-whale/a.json')).toBe(true)
  })
})
