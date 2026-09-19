export interface BalanceSnapshot {
  balance: number
  currency: string
}

export type BalanceErrorCode = 'AUTH' | 'NETWORK' | 'TIMEOUT' | 'FORMAT'

export class BalanceError extends Error {
  constructor(message: string, readonly code: BalanceErrorCode) {
    super(message)
    this.name = 'BalanceError'
  }
}
