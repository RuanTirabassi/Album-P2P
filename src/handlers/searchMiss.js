/**
 * handler: searchMiss.js
 *
 * Processa mensagens do tipo SEARCH_MISS (opcional).
 *
 * Formato oficial (spec do professor):
 * {
 *   "type": "SEARCH_MISS",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-XX",
 *   "sender_peer_id": "ALUNO-XX",
 *   "receiver_peer_id": "ALUNO-YY",
 *   "query_id": "<uuid>",
 *   "sticker_id": "FIG-XX"
 * }
 */

function handle(message, ws, config) {
  const { origin_peer_id, sticker_id, query_id } = message;
  console.log(`[SEARCH_MISS] ${origin_peer_id} não possui ${sticker_id} (query: ${(query_id||'?').substring(0,8)}...)`);
}

module.exports = { handle };
