/**
 * server.js
 *
 * Implementa o servidor WebSocket do nó P2P, escutando na porta 8080.
 * Aceita conexões de outros nós (protocolo P2P) e do browser (UI dashboard).
 *
 * Conexões do browser são identificadas pelo header Sec-WebSocket-Protocol: 'ui'
 * ou pelo path /ui — e recebem comandos JSON para buscar figurinhas e propor trocas.
 *
 * Responsabilidades:
 * - Iniciar o WebSocket.Server na porta 8080
 * - Registrar peers ao receber HELLO (via peers.js)
 * - Rotear mensagens recebidas para messageHandler.js
 * - Remover peers ao detectar desconexão
 * - Aceitar conexão do dashboard (browser) e responder a comandos UI
 * - Fazer broadcast de eventos (SEARCH_HIT, TRADE_ACCEPT etc.) para o browser
 *
 * Usado por: index.js
 * Usa: messageHandler.js, peers.js, state.js
 */

const WebSocket = require('ws');
const peers = require('./peers');
const messageHandler = require('./messageHandler');
const state = require('./state');

const PORT = 8080;

// Conjunto de websockets do browser (dashboard) conectados no momento
const uiClients = new Set();

// Envia um objeto JSON para todos os browsers conectados
function broadcastToUI(obj) {
  const payload = JSON.stringify(obj);
  for (const client of uiClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Monta o snapshot completo do estado para o browser
function buildStatusSnapshot() {
  const peerList = peers.getPeerList ? peers.getPeerList() : [];
  return {
    type: 'STATUS',
    self: {
      peer_id:    state.config.peer_id,
      sticker_id: state.config.sticker_id,
      sticker_url: state.config.sticker_url || '',
    },
    inventory:    state.getInventoryList(),
    peers:        peerList,
    tradeHistory: state.tradeHistory || [],
    timestamp:    new Date().toISOString(),
  };
}

// Inicia o servidor WebSocket e configura os handlers de conexão.
function startServer(config) {
  // Salva a config no state para que buildStatusSnapshot() acesse
  state.setConfig({
    peer_id:    config.self.peer_id,
    sticker_id: config.self.sticker_id,
    sticker_url: config.self.sticker_url || `http://localhost:3000/images/${config.self.sticker_id}.png`,
  });

  const wss = new WebSocket.Server({ port: PORT });
  console.log(`[SERVER] Servidor WebSocket ouvindo na porta ${PORT}`);

  wss.on('connection', (ws, req) => {
    const remoteIp = req.socket.remoteAddress;

    // ── Detecta se a conexão vem do browser (dashboard) ──────────────────────
    const isUI =
      (req.headers['sec-websocket-protocol'] || '').includes('ui') ||
      (req.url || '').startsWith('/ui');

    if (isUI) {
      // ── Conexão do Dashboard (browser) ───────────────────────────────────
      console.log(`[SERVER] Browser/Dashboard conectado de ${remoteIp}`);
      uiClients.add(ws);

      // Envia o estado atual imediatamente ao browser ao conectar
      ws.send(JSON.stringify(buildStatusSnapshot()));

      ws.on('message', (data) => {
        let cmd;
        try { cmd = JSON.parse(data.toString('utf-8')); }
        catch { return; }

        switch (cmd.type) {

          // Browser pede snapshot atualizado do estado
          case 'GET_STATUS':
            ws.send(JSON.stringify(buildStatusSnapshot()));
            break;

          // Browser inicia uma busca por figurinha na rede P2P
          case 'UI_SEARCH': {
            const queryId = require('crypto').randomUUID();
            const searchMsg = {
              type:      'SEARCH',
              query_id:  queryId,
              sticker_id: cmd.sticker_id,
              origin_id: state.config.peer_id,
              ttl:       7,
            };

            // Marca como visto para não reprocessar se receber de volta
            state.markQuerySeen(queryId);

            // Verifica o próprio inventário primeiro
            const localQty = state.getQuantity(cmd.sticker_id);
            if (localQty > 0) {
              ws.send(JSON.stringify({
                type:         'SEARCH_HIT',
                query_id:     queryId,
                sticker_id:   cmd.sticker_id,
                responder_id: state.config.peer_id,
                sticker_url:  state.config.sticker_url || `http://localhost:3000/images/${cmd.sticker_id}.png`,
                quantity:     localQty,
                local:        true,
              }));
            } else {
              // Propaga para os vizinhos e aguarda SEARCH_HIT
              peers.broadcast(searchMsg, null);
              state.pendingUISearches.set(queryId, ws);
              ws.send(JSON.stringify({
                type:       'SEARCH_STARTED',
                query_id:   queryId,
                sticker_id: cmd.sticker_id,
              }));
            }
            break;
          }

          // Browser propõe uma troca diretamente para um peer
          case 'UI_TRADE_OFFER': {
            const target = peers.getSocket(cmd.to_peer_id);
            if (!target || target.readyState !== WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type:    'UI_ERROR',
                message: `Peer ${cmd.to_peer_id} não está conectado.`,
              }));
              break;
            }
            const offer = {
              type:             'TRADE_OFFER',
              trade_id:         require('crypto').randomUUID(),
              from_peer_id:     state.config.peer_id,
              to_peer_id:       cmd.to_peer_id,
              offered_sticker:  cmd.offered_sticker,
              wanted_sticker:   cmd.wanted_sticker,
            };
            target.send(JSON.stringify(offer));
            ws.send(JSON.stringify({
              type:    'UI_INFO',
              message: `Proposta enviada para ${cmd.to_peer_id}`,
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
        uiClients.delete(ws);
        console.log('[SERVER] Browser desconectado');
      });

      ws.on('error', (err) => {
        console.error(`[SERVER] Erro no browser client: ${err.message}`);
        uiClients.delete(ws);
      });

      return; // Não cai no handler P2P abaixo
    }

    // ── Conexão P2P (outro nó) ────────────────────────────────────────────────
    console.log(`[SERVER] Nova conexão P2P recebida de ${remoteIp}`);
    let remotePeerId = null;

    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString('utf-8'));
      } catch (err) {
        console.warn(`[SERVER] Mensagem inválida de ${remoteIp}: ${err.message}`);
        return;
      }

      if (message.type === 'HELLO' && !remotePeerId) {
        remotePeerId = message.peer_id;
        peers.registerPeer(remotePeerId, ws, remoteIp, PORT);
        // Atualiza o dashboard com o novo peer
        setTimeout(() => broadcastToUI(buildStatusSnapshot()), 100);
      }

      // Encaminha SEARCH_HIT pendente para o browser que originou a busca
      if (message.type === 'SEARCH_HIT') {
        const uiWs = state.pendingUISearches.get(message.query_id);
        if (uiWs && uiWs.readyState === WebSocket.OPEN) {
          uiWs.send(JSON.stringify(message));
          state.pendingUISearches.delete(message.query_id);
        }
        broadcastToUI(message);
      }

      // Eventos de troca chegam ao browser em tempo real
      if (['TRADE_ACCEPT', 'TRADE_REJECT', 'TRANSFER_CONFIRM'].includes(message.type)) {
        broadcastToUI(message);
        // Após troca concluída, envia snapshot atualizado com novo inventário
        if (message.type === 'TRANSFER_CONFIRM') {
          setTimeout(() => broadcastToUI(buildStatusSnapshot()), 300);
        }
      }

      messageHandler.handle(message, ws, config);
    });

    ws.on('close', () => {
      if (remotePeerId) {
        console.log(`[SERVER] Conexão encerrada com ${remotePeerId}`);
        peers.removePeer(remotePeerId);
        broadcastToUI(buildStatusSnapshot());
      } else {
        console.log(`[SERVER] Conexão encerrada com ${remoteIp} (peer não identificado)`);
      }
    });

    ws.on('error', (err) => {
      console.error(`[SERVER] Erro com ${remotePeerId || remoteIp}: ${err.message}`);
    });
  });

  wss.on('error', (err) => {
    console.error(`[SERVER] Erro fatal no servidor: ${err.message}`);
    process.exit(1);
  });

  return wss;
}

module.exports = { startServer, broadcastToUI, buildStatusSnapshot };
