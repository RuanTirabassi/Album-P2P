/**
 * handler: tradeAccept.js
 *
 * Processa mensagens do tipo TRADE_ACCEPT.
 *
 * Spec do professor:
 * {
 *   "type": "TRADE_ACCEPT",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-YY",
 *   "sender_peer_id": "ALUNO-YY",
 *   "receiver_peer_id": "ALUNO-XX",
 *   "offer_sticker_id": "FIG-XX",  // figurinha que o aceitante entrega
 *   "want_sticker_id":  "FIG-YY"   // figurinha que o aceitante recebe
 * }
 *
 * Fluxo:
 * 1. Verificar disponibilidade no inventário para a figurinha a entregar
 * 2. Atualizar inventário: -1 offer_sticker_id, +1 want_sticker_id
 * 3. Enviar TRANSFER_CONFIRM ao parceiro (com os mesmos campos)
 * 4. Registrar no histórico
 */

const { v4: uuidv4 } = require('uuid');
const inventory = require('../inventory');
const peers = require('../peers');
const state = require('../state');

function handle(message, ws, config) {
  const { message_id, origin_peer_id, offer_sticker_id, want_sticker_id } = message;

  console.log(`[TRADE_ACCEPT] ${origin_peer_id} aceitou: damos ${offer_sticker_id}, recebemos ${want_sticker_id}`);

  // Verifica disponibilidade antes de confirmar
  const haveOffer = inventory.hasSticker(offer_sticker_id);
  if (!haveOffer || haveOffer <= 0) {
    console.warn(`[TRADE_ACCEPT] Sem estoque de ${offer_sticker_id} para entregar — troca cancelada`);
    return;
  }

  // Atualiza inventário: perde o que deu, ganha o que recebeu
  inventory.removeSticker(offer_sticker_id, 1);
  inventory.addSticker(want_sticker_id, 1);
  console.log(`[TRADE_ACCEPT] Inventário: -1 ${offer_sticker_id}, +1 ${want_sticker_id}`);

  // Registra no histórico
  state.tradeHistory.push({
    trade_id:  message_id,
    timestamp: new Date().toISOString(),
    partner:   origin_peer_id,
    gave:      offer_sticker_id,
    received:  want_sticker_id,
  });

  // Envia TRANSFER_CONFIRM ao parceiro com os campos exatos do spec
  const confirm = {
    type:             'TRANSFER_CONFIRM',
    message_id:       uuidv4(),
    origin_peer_id:   config.self.peer_id,
    sender_peer_id:   config.self.peer_id,
    receiver_peer_id: origin_peer_id,
    offer_sticker_id,
    want_sticker_id,
  };

  const sent = peers.sendTo(origin_peer_id, confirm);
  if (!sent) {
    console.warn(`[TRADE_ACCEPT] Sem conexão direta com ${origin_peer_id} para enviar TRANSFER_CONFIRM`);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(confirm));
  }

  // Remove da fila de pendentes
  state.pendingTrades.delete(message_id);
  console.log(`[TRADE_ACCEPT] TRANSFER_CONFIRM enviado para ${origin_peer_id}`);
}

module.exports = { handle };
