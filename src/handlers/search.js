/**
 * handler: search.js
 *
 * Processa mensagens do tipo SEARCH (busca por inundação).
 *
 * Formato oficial (spec do professor):
 * {
 *   "type": "SEARCH",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-03",
 *   "origin_peer_ip": "10.x.x.x",
 *   "sender_peer_id": "ALUNO-03",
 *   "receiver_peer_id": "ALUNO-01",
 *   "query_id": "<uuid>",
 *   "ttl": 7,
 *   "sticker_id": "FIG-12.PNG"
 * }
 *
 * Fluxo:
 * 1. Verificar se query_id já foi processado (descartar se sim)
 * 2. Registrar query_id
 * 3. Verificar inventário local
 *    - Se encontrada: enviar SEARCH_HIT ao origin_peer_id
 *    - Se não encontrada: enviar SEARCH_MISS (opcional)
 * 4. Se ttl - 1 > 0: reenviar para vizinhos exceto sender_peer_id
 */

const { v4: uuidv4 } = require('uuid');
const peers = require('../peers');
const inventory = require('../inventory');
const state = require('../state');

function handle(message, ws, config) {
  const { query_id, sender_peer_id, origin_peer_id, sticker_id, ttl } = message;

  console.log(`[SEARCH] Busca por ${sticker_id} | query_id: ${(query_id || '?').substring(0, 8)}... | ttl: ${ttl}`);

  // Anti-loop: descarta se já processamos esta query
  if (state.seenQueries.has(query_id)) {
    console.log(`[SEARCH] query_id já visto — descartando`);
    return;
  }
  state.seenQueries.add(query_id);

  // Normaliza sticker_id para comparação (aceita com ou sem .PNG)
  const stickerNorm = (sticker_id || '').replace(/\.png$/i, '').toUpperCase();
  const qty = inventory.hasSticker(stickerNorm) || inventory.hasSticker(sticker_id);

  if (qty > 0) {
    console.log(`[SEARCH] ${sticker_id} encontrada — enviando SEARCH_HIT para ${origin_peer_id}`);

    const hitMessage = {
      type: 'SEARCH_HIT',
      message_id: uuidv4(),
      origin_peer_id: config.self.peer_id,
      sender_peer_id: config.self.peer_id,
      receiver_peer_id: origin_peer_id,
      query_id: query_id,
      sticker_id: sticker_id,
      sticker_url: config.self.sticker_url || `http://${getLocalIp()}:3000/images/${stickerNorm}.png`,
    };

    // Tenta enviar direto ao originador; se não tiver conexão direta, faz broadcast
    const sent = peers.sendTo(origin_peer_id, hitMessage);
    if (!sent) {
      console.warn(`[SEARCH] Sem conexão direta com ${origin_peer_id} — broadcast do SEARCH_HIT`);
      peers.broadcast(hitMessage, sender_peer_id);
    }

    // Notifica browser se houver busca pendente do dashboard
    if (state.pendingUISearches && state.pendingUISearches.has(query_id)) {
      const uiWs = state.pendingUISearches.get(query_id);
      if (uiWs && uiWs.readyState === uiWs.OPEN) {
        uiWs.send(JSON.stringify({ type: 'SEARCH_RESULT', hits: [hitMessage] }));
      }
      state.pendingUISearches.delete(query_id);
    }

    return;
  }

  // Não encontrada: SEARCH_MISS opcional
  const missMessage = {
    type: 'SEARCH_MISS',
    message_id: uuidv4(),
    origin_peer_id: config.self.peer_id,
    sender_peer_id: config.self.peer_id,
    receiver_peer_id: origin_peer_id,
    query_id: query_id,
    sticker_id: sticker_id,
  };
  peers.sendTo(origin_peer_id, missMessage);

  // Propaga com ttl-1 se ainda houver alcance
  if ((ttl - 1) > 0) {
    const count = propagateSearch(message, sender_peer_id, config);
    console.log(`[SEARCH] Propagando para ${count} vizinhos com ttl ${ttl - 1}`);
  } else {
    console.log(`[SEARCH] TTL esgotado — não propagando`);
  }
}

function propagateSearch(message, senderPeerId, config) {
  const propagated = {
    ...message,
    message_id: require('uuid').v4(),
    ttl: message.ttl - 1,
    sender_peer_id: config.self.peer_id,
  };

  const json = JSON.stringify(propagated);
  let count = 0;

  for (const [peerId, peer] of peers.getConnectedPeers()) {
    if (peerId === senderPeerId) continue;
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(json);
      count++;
    }
  }

  return count;
}

function getLocalIp() {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) return alias.address;
      }
    }
  } catch (_) {}
  return 'localhost';
}

module.exports = { handle };
