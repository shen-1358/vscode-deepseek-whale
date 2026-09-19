import { describe, expect, it } from 'vitest'
import { BalanceError } from '../src/provider/types'
import { DEEPSEEK_BALANCE_URL, fetchBalance, parseBalanceResponse } from '../src/provider/deepseek'

const OK_BODY = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '23.45', granted_balance: '0.00', topped_up_balance: '23.45' },
  ],
}

describe('parseBalanceResponse', () => {
  it('解析字符串金额与币种', () => {
    expect(parseBalanceResponse(OK_BODY)).toEqual({ balance: 23.45, currency: 'CNY' })
  })

  it('币种大写化', () => {
    expect(parseBalanceResponse({ balance_infos: [{ currency: 'usd', total_balance: '1' }] }))
      .toEqual({ balance: 1, currency: 'USD' })
  })

  it('缺少币种时默认 CNY', () => {
    expect(parseBalanceResponse({ balance_infos: [{ total_balance: '1' }] }))
      .toEqual({ balance: 1, currency: 'CNY' })
  })

  it('缺少 balance_infos 抛 FORMAT', () => {
    expect(() => parseBalanceResponse({})).toThrow(BalanceError)
    try { parseBalanceResponse({}) } catch (err) { expect((err as BalanceError).code).toBe('FORMAT') }
  })

  it('空数组抛 FORMAT', () => {
    expect(() => parseBalanceResponse({ balance_infos: [] })).toThrow(BalanceError)
  })

  it('金额非法抛 FORMAT', () => {
    expect(() => parseBalanceResponse({ balance_infos: [{ total_balance: 'abc' }] })).toThrow(BalanceError)
  })

  it('非对象抛 FORMAT', () => {
    expect(() => parseBalanceResponse(null)).toThrow(BalanceError)
    expect(() => parseBalanceResponse('x')).toThrow(BalanceError)
  })
})

describe('fetchBalance', () => {
  it('带上 Bearer 头请求正确地址', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify(OK_BODY), { status: 200 })
    }) as unknown as typeof fetch
    const snap = await fetchBalance({ key: 'sk-test', fetchImpl: fake })
    expect(snap).toEqual({ balance: 23.45, currency: 'CNY' })
    expect(calls[0]?.url).toBe(DEEPSEEK_BALANCE_URL)
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('401 抛 AUTH', async () => {
    const fake = (async () => new Response('{"error":"bad key"}', { status: 401 })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'AUTH' })
  })

  it('5xx 抛 NETWORK', async () => {
    const fake = (async () => new Response('oops', { status: 503 })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('网络异常抛 NETWORK', async () => {
    const fake = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('超时抛 TIMEOUT', async () => {
    const fake = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake, timeoutMs: 5 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('非 JSON 响应抛 FORMAT', async () => {
    const fake = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(fetchBalance({ key: 'x', fetchImpl: fake })).rejects.toMatchObject({ code: 'FORMAT' })
  })
})
