import { BalanceError, type BalanceSnapshot } from './types'

export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'
export const DEFAULT_TIMEOUT_MS = 8000

export interface FetchBalanceOptions {
  key: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  url?: string
}

export function parseBalanceResponse(raw: unknown): BalanceSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new BalanceError('响应不是对象', 'FORMAT')
  }
  const infos = (raw as { balance_infos?: unknown }).balance_infos
  if (!Array.isArray(infos) || infos.length === 0) {
    throw new BalanceError('响应缺少 balance_infos', 'FORMAT')
  }
  // 只取第一项：DeepSeek 目前对单个账号只返回一个币种的余额。
  // 若将来出现多币种数组，这里会静默丢掉后面的币种（见「Task 10 执行记录」遗留项）。
  const first = infos[0] as { total_balance?: unknown; currency?: unknown }
  const balance = Number(first?.total_balance)
  if (!Number.isFinite(balance)) {
    throw new BalanceError(`total_balance 不是有效数字：${String(first?.total_balance)}`, 'FORMAT')
  }
  const currency = String(first?.currency ?? 'CNY').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BalanceError(`币种无效：${currency}`, 'FORMAT')
  }
  return { balance, currency }
}

export async function fetchBalance(options: FetchBalanceOptions): Promise<BalanceSnapshot> {
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await doFetch(options.url ?? DEEPSEEK_BALANCE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
    throw new BalanceError(aborted ? `请求超时（${timeoutMs}ms）` : `网络请求失败：${messageOf(err)}`, aborted ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) {
    throw new BalanceError('API Key 无效或无权限', 'AUTH')
  }
  if (!response.ok) {
    throw new BalanceError(`HTTP ${response.status}`, 'NETWORK')
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BalanceError(`响应不是 JSON：${text.slice(0, 500)}`, 'FORMAT')
  }
  return parseBalanceResponse(parsed)
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
