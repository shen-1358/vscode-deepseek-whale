export declare const ACCOUNTING_VERSION: 1

export interface Ledger {
  accounting?: {
    version: number
    active: string
    books: Record<string, Book>
    migratedAt?: number
    legacyHistory?: Record<string, number>
  }
  date?: string
  dayStart?: number
  lastBalance?: number
  todayUsage?: number
  history?: Record<string, number>
  events?: { day: string; cost: number }[]
  [key: string]: unknown
}

export interface Book {
  currency: string
  days: Record<string, DayRow>
  lastAt?: number
}

export interface DayRow {
  day: string
  firstAt: number
  lastAt: number
  openingUnits: number
  lastUnits: number
  debitUnits: number
  creditUnits: number
  revision: number
  correction: unknown
}

export interface BalanceSummary {
  day: string
  amount: number
  currency: string
  source: 'balance-observed' | 'balance-corrected' | 'balance-needs-review'
  label: string
  firstObservedAt: number
  lastObservedAt: number
  openingBalance: number
  currentBalance: number
  observedDecrease: number
  observedIncrease: number
  needsReview: boolean
  partialDay: true
  revision: string
  credits: number | null
  otherDebits: number | null
  correctedAt: number | null
}

export interface BalanceSnapshotInput {
  at?: number
  balance: unknown
  currency?: string
  scope?: string
}

export declare function moneyUnits(value: unknown): number
export declare function preciseMoney(value: unknown): number
export declare function addMoney(a: unknown, b: unknown): number
export declare function sumMoney(values: unknown[]): number
export declare function beijingDay(time?: number): string
export declare function dayOffset(day: string, offset: number): string
export declare function accountingDays(ledger: Ledger): string[]
export declare function balanceSummary(ledger: Ledger, day?: string): BalanceSummary | null
export declare function observeBalance(ledger: Ledger, snapshot: BalanceSnapshotInput): BalanceSummary | null
export declare function reconcileBalance(
  ledger: Ledger,
  input: { day: string; revision: string; action?: string; confirmed?: boolean; credits?: unknown; otherDebits?: unknown },
  now?: number
): BalanceSummary
export declare function eventEstimate(ledger: Ledger, day: string): number
export declare function daySummary(ledger: Ledger, day: string): Record<string, unknown>
