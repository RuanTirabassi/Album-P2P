/**
 * handler: searchHit.js
 *
 * Processa mensagens do tipo SEARCH_HIT.
 *
 * Spec do professor:
 * {
 *   "type": "SEARCH_HIT",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-XX",    // nó que possui a figurinha
 *   "sender_peer_id": "ALUNO-XX",
 *   "receiver_peer_id": "ALUNO-YY",  // nó que iniciou a busca
 *   "query_id": "<uuid>",
 *   "sticker_id": "FIG-XX"
 * }
 */

const state = require('../state');

function handle(message, ws, config) {
  const { query_id, origin_peer_id, sticker_id } = message;

  console.log(`[SEARCH_HIT] Figurinha ${sticker_id} encontrada em ${origin_peer_id}`);

  // Acumula resultado no estado para a CLI exibir após timeout
  if (state.pendingResults) {
    if (!state.pendingResults.has(query_id)) {
      state.pendingResults.set(query_id, []);
    }
    state.pendingResults.get(query_id).push({
      peer_id: origin_peer_id,
      sticker_id,
    });
  }

  // Notifica o dashboard (UI) se houver busca pendente
  if (state.pendingUISearches && state.pendingUISearches.has(query_id)) {
    const uiWs = state.pendingUISearches.get(query_id);
    if (uiWs && uiWs.readyState === uiWs.OPEN) {
      uiWs.send(JSON.stringify({
        type: 'SEARCH_RESULT',
        hits: [{ peer_id: origin_peer_id, sticker_id }],
      }));
    }
    // Não deleta: podem chegar múltiplos SEARCH_HIT para a mesma query
  }
}

module.exports = { handle };
