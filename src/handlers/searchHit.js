/**
 * handler: searchHit.js
 *
 * Processa mensagens do tipo SEARCH_HIT.
 *
 * Spec do professor:
 * {
 *   "type": "SEARCH_HIT",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-XX",
 *   "sender_peer_id": "ALUNO-XX",
 *   "receiver_peer_id": "ALUNO-YY",
 *   "query_id": "<uuid>",
 *   "sticker_id": "FIG-XX"
 * }
 */

const inventory = require('../inventory');
const state = require('../state');

function handle(message, ws, config) {
  const { query_id, origin_peer_id, sticker_id } = message;

  console.log(`[SEARCH_HIT] Figurinha ${sticker_id} encontrada em ${origin_peer_id}`);

  // Acumula resultado para a CLI
  if (state.pendingResults) {
    if (!state.pendingResults.has(query_id)) {
      state.pendingResults.set(query_id, []);
    }
    state.pendingResults.get(query_id).push({ peer_id: origin_peer_id, sticker_id });
  }

  // Monta payload para o dashboard com os campos que o frontend espera
  const hitPayload = {
    type:         'SEARCH_HIT',
    query_id,
    sticker_id,
    peer_id:      origin_peer_id,   // campo usado no renderSearchHit do frontend
    responder_id: origin_peer_id,   // alias compatível com versões anteriores do frontend
    quantity:     inventory.hasSticker(sticker_id), // quantidade local (0 se não for autoral)
  };

  // Notifica dashboard se houver busca pendente
  if (state.pendingUISearches && state.pendingUISearches.has(query_id)) {
    const uiWs = state.pendingUISearches.get(query_id);
    if (uiWs && uiWs.readyState === uiWs.OPEN) {
      uiWs.send(JSON.stringify(hitPayload));
    }
    // Não deleta: podem chegar múltiplos SEARCH_HIT para a mesma query
  }
}

module.exports = { handle };
