/**
 * handler: tradeReject.js
 *
 * Processa mensagens do tipo TRADE_REJECT recebidas de vizinhos.
 * Indica que o peer destino rejeitou a proposta de troca.
 *
 * Fluxo:
 * 1. Logar a rejeição com o motivo fornecido
 * 2. Remover o trade_id da fila de trades pendentes
 *
 * Ref: specs/03-protocolo.md seção TRADE_REJECT
 */

const state = require("../state");

// Processa uma mensagem TRADE_REJECT recebida de um vizinho.
// message: objeto com { type, trade_id, from_peer, to_peer, reason }
// ws: instância WebSocket da conexão (não usada aqui)
// config: configuração do próprio nó (não usada aqui)
function handle(message, ws, config) {
  const { trade_id, from_peer, to_peer, reason } = message;

  // Loga a rejeição com o motivo para informar o usuário
  console.log(
    `[TRADE]  Troca ${trade_id ? trade_id.substring(0, 8) : "?"}... rejeitada por ${from_peer}` +
    (reason ? ` — Motivo: ${reason}` : "")
  );

  // Remove a troca pendente para liberar o trade_id
  if (state.pendingTrades.has(trade_id)) {
    state.pendingTrades.delete(trade_id);
    console.log(`[TRADE]  Troca ${trade_id ? trade_id.substring(0, 8) : "?"}... removida dos pendentes`);
  }
}

module.exports = { handle };
