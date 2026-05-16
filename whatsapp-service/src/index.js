/**
 * AgentFlow WhatsApp Service
 *
 * Conecta Baileys (WhatsApp Web) con el backend de AgentFlow.
 *
 * Funciones:
 *  - Recibe mensajes entrantes y los POSTea al webhook /api/whatsapp/webhook/incoming
 *  - Expone POST /send para que el backend mande mensajes salientes
 *  - Mantiene la sesion (auth_info_baileys/) entre reinicios
 *
 * Setup:
 *  1. npm install
 *  2. configurar .env con AGENTFLOW_API_URL, WHATSAPP_WEBHOOK_API_KEY, PORT
 *  3. node src/index.js
 *  4. escanear QR con WhatsApp Business app del celu dedicado de Beyker
 *  5. listo, queda emparejado
 */
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import express from 'express'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { fetch } from 'undici'

const PORT = parseInt(process.env.PORT || '3100', 10)
const AGENTFLOW_API_URL = process.env.AGENTFLOW_API_URL || 'http://localhost:8200/api'
const API_KEY = process.env.WHATSAPP_WEBHOOK_API_KEY || 'dev-secret'
const AUTH_FOLDER = process.env.AUTH_FOLDER || './auth_info_baileys'

const logger = pino({ level: 'info', transport: { target: 'pino-pretty' } })

let sock = null
let isReady = false

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    syncFullHistory: false,
    markOnlineOnConnect: true,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      logger.info('Escanea el QR con WhatsApp Business app del celu dedicado de Beyker:')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      isReady = true
      logger.info({ user: sock.user?.id }, 'Conectado a WhatsApp. Listo para recibir/enviar.')
    }

    if (connection === 'close') {
      isReady = false
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      logger.warn({ code, shouldReconnect }, 'Conexion cerrada')
      if (shouldReconnect) {
        setTimeout(startBaileys, 3000)
      } else {
        logger.error('Sesion cerrada por logout. Borrar auth_info_baileys/ y reescanear QR.')
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      // Solo mensajes entrantes (no propios) de chats individuales (no grupos)
      if (msg.key.fromMe) continue
      if (!msg.key.remoteJid?.endsWith('@s.whatsapp.net')) continue

      const phoneRaw = msg.key.remoteJid.split('@')[0]  // ej: 5491155551001
      const telefono = '+' + phoneRaw
      const nombre = msg.pushName || null
      const contenido =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        '[mensaje no soportado]'

      logger.info({ telefono, nombre, contenido }, 'Mensaje entrante')

      try {
        const res = await fetch(`${AGENTFLOW_API_URL}/whatsapp/webhook/incoming`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          body: JSON.stringify({
            telefono,
            nombre_contacto: nombre,
            contenido,
            meta_message_id: msg.key.id,
            timestamp: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
          }),
        })
        if (!res.ok) {
          logger.error({ status: res.status, text: await res.text() }, 'Webhook AgentFlow rechazo')
        } else {
          const body = await res.json()
          logger.info({ body }, 'Webhook OK')
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Error llamando webhook AgentFlow')
      }
    }
  })
}

// HTTP server para que AgentFlow pueda enviar mensajes salientes via este servicio
const app = express()
app.use(express.json())

app.use((req, res, next) => {
  if (req.path === '/health') return next()
  const key = req.header('X-API-Key')
  if (API_KEY && key !== API_KEY) {
    return res.status(401).json({ error: 'API key invalida' })
  }
  next()
})

app.get('/health', (req, res) => {
  res.json({ ok: true, baileys_ready: isReady, user: sock?.user?.id || null })
})

app.post('/send', async (req, res) => {
  if (!isReady || !sock) {
    return res.status(503).json({ ok: false, error: 'Baileys no esta listo' })
  }
  const { telefono, contenido } = req.body || {}
  if (!telefono || !contenido) {
    return res.status(400).json({ ok: false, error: 'telefono y contenido requeridos' })
  }

  // Normalizar telefono a formato WhatsApp jid
  const phone = telefono.replace(/[^0-9]/g, '')
  const jid = `${phone}@s.whatsapp.net`

  try {
    const result = await sock.sendMessage(jid, { text: contenido })
    logger.info({ jid, contenido }, 'Mensaje enviado')
    res.json({ ok: true, meta_message_id: result?.key?.id || null })
  } catch (err) {
    logger.error({ err: err.message, jid }, 'Error enviando mensaje')
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.listen(PORT, () => {
  logger.info(`WhatsApp service escuchando en :${PORT}`)
  logger.info(`AgentFlow API URL: ${AGENTFLOW_API_URL}`)
  startBaileys().catch((err) => {
    logger.error({ err: err.message }, 'Error iniciando Baileys')
    process.exit(1)
  })
})
