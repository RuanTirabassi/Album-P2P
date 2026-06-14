/**
 * handler: transferConfirm.js
 *
 * Processa mensagens do tipo TRANSFER_CONFIRM recebidas de vizinhos.
 * Indica que o peer parceiro concluiu a troca de inventário da parte dele.
 *
 * Este handler é executado no nó que ACEITOU a troca (TRADE_ACCEPT).
 * Neste ponto, o nó que aceitou também precisa executar sua própria
 * atualização de inventário e registrar no histórico.
 *
 * Fluxo:
 * 1. Registrar a confirmação no histórico de trocas
 * 2. Verificar se este nó ainda não executou a sua troca (evitar duplicata)
 * 3. Executar a troca (decrementar o cedido, incrementar o recebido)
 * 4. Salvar inventário em disco
 * 5. Enviar TRANSFER_CONFIRM de volta ao parceiro (handshake bidirecional)
 * 6. Logar confirmação no console
 *
 * Ref: specs/03-protocolo.md seção TRANSFER_CONFIRM
 */

const peers = require("../peers");
const inventory = require("../inventory");
const state = require("../state");

// Rastreia trade_ids já confirmados para evitar execução duplicada
const confirmedTrades = new Set();

// Processa uma mensagem TRANSFER_CONFIRM recebida de um vizinho.
// message: objeto com { type, trade_id, from_peer, gave, received }
// ws: instância WebSocket da conexão (não usada diretamente)
// config: configuração do próprio nó (contém peer_id)
function handle(message, ws, config) {
  const { trade_id, from_peer, gave, received } = message;

  console.log(
    `[TRADE]  TRANSFER_CONFIRM de ${from_peer}: ele cedeu ${gave}, ele recebeu ${received}`
  );

  // Verifica se este nó já processou o TRANSFER_CONFIRM (evita duplicatas)
  if (confirmedTrades.has(trade_id)) {
    console.log(`[TRADE]  trade_id ${trade_id ? trade_id.substring(0, 8) : "?"}... já confirmado — ignorando`);
    return;
  }

  // Marca como confirmado imediatamente para garantir idempotência
  confirmedTrades.add(trade_id);

  // Verifica se esta troca ainda está pendente neste nó (ele aceitou mas ainda não executou)
  const trade = state.pendingTrades.get(trade_id);

  if (trade) {
    // Este nó é o que ACEITOU a troca — precisa executar a sua parte agora
    // O que o outro nó "gave" (cedeu) é o que este nó recebe: trade.offer
    // O que o outro nó "received" é o que este nó cedeu: trade.want

    try {
      // === EXECUÇÃO DA TROCA (lado do aceitador) ===
      // Passo 1: remove 1 unidade da figurinha que este nó está cedendo (want do outro)
      inventory.decrementSticker(trade.want);

      // Passo 2: adiciona 1 unidade da figurinha que este nó está recebendo (offer do outro)
      inventory.incrementSticker(trade.offer);

      // Passo 3: persiste o novo estado em disco (config/inventory.json)
      inventory.saveInventory(inventory.getInventory());

      console.log(`[TRADE]  Troca concluída — dei ${trade.want}, recebi ${trade.offer}`);

      // Exibe o estado atualizado do inventário para as figurinhas envolvidas
      const qtyCedida = inventory.hasSticker(trade.want);
      const qtyRecebida = inventory.hasSticker(trade.offer);
      console.log(`[INVENTÁRIO] ${trade.want}: ${qtyCedida} | ${trade.offer}: ${qtyRecebida}`);

    } catch (err) {
      console.error(`[TRADE]  Erro ao executar troca no aceitador: ${err.message}`);
      state.pendingTrades.delete(trade_id);
      return;
    }

    // Registra no histórico de trocas deste nó
    state.tradeHistory.push({
      trade_id,
      timestamp: new Date().toISOString(),
      partner: from_peer,
      gave: trade.want,
      received: trade.offer,
    });

    // Envia TRANSFER_CONFIRM de volta ao proponente (handshake bidirecional)
    const confirmMessage = {
      type: "TRANSFER_CONFIRM",
      trade_id: trade_id,
      from_peer: config.self.peer_id,
      gave: trade.want,
      received: trade.offer,
    };

    peers.sendTo(from_peer, confirmMessage);

    // Remove da fila de pendentes — troca concluída
    state.pendingTrades.delete(trade_id);

  } else {
    // Este nó já executou a troca (era o proponente) — apenas registra a confirmação
    console.log(`[TRADE]  Confirmação de troca registrada (trade: ${trade_id ? trade_id.substring(0, 8) : "?"}...)`);
  }
}

module.exports = { handle };
