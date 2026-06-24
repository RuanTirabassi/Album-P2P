/**
 * server.js
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

function broadcastToUI(obj) {
  const payload = JSON.stringify(obj);
  for (const client of state.uiClients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

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

    const isUI =
      (req.headers['sec-websocket-protocol'] || '').includes('ui') ||
      (req.url || '').startsWith('/ui');

    if (isUI) {
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

          case 'UI_SEARCH': {
            const query_id   = uuidv4();
            const message_id = uuidv4();

            const searchMsg = {
              type:             'SEARCH',
              message_id,
              origin_peer_id:   config.self.peer_id,
              origin_peer_ip:   getLocalIp(),
              sender_peer_id:   config.self.peer_id,
              receiver_peer_id: null,
              query_id,
              ttl:              DEFAULT_TTL,
              sticker_id:       (cmd.sticker_id || '').toUpperCase(),
            };

            state.seenQueries.add(query_id);
            state.pendingResults.set(query_id, []);

            const stickerNorm = (cmd.sticker_id || '').replace(/\.png$/i, '').toUpperCase();
            const localQty = inventory.hasSticker(stickerNorm);
            if (localQty > 0) {
              ws.send(JSON.stringify({
                type: 'SEARCH_RESULT',
                hits: [{
                  peer_id:    config.self.peer_id,
                  sticker_id: stickerNorm,
                  local:      true,
                }],
              }));
            }

            peers.broadcast(searchMsg, null);
            state.pendingUISearches.set(query_id, ws);

            ws.send(JSON.stringify({
              type:       'SEARCH_STARTED',
              query_id,
              sticker_id: stickerNorm,
            }));
            break;
          }

          case 'UI_TRADE_OFFER': {
            const target = peers.getSocket ? peers.getSocket(cmd.to_peer_id) : null;
            if (!target || target.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Peer ${cmd.to_peer_id} não está conectado.`,
              }));
              break;
            }

            const offerQty = inventory.hasSticker(cmd.offer_sticker_id);
            if (!offerQty || offerQty <= 0) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Sem estoque de ${cmd.offer_sticker_id} para oferecer.`,
              }));
              break;
            }

            const message_id = uuidv4();
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

          // ── Usuário clicou em ACEITAR no modal ──────────────────────────
          case 'UI_TRADE_ACCEPT': {
            const trade = state.pendingTrades.get(cmd.message_id);
            if (!trade) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: 'Proposta não encontrada (já expirou ou foi processada).',
              }));
              break;
            }

            // Verifica se ainda temos a figurinha a entregar
            const haveIt = inventory.hasSticker(trade.want);
            if (!haveIt || haveIt <= 0) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Sem estoque de ${trade.want} para entregar.`,
              }));
              break;
            }

            // Monta TRADE_ACCEPT no formato do spec
            const accept = {
              type:             'TRADE_ACCEPT',
              message_id:       uuidv4(),
              origin_peer_id:   config.self.peer_id,
              sender_peer_id:   config.self.peer_id,
              receiver_peer_id: trade.from_peer,
              offer_sticker_id: trade.want,   // o que NÓS entregamos
              want_sticker_id:  trade.offer,  // o que NÓS recebemos
            };

            // Envia ao peer que fez a oferta via socket salvo
            const peerSocket = trade.ws || (peers.getSocket ? peers.getSocket(trade.from_peer) : null);
            if (peerSocket && peerSocket.readyState === WebSocket.OPEN) {
              peerSocket.send(JSON.stringify(accept));
            } else {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Peer ${trade.from_peer} desconectou antes de aceitar.`,
              }));
              state.pendingTrades.delete(cmd.message_id);
              break;
            }

            // Atualiza inventário local
            inventory.removeSticker(trade.want,  1);
            inventory.addSticker(trade.offer, 1);
            console.log(`[UI_TRADE_ACCEPT] Inventário: -1 ${trade.want}, +1 ${trade.offer}`);

            // Registra no histórico
            state.tradeHistory.push({
              trade_id:  accept.message_id,
              timestamp: new Date().toISOString(),
              partner:   trade.from_peer,
              gave:      trade.want,
              received:  trade.offer,
            });

            state.pendingTrades.delete(cmd.message_id);

            // Notifica o próprio browser
            ws.send(JSON.stringify({
              type:    'TRADE_ACCEPT',
              message: `Troca aceita com ${trade.from_peer}!`,
            }));
            break;
          }

          // ── Usuário clicou em REJEITAR no modal ─────────────────────────
          case 'UI_TRADE_REJECT': {
            const trade = state.pendingTrades.get(cmd.message_id);
            if (!trade) break;

            const reject = {
              type:             'TRADE_REJECT',
              message_id:       uuidv4(),
              origin_peer_id:   config.self.peer_id,
              sender_peer_id:   config.self.peer_id,
              receiver_peer_id: trade.from_peer,
              offer_sticker_id: trade.offer,
              want_sticker_id:  trade.want,
            };

            const peerSocket = trade.ws || (peers.getSocket ? peers.getSocket(trade.from_peer) : null);
            if (peerSocket && peerSocket.readyState === WebSocket.OPEN) {
              peerSocket.send(JSON.stringify(reject));
            }

            state.pendingTrades.delete(cmd.message_id);
            console.log(`[UI_TRADE_REJECT] Troca com ${trade.from_peer} rejeitada`);

            ws.send(JSON.stringify({
              type:    'TRADE_REJECT',
              message: `Troca com ${trade.from_peer} rejeitada.`,
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

    // ── Conexão P2P (outro nó) ───────────────────────────────────────────
    console.log(`[SERVER] Nova conexão P2P de ${remoteIp}`);

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
