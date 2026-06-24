/**
 * handler: search.js
 *
 * Processa mensagens do tipo SEARCH (busca por inundação).
 *
 * Spec:
 * {
 *   "type": "SEARCH",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-03",
 *   "origin_peer_ip": "10.x.x.x",
 *   "sender_peer_id": "ALUNO-03",
 *   "receiver_peer_id": "ALUNO-01",
 *   "query_id": "<uuid>",
 *   "ttl": 7,
 *   "sticker_id": "FIG-12"
 * }
 */

const { v4: uuidv4 } = require('uuid');
const peers     = require('../peers');
const inventory = require('../inventory');
const state     = require('../state');

function handle(message, ws, config) {
  const { query_id, sender_peer_id, origin_peer_id, sticker_id, ttl } = message;

  console.log(`[SEARCH] Busca por ${sticker_id} | query_id: ${(query_id||'?').substring(0,8)}... | ttl: ${ttl}`);

  // 1. Anti-loop
  if (state.seenQueries.has(query_id)) {
    console.log(`[SEARCH] query_id já visto — descartando`);
    return;
  }
  state.seenQueries.add(query_id);

  // 2. Normaliza sticker_id (aceita FIG-12 ou FIG-12.PNG)
  const stickerNorm = (sticker_id || '').replace(/\.png$/i, '').toUpperCase();
  const qty = inventory.hasSticker(stickerNorm) || inventory.hasSticker(sticker_id);

  if (qty > 0) {
    // 3a. Encontrada → SEARCH_HIT com campos exatos do spec
    console.log(`[SEARCH] ${stickerNorm} encontrada (qty=${qty}) — enviando SEARCH_HIT para ${origin_peer_id}`);

    const hitMessage = {
      type:             'SEARCH_HIT',
      message_id:       uuidv4(),
      origin_peer_id:   config.self.peer_id,
      sender_peer_id:   config.self.peer_id,
      receiver_peer_id: origin_peer_id,
      query_id,
      sticker_id:       stickerNorm,
    };

    const sent = peers.sendTo(origin_peer_id, hitMessage);
    if (!sent) {
      console.warn(`[SEARCH] Sem conexão direta com ${origin_peer_id} — broadcast do SEARCH_HIT`);
      peers.broadcast(hitMessage, sender_peer_id);
    }

    // Notifica UI local (busca disparada pelo próprio dashboard)
    notifyUI(query_id, {
      type:         'SEARCH_HIT',
      query_id,
      sticker_id:   stickerNorm,
      peer_id:      config.self.peer_id,
      responder_id: config.self.peer_id,
      quantity:     qty,
    });
  } else {
    // 3b. Não encontrada → SEARCH_MISS opcional
    console.log(`[SEARCH] ${stickerNorm} não encontrada localmente`);
    const missMessage = {
      type:             'SEARCH_MISS',
      message_id:       uuidv4(),
      origin_peer_id:   config.self.peer_id,
      sender_peer_id:   config.self.peer_id,
      receiver_peer_id: origin_peer_id,
      query_id,
      sticker_id:       stickerNorm,
    };
    peers.sendTo(origin_peer_id, missMessage);
  }

  // 4. Propaga com ttl-1 (independente de encontrar)
  if ((ttl - 1) > 0) {
    const count = propagateSearch(message, sender_peer_id, stickerNorm, config);
    console.log(`[SEARCH] Propagado para ${count} vizinhos com ttl ${ttl - 1}`);
  } else {
    console.log(`[SEARCH] TTL esgotado — não propagando`);
  }
}

function propagateSearch(message, senderPeerId, stickerNorm, config) {
  let count = 0;
  for (const [peerId, peer] of peers.getConnectedPeers()) {
    if (peerId === senderPeerId) continue;
    if (peer.ws.readyState !== peer.ws.OPEN) continue;
    const forwarded = {
      ...message,
      message_id:       uuidv4(),
      ttl:              message.ttl - 1,
      sender_peer_id:   config.self.peer_id,
      receiver_peer_id: peerId,
      sticker_id:       stickerNorm,
    };
    peer.ws.send(JSON.stringify(forwarded));
    count++;
  }
  return count;
}

function notifyUI(query_id, payload) {
  if (!state.pendingUISearches || !state.pendingUISearches.has(query_id)) return;
  const uiWs = state.pendingUISearches.get(query_id);
  if (uiWs && uiWs.readyState === uiWs.OPEN) {
    uiWs.send(JSON.stringify(payload));
  }
}

module.exports = { handle };
