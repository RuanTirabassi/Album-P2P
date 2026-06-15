/**
 * handler: tradeReject.js
 *
 * Processa mensagens do tipo TRADE_REJECT.
 *
 * Formato oficial (spec do professor):
 * {
 *   "type": "TRADE_REJECT",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-YY",
 *   "sender_peer_id": "ALUNO-YY",
 *   "receiver_peer_id": "ALUNO-XX",
 *   "offer_sticker_id": "FIG-XX",
 *   "want_sticker_id": "FIG-YY"
 * }
 */

const state = require('../state');

function handle(message, ws, config) {
  const { message_id, origin_peer_id, offer_sticker_id, want_sticker_id } = message;

  console.log(`[TRADE_REJECT] ${origin_peer_id} rejeitou a troca de ${offer_sticker_id} por ${want_sticker_id}`);

  // Remove da fila de pendentes se existir
  if (state.pendingTrades.has(message_id)) {
    state.pendingTrades.delete(message_id);
  }
}

module.exports = { handle };
