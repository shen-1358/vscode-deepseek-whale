import { describe, expect, it } from 'vitest'
import { RouteTable } from '../src/routes/registry'
import { ALLOWED_COMMANDS, registerCommandRoute } from '../src/routes/command'

function table() {
  const executed: string[] = []
  const t = new RouteTable()
  registerCommandRoute(t, { execute: async command => { executed.push(command) } })
  return { t, executed }
}

const request = (body: string, method = 'POST') => ({
  method, path: '/dsh-whale/command.json', query: '', body,
})

describe('command.json', () => {
  it('白名单内的命令被真正执行', async () => {
    const { t, executed } = table()
    const res = await t.dispatch(request(JSON.stringify({ command: 'whale.refresh' })))
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(executed).toEqual(['whale.refresh'])
  })

  it('白名单外的命令返回 403 且不执行', async () => {
    const { t, executed } = table()
    const res = await t.dispatch(request(JSON.stringify({ command: 'workbench.action.terminal.new' })))
    expect(res.status).toBe(403)
    expect(executed).toEqual([])
  })

  it('非 POST 返回 405', async () => {
    const { t } = table()
    expect((await t.dispatch(request('', 'GET'))).status).toBe(405)
    expect((await t.dispatch(request('', 'PUT'))).status).toBe(405)
  })

  it('缺 command 或非法 JSON 返回 400', async () => {
    const { t } = table()
    expect((await t.dispatch(request('{oops'))).status).toBe(400)
    expect((await t.dispatch(request('{}'))).status).toBe(400)
    expect((await t.dispatch(request(JSON.stringify({ command: 42 })))).status).toBe(400)
  })

  it('白名单里都是本扩展自己的命令', () => {
    for (const command of ALLOWED_COMMANDS) expect(command.startsWith('whale.')).toBe(true)
  })
})
