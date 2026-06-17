/**
 * handler: tradeOffer.js
 *
 * Processa mensagens do tipo TRADE_OFFER.
 *
 * Spec do professor:
 * {
 *   "type": "TRADE_OFFER",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-XX",
 *   "sender_peer_id": "ALUNO-XX",
 *   "receiver_peer_id": "ALUNO-YY",
 *   "offer_sticker_id": "FIG-XX",
 *   "want_sticker_id":  "FIG-YY"
 * }
 *
 * Regras do spec:
 * - Só é permitida troca se AMBOS os nós tiverem disponibilidade no inventário.
 * - A decisão (aceitar/rejeitar) cabe ao USUÁRIO — não deve ser automática.
 * - A proposta fica registrada como pendente até o usuário decidir via CLI ou UI.
 */

const inventory = require('../inventory');
const state = require('../state');

function handle(message, ws, config) {
  const { message_id, origin_peer_id, offer_sticker_id, want_sticker_id } = message;

  console.log(`[TRADE_OFFER] ${origin_peer_id} oferece ${offer_sticker_id} e quer ${want_sticker_id}`);

  // Verifica se temos a figurinha que o parceiro quer (pré-requisito do spec)
  const haveWanted = inventory.hasSticker(want_sticker_id);
  if (!haveWanted || haveWanted <= 0) {
    console.log(`[TRADE_OFFER] Não possuímos ${want_sticker_id} — oferta ignorada (inventário insuficiente)`);
    // Não rejeita automaticamente — apenas não registra como pendente
    // O spec diz: "só é permitida troca se ambos tiverem disponibilidade"
    return;
  }

  // Registra como pendente para o usuário decidir (CLI: aceitar / rejeitar)
  state.pendingTrades.set(message_id, {
    trade_id:  message_id,
    from_peer: origin_peer_id,
    to_peer:   config.self.peer_id,
    offer:     offer_sticker_id,
    want:      want_sticker_id,
    timestamp: Date.now(),
    ws,
  });

  console.log(`[TRADE_OFFER] Oferta registrada como PENDENTE (id: ${message_id.substring(0, 8)}...)`);
  console.log(`[TRADE_OFFER] Use "aceitar ${message_id.substring(0, 8)}" ou "rejeitar ${message_id.substring(0, 8)}" para decidir`);

  // Notifica dashboard (UI) se browser conectado
  if (state.uiClients && state.uiClients.size > 0) {
    const notification = JSON.stringify({
      type: 'TRADE_OFFER_RECEIVED',
      message_id,
      from_peer: origin_peer_id,
      offer_sticker_id,
      want_sticker_id,
    });
    for (const uiWs of state.uiClients) {
      if (uiWs.readyState === uiWs.OPEN) uiWs.send(notification);
    }
  }
}

module.exports = { handle };
