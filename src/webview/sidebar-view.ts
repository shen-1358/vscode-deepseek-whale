/**
 * 侧边栏的**纯视图模型**：payload → 文案 / 按钮 / 表情。
 * 不碰 DOM、不 import `vscode`，所以能在 Node 里断言字符串。
 * DOM 写入在 sidebar-ui.ts。
 */
import { MOOD_ART, MOOD_LABEL, type Mood } from './mood'
// formatMoney / beijingStamp 都住在 statusview.ts，且该模块没有 vscode 依赖
// （见 Task 6 的模块边界记录），直接复用避免两套金额格式
import { beijingStamp, formatMoney } from '../statusview'

/** 字段与 `/dsh-whale/balance.json` 的成功/失败两个分支逐字对应 */
export interface PanelPayload {
  ok?: boolean
  mood?: Mood
  code?: string
  totalBalance?: number
  currency?: string
  todayUsage?: number | null
  stale?: boolean
  observedAt?: number
  // 失败分支也会下发 error，但文案只认 code（NOTE_BY_CODE），
  // 免得宿主换一句 message 就把侧边栏文案带跑
  error?: string
}

export interface PanelView {
  mood: Mood
  imageKey: string
  imageAlt: string
  balanceText: string
  todayText: string
  stampText: string
  note: string
  noteTone: 'info' | 'warn'
  showSetKey: boolean
}

const FALLBACK_MOOD: Mood = 'determined'

const NOTE_BY_CODE: Record<string, string> = {
  NO_KEY: '未配置 API Key',
  AUTH: 'API Key 无效或无权限',
  NETWORK: '网络异常，拿不到余额',
}

export function buildPanelView(payload: PanelPayload): PanelView {
  const mood = payload.mood && payload.mood in MOOD_ART ? payload.mood : FALLBACK_MOOD
  const currency = payload.currency ?? 'CNY'
  const failed = payload.ok === false
  const money = (value: number | null | undefined): string =>
    typeof value === 'number' && Number.isFinite(value) ? formatMoney(value, currency) : '--'

  const note = failed
    ? (NOTE_BY_CODE[payload.code ?? ''] ?? '读取余额失败，详情见输出面板')
    : payload.stale === true
      ? '网络异常，正在显示上次数据'
      : ''

  return {
    mood,
    imageKey: MOOD_ART[mood],
    imageAlt: `鲸鱼少女（${MOOD_LABEL[mood]}）`,
    balanceText: failed ? '--' : `${payload.stale === true ? '~ ' : ''}${money(payload.totalBalance)}`,
    todayText: failed ? '--' : money(payload.todayUsage),
    stampText: !failed && payload.observedAt ? `上次成功：${beijingStamp(payload.observedAt)}` : '',
    note,
    noteTone: note === '' ? 'info' : 'warn',
    showSetKey: payload.code === 'NO_KEY' || payload.code === 'AUTH',
  }
}
