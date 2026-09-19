/**
 * 表情规则：**纯函数**，不 import `vscode` 也不碰 DOM。
 * 由宿主侧调用（webview 读不到 `workspace` 配置），结果随 balance.json 下发。
 */
export type Mood = 'delighted' | 'sleepy' | 'determined'

export type MoodState = 'ok' | 'no-key' | 'auth-error' | 'network-error'

export interface MoodInput {
  state: MoodState
  balance?: number
  threshold: number
}

/**
 * 判定只看「余额健康度」：
 * - 有数据（含断网沿用旧值）→ 按余额与阈值比大小
 * - 没数据 → 未配置密钥是困，其余（Key 无效 / 网络异常）是坚定
 * `stale` 刻意不参与：数字还在，脸就不该变，不新鲜由 `~` 前缀与文案承担。
 */
export function pickMood(input: MoodInput): Mood {
  if (input.state === 'ok') {
    const healthy = typeof input.balance === 'number'
      && Number.isFinite(input.balance)
      && input.balance >= input.threshold
    return healthy ? 'delighted' : 'determined'
  }
  return input.state === 'no-key' ? 'sleepy' : 'determined'
}

/** webview 里写的 URL；媒体 shim 会把它改写成 asWebviewUri 指向的地址 */
export const MOOD_ART: Record<Mood, string> = {
  delighted: '/dsh-whale/whale-delighted.png',
  sleepy: '/dsh-whale/whale-sleepy.png',
  determined: '/dsh-whale/whale-determined.png',
}

export const MOOD_LABEL: Record<Mood, string> = {
  delighted: '开心',
  sleepy: '困',
  determined: '坚定',
}
