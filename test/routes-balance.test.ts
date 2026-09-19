import { describe, expect, it } from 'vitest'
import { RouteTable } from '../src/routes/registry'
import { registerBalanceRoutes } from '../src/routes/balance'
import type { RefreshResult } from '../src/core/refresh'

function table(results: RefreshResult[], store?: { readJson: (n: string) => Promise<unknown>; writeJson: (n: string, v: unknown) => Promise<void> }) {
  const queue = [...results]
  const refresher = Object.assign(async () => queue.shift() ?? results[results.length - 1], {
    last: () => results[results.length - 1] ?? null,
  }) as { (force?: boolean): Promise<RefreshResult>; last(): RefreshResult | null }
  const t = new RouteTable()
  registerBalanceRoutes(t, {
    refresh: refresher,
    readSize: async () => (store ? (await store.readJson('size.json')) as Record<string, unknown> : {}),
    writeSize: async value => { if (store) await store.writeJson('size.json', value) },
  })
  return t
}

const OK: RefreshResult = {
  state: 'ok', balance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: false,
  observedAt: Date.parse('2026-09-19T02:00:00Z'),
}

describe('balance.json', () => {
  it('返回上游字段形状', async () => {
    const res = await table([OK]).dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true, totalBalance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: false,
      observedAt: Date.parse('2026-09-19T02:00:00Z'),
    })
  })

  it('未配置密钥时 ok=false 且带 code', async () => {
    const res = await table([{ state: 'no-key', message: '未配置 API Key' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'NO_KEY' })
  })

  it('密钥无效映射为 AUTH', async () => {
    const res = await table([{ state: 'auth-error', message: 'bad' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(JSON.parse(res.body).code).toBe('AUTH')
  })

  it('网络异常映射为 NETWORK', async () => {
    const res = await table([{ state: 'network-error', message: 'down' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(JSON.parse(res.body).code).toBe('NETWORK')
  })

  it('?refresh=1 触发实际拉取；无该参数且已有缓存则直接用缓存', async () => {
    const seen: boolean[] = []
    const t = new RouteTable()
    registerBalanceRoutes(t, {
      refresh: Object.assign(async (force?: boolean) => { seen.push(force === true); return OK }, { last: () => OK }),
      readSize: async () => ({}),
      writeSize: async () => {},
    })
    await t.dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: 'refresh=1' })
    await t.dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(seen).toEqual([true])
  })

  it('只接受 GET', async () => {
    const res = await table([OK]).dispatch({ method: 'PUT', path: '/dsh-whale/balance.json', query: '' })
    expect(res.status).toBe(405)
  })
})

describe('size.json', () => {
  it('GET 返回已存配置', async () => {
    const t = table([OK], { readJson: async () => ({ scale: 1.2 }), writeJson: async () => {} })
    const res = await t.dispatch({ method: 'GET', path: '/dsh-whale/size.json', query: '' })
    expect(JSON.parse(res.body)).toEqual({ scale: 1.2 })
  })

  it('PUT 写入并回 ok', async () => {
    let saved: unknown = null
    const t = table([OK], { readJson: async () => ({}), writeJson: async (_n, v) => { saved = v } })
    const res = await t.dispatch({
      method: 'PUT', path: '/dsh-whale/size.json', query: '',
      body: JSON.stringify({ scale: 0.8 }),
    })
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(saved).toEqual({ scale: 0.8 })
  })

  it('PUT 非法 JSON 返回 400', async () => {
    const t = table([OK], { readJson: async () => ({}), writeJson: async () => {} })
    const res = await t.dispatch({ method: 'PUT', path: '/dsh-whale/size.json', query: '', body: '{oops' })
    expect(res.status).toBe(400)
  })

  it('PUT 非对象返回 400', async () => {
    const t = table([OK], { readJson: async () => ({}), writeJson: async () => {} })
    const res = await t.dispatch({ method: 'PUT', path: '/dsh-whale/size.json', query: '', body: '[1]' })
    expect(res.status).toBe(400)
  })
})

describe('image.png', () => {
  it('媒体不走路由：返回 404 并提示应走 asWebviewUri', async () => {
    const res = await table([OK]).dispatch({ method: 'GET', path: '/dsh-whale/image.png', query: 'v=2' })
    expect(res.status).toBe(404)
    expect(res.body).toContain('asWebviewUri')
  })
})
