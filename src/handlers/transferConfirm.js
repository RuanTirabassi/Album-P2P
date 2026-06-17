/**
 * handler: transferConfirm.js
 *
 * Processa mensagens do tipo TRANSFER_CONFIRM.
 *
 * Spec do professor:
 * {
 *   "type": "TRANSFER_CONFIRM",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-XX",
 *   "sender_peer_id": "ALUNO-XX",
 *   "receiver_peer_id": "ALUNO-YY",
 *   "offer_sticker_id": "FIG-XX",  // figurinha que o remetente transferiu (nós ganhamos)
 *   "want_sticker_id":  "FIG-YY"   // figurinha que o remetente recebeu (nós perdemos)
 * }
 *
 * Para quem RECEBE o TRANSFER_CONFIRM:
 *   - Perde: want_sticker_id  (foi o que entregamos ao outro)
 *   - Ganha: offer_sticker_id (foi o que recebemos do outro)
 *
 * Impede inventário negativo — só atualiza se houver estoque.
 */

const inventory = require('../inventory');
const state = require('../state');

function handle(message, ws, config) {
  const { message_id, origin_peer_id, offer_sticker_id, want_sticker_id } = message;

  console.log(`[TRANSFER_CONFIRM] De ${origin_peer_id}: entrega ${offer_sticker_id}, recebe ${want_sticker_id}`);

  // Da perspectiva de quem recebe o CONFIRM:
  // O outro entregou offer_sticker_id → nós ganhamos
  // O outro recebeu want_sticker_id   → nós perdemos
  const haveToGive = inventory.hasSticker(want_sticker_id);
  if (!haveToGive || haveToGive <= 0) {
    console.warn(`[TRANSFER_CONFIRM] Sem estoque de ${want_sticker_id} — troca já processada ou inventário insuficiente`);
    return;
  }

  inventory.removeSticker(want_sticker_id, 1);
  inventory.addSticker(offer_sticker_id, 1);
  console.log(`[TRANSFER_CONFIRM] Inventário: -1 ${want_sticker_id}, +1 ${offer_sticker_id}`);

  // Registra no histórico
  state.tradeHistory.push({
    trade_id:  message_id,
    timestamp: new Date().toISOString(),
    partner:   origin_peer_id,
    gave:      want_sticker_id,
    received:  offer_sticker_id,
  });

  // Remove da fila de pendentes
  state.pendingTrades.delete(message_id);

  console.log(`[TRANSFER_CONFIRM] Troca com ${origin_peer_id} concluída e registrada no histórico.`);
}

module.exports = { handle };
