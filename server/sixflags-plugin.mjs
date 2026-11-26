import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'node:os'
import { ParkRoom } from './sixflags-room.mjs'
import { ChurchRoom } from './church-room.mjs'

export function attachPark(server, room = new ParkRoom(), endpoint = '/__sixflags') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 })
  const clients = new Map()
  const send = (ws, value) => { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 128000) ws.send(JSON.stringify(value)) }
  const upgrade = (req, socket, head) => {
    if (req.url?.split('?')[0] !== endpoint) return
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  }
  server.on('upgrade', upgrade)
  wss.on('connection', ws => {
    let id = null, alive = true, count = 0
    const joinedBy = setTimeout(() => { if (!id) ws.close(1000, 'Join timeout') }, 120000)
    clients.set(ws, () => { if (!alive) return ws.terminate(); alive = false; count = 0; ws.ping() })
    ws.on('pong', () => { alive = true })
    send(ws, { type: 'ready' })
    ws.on('message', data => {
      if (++count > 2000) return ws.close(1008, 'Too many messages')
      try {
        const msg = JSON.parse(data.toString())
        if (!msg || typeof msg !== 'object') return
        if (msg.type === 'join' && !id) { const player = room.join(msg.nickname, msg.gender); id = player.id; clearTimeout(joinedBy); send(ws, { type: 'joined', id }); send(ws, room.snapshot()) }
        else if (id) room.command(id, msg)
      } catch (error) { send(ws, { type: 'error', message: error instanceof SyntaxError ? '메시지 형식이 올바르지 않아요.' : error.message }) }
    })
    ws.on('error', () => {})
    ws.on('close', () => { clearTimeout(joinedBy); if (id) room.leave(id); clients.delete(ws) })
  })
  const interval = setInterval(() => { room.tick(.05); const state = room.snapshot(); for (const ws of clients.keys()) send(ws, state) }, 50)
  const heartbeat = setInterval(() => { for (const ping of clients.values()) ping() }, 15000)
  const dispose = () => { clearInterval(interval); clearInterval(heartbeat); server.off('upgrade', upgrade); for (const ws of clients.keys()) ws.terminate(); wss.close() }
  server.once('close', dispose)
  return { room, dispose }
}

export default function sixflagsPlugin() {
  function setup(vite) {
    if (!vite.httpServer) return
    attachPark(vite.httpServer)
    attachPark(vite.httpServer, new ChurchRoom(), '/__church')
    for (const example of ['sixflags', 'church']) vite.middlewares.use(`/__${example}/info`, (_req, res) => {
      const address = vite.httpServer.address()
      const port = typeof address === 'object' && address ? address.port : 5174
      const protocol = typeof vite.httpServer.setSecureContext === 'function' ? 'https' : 'http'
      const ips = Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ urls: ips.map(ip => `${protocol}://${ip}:${port}/?example=${example}`) }))
    })
  }
  return { name: 'sixflags-local-multiplayer', configureServer: setup, configurePreviewServer: setup }
}
