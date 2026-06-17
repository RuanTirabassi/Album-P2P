/**
 * server.js
 *
 * Servidor WebSocket do nó P2P, escutando na porta 8080.
 * Aceita conexões de outros nós (protocolo P2P) e do browser (UI dashboard).
 *
 * Conexões do browser são identificadas pelo header Sec-WebSocket-Protocol: 'ui'
 * ou pelo path /ui.
 *
 * Responsabilidades:
 * - Iniciar o WebSocket.Server na porta 8080
 * - Registrar peers ao receber HELLO (via peers.js)
 * - Rotear mensagens recebidas para messageHandler.js
 * - Remover peers ao detectar desconexão
 * - Aceitar conexão do dashboard e responder a comandos UI
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const peers = require('./peers');
const messageHandler = require('./messageHandler');
const state = require('./state');
inventory = require('./inventory');

const PORT = 8080;
const DEFAULT_TTL = 7;

function getLocalIp() {
  try {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) return alias.address;
      }
    }
  } catch (_) {}
  return 'localhost';
}

// Envia um objeto JSON para todos os browsers conectados
function broadcastToUI(obj) {
  const payload = JSON.stringify(obj);
  for (const client of state.uiClients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// Monta o snapshot completo do estado para o browser
function buildStatusSnapshot() {
  return {
    type:         'STATUS',
    self: {
      peer_id:    state.config.peer_id,
      sticker_id: state.config.sticker_id,
    },
    inventory:    state.getInventoryList ? state.getInventoryList() : inventory.listInventory(),
    peers:        peers.getPeerList ? peers.getPeerList() : [],
    tradeHistory: state.tradeHistory || [],
    timestamp:    new Date().toISOString(),
  };
}

function startServer(config) {
  state.setConfig({
    peer_id:    config.self.peer_id,
    sticker_id: config.self.sticker_id,
  });

  const wss = new WebSocket.Server({ port: PORT });
  console.log(`[SERVER] Servidor WebSocket ouvindo na porta ${PORT}`);

  wss.on('connection', (ws, req) => {
    const remoteIp = req.socket.remoteAddress;

    // Detecta se a conexão vem do browser (dashboard)
    const isUI =
      (req.headers['sec-websocket-protocol'] || '').includes('ui') ||
      (req.url || '').startsWith('/ui');

    if (isUI) {
      // ── Conexão do Dashboard (browser) ──────────────────────────────────
      console.log(`[SERVER] Browser/Dashboard conectado de ${remoteIp}`);
      state.uiClients.add(ws);

      ws.send(JSON.stringify(buildStatusSnapshot()));

      ws.on('message', (data) => {
        let cmd;
        try { cmd = JSON.parse(data.toString('utf-8')); }
        catch { return; }

        switch (cmd.type) {

          case 'GET_STATUS':
            ws.send(JSON.stringify(buildStatusSnapshot()));
            break;

          // Browser inicia busca — monta SEARCH no formato exato do spec
          case 'UI_SEARCH': {
            const query_id  = uuidv4();
            const message_id = uuidv4();

            const searchMsg = {
              type:             'SEARCH',
              message_id,
              origin_peer_id:   config.self.peer_id,
              origin_peer_ip:   getLocalIp(),
              sender_peer_id:   config.self.peer_id,
              receiver_peer_id: null,   // preenchido por cada vizinho no broadcast
              query_id,
              ttl:              DEFAULT_TTL,
              sticker_id:       (cmd.sticker_id || '').toUpperCase(),
            };

            // Marca como visto para não reprocessar se receber de volta
            state.seenQueries.add(query_id);
            state.pendingResults.set(query_id, []);

            // Verifica o próprio inventário primeiro
            const stickerNorm = (cmd.sticker_id || '').replace(/\.png$/i, '').toUpperCase();
            const localQty = inventory.hasSticker(stickerNorm);
            if (localQty > 0) {
              ws.send(JSON.stringify({
                type:       'SEARCH_RESULT',
                hits: [{
                  peer_id:    config.self.peer_id,
                  sticker_id: stickerNorm,
                  local:      true,
                }],
              }));
            }

            // Propaga para vizinhos e aguarda SEARCH_HIT
            peers.broadcast(searchMsg, null);
            state.pendingUISearches.set(query_id, ws);

            ws.send(JSON.stringify({
              type:       'SEARCH_STARTED',
              query_id,
              sticker_id: stickerNorm,
            }));
            break;
          }

          // Browser propõe troca — monta TRADE_OFFER no formato exato do spec
          case 'UI_TRADE_OFFER': {
            const target = peers.getSocket ? peers.getSocket(cmd.to_peer_id) : null;
            if (!target || target.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Peer ${cmd.to_peer_id} não está conectado.`,
              }));
              break;
            }

            // Verifica inventário antes de enviar
            const offerQty = inventory.hasSticker(cmd.offer_sticker_id);
            if (!offerQty || offerQty <= 0) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Sem estoque de ${cmd.offer_sticker_id} para oferecer.`,
              }));
              break;
            }

            const message_id = uuidv4();

            // Formato exato do spec: offer_sticker_id e want_sticker_id
            const offer = {
              type:             'TRADE_OFFER',
              message_id,
              origin_peer_id:   config.self.peer_id,
              sender_peer_id:   config.self.peer_id,
              receiver_peer_id: cmd.to_peer_id,
              offer_sticker_id: (cmd.offer_sticker_id || '').toUpperCase(),
              want_sticker_id:  (cmd.want_sticker_id  || '').toUpperCase(),
            };

            target.send(JSON.stringify(offer));

            // Registra como pendente localmente
            state.pendingTrades.set(message_id, {
              trade_id:  message_id,
              from_peer: config.self.peer_id,
              to_peer:   cmd.to_peer_id,
              offer:     offer.offer_sticker_id,
              want:      offer.want_sticker_id,
              timestamp: Date.now(),
            });

            ws.send(JSON.stringify({
              type:    'UI_INFO',
              message: `TRADE_OFFER enviada para ${cmd.to_peer_id}`,
            }));
            break;
          }

          default:
            ws.send(JSON.stringify({
              type:    'UI_ERROR',
              message: `Comando desconhecido: ${cmd.type}`,
            }));
        }
      });

      ws.on('close', () => {
        state.uiClients.delete(ws);
        console.log('[SERVER] Browser desconectado');
      });

      ws.on('error', (err) => {
        console.error(`[SERVER] Erro no browser client: ${err.message}`);
        state.uiClients.delete(ws);
      });

      return;
    }

    // ── Conexão P2P (outro nó) ────────────────────────────────────────────
    console.log(`[SERVER] Nova conexão P2P de ${remoteIp}`);

    // Registra temporariamente até receber HELLO com sender_peer_id
    const tempKey = remoteIp;
    peers.registerPeer(tempKey, ws, remoteIp, PORT);

    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString('utf-8'));
      } catch (err) {
        console.warn(`[SERVER] JSON inválido de ${remoteIp}: ${err.message}`);
        return;
      }

      // Se o primeiro HELLO chegar, promove chave temporária
      if (message.type === 'HELLO' && message.sender_peer_id) {
        peers.removePeer(tempKey);
        peers.registerPeer(message.sender_peer_id, ws, remoteIp, PORT);
        console.log(`[SERVER] Peer identificado: ${message.sender_peer_id} (${remoteIp})`);
      }

      messageHandler.handle(message, ws, config);
    });

    ws.on('close', () => {
      peers.removePeer(tempKey);
      console.log(`[SERVER] Peer ${remoteIp} desconectado`);
    });

    ws.on('error', (err) => {
      console.error(`[SERVER] Erro com peer ${remoteIp}: ${err.message}`);
      peers.removePeer(tempKey);
    });
  });

  wss.on('error', (err) => {
    console.error(`[SERVER] Erro no servidor WebSocket: ${err.message}`);
  });
}

module.exports = { startServer, broadcastToUI };
