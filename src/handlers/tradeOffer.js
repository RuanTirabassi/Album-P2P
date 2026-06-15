/**
 * handler: tradeOffer.js
 *
 * Processa mensagens do tipo TRADE_OFFER.
 *
 * Formato oficial (spec do professor):
 * {
 *   "type": "TRADE_OFFER",
 *   "message_id": "<uuid>",
 *   "origin_peer_id": "ALUNO-XX",
 *   "sender_peer_id": "ALUNO-XX",
 *   "receiver_peer_id": "ALUNO-YY",
 *   "offer_sticker_id": "FIG-XX",
 *   "want_sticker_id": "FIG-YY"
 * }
 */

const { v4: uuidv4 } = require('uuid');
const inventory = require('../inventory');
const peers = require('../peers');
const state = require('../state');

function handle(message, ws, config) {
  const { message_id, origin_peer_id, sender_peer_id, offer_sticker_id, want_sticker_id } = message;

  console.log(`[TRADE_OFFER] ${origin_peer_id} oferece ${offer_sticker_id} e quer ${want_sticker_id}`);

  // Verifica se temos a figurinha que o parceiro quer
  const haveWanted = inventory.hasSticker(want_sticker_id);
  if (!haveWanted || haveWanted <= 0) {
    console.log(`[TRADE_OFFER] Não possuímos ${want_sticker_id} — rejeitando`);
    const reject = {
      type: 'TRADE_REJECT',
      message_id: uuidv4(),
      origin_peer_id: config.self.peer_id,
      sender_peer_id: config.self.peer_id,
      receiver_peer_id: origin_peer_id,
      offer_sticker_id,
      want_sticker_id,
    };
    peers.sendTo(origin_peer_id, reject) || ws.send(JSON.stringify(reject));
    return;
  }

  // Registra oferta pendente usando message_id como chave
  state.pendingTrades.set(message_id, {
    trade_id: message_id,
    from_peer: origin_peer_id,
    to_peer: config.self.peer_id,
    offer: offer_sticker_id,
    want: want_sticker_id,
    timestamp: Date.now(),
    ws,
  });

  console.log(`[TRADE_OFFER] Oferta registrada (id: ${message_id.substring(0,8)}...) — aguardando decisão`);

  // Notifica dashboard se browser conectado
  // (o dashboard pode exibir um botão aceitar/rejeitar)
}

module.exports = { handle };
