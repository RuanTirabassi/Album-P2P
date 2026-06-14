/**
 * handler: tradeAccept.js
 *
 * Processa mensagens do tipo TRADE_ACCEPT recebidas de vizinhos.
 * Indica que o peer destino aceitou a proposta de troca enviada anteriormente.
 * Este handler é executado no nó que ORIGINOU a TRADE_OFFER.
 *
 * Fluxo:
 * 1. Verificar que trade_id existe em pendingTrades
 * 2. Reverificar disponibilidade de inventário (qty >= 1 para ambas as figurinhas)
 *    - Se falhar: enviar TRADE_REJECT com reason e abortar
 * 3. Executar a troca na ordem correta:
 *    a. decrementSticker(offer)   — cede a figurinha prometida
 *    b. incrementSticker(want)    — recebe a figurinha acordada
 *    c. saveInventory()           — persiste o novo estado em disco
 * 4. Enviar TRANSFER_CONFIRM ao parceiro
 * 5. Registrar no histórico de trocas
 * 6. Remover da fila de trades pendentes
 *
 * Ref: specs/03-protocolo.md seção TRADE_ACCEPT e TRANSFER_CONFIRM
 * Ref: specs/04-regras-de-negocio.md seção "Processo de execução da troca"
 */

const peers = require("../peers");
const inventory = require("../inventory");
const state = require("../state");

// Processa uma mensagem TRADE_ACCEPT recebida de um vizinho.
// message: objeto com { type, trade_id, from_peer, to_peer }
// ws: instância WebSocket da conexão (não usada diretamente)
// config: configuração do próprio nó (contém peer_id)
function handle(message, ws, config) {
  const { trade_id, from_peer, to_peer } = message;

  console.log(
    `[TRADE]  TRADE_ACCEPT recebido de ${from_peer} para trade ${trade_id ? trade_id.substring(0, 8) : "?"}...`
  );

  // Verifica se esta troca estava pendente (iniciada por este nó)
  if (!state.pendingTrades.has(trade_id)) {
    console.warn(`[TRADE]  trade_id ${trade_id ? trade_id.substring(0, 8) : "?"}... não encontrado em pendingTrades — ignorando TRADE_ACCEPT`);
    return;
  }

  // Recupera os detalhes da troca pendente
  const trade = state.pendingTrades.get(trade_id);

  // Reverifica disponibilidade de inventário antes de executar a troca
  const qtyOffer = inventory.hasSticker(trade.offer);

  if (qtyOffer < 1) {
    // Inventário mudou desde a proposta — rejeitar e abortar
    console.warn(
      `[TRADE]  Inventário insuficiente para concluir troca: ${trade.offer} qty=${qtyOffer}`
    );

    const rejectMessage = {
      type: "TRADE_REJECT",
      trade_id: trade_id,
      from_peer: config.self.peer_id,
      to_peer: from_peer,
      reason: `Figurinha ${trade.offer} não disponível mais (qty=${qtyOffer})`,
    };

    peers.sendTo(from_peer, rejectMessage);
    state.pendingTrades.delete(trade_id);
    return;
  }

  // === EXECUÇÃO DA TROCA ===
  // Ordem importa: decrementar primeiro, incrementar depois, salvar por último.
  // Se qualquer passo falhar, o erro será lançado antes de persistir estado inconsistente.

  try {
    // Passo 1: remove 1 unidade da figurinha que este nó está cedendo
    inventory.decrementSticker(trade.offer);

    // Passo 2: adiciona 1 unidade da figurinha que este nó está recebendo
    inventory.incrementSticker(trade.want);

    // Passo 3: persiste o novo estado em disco (config/inventory.json)
    inventory.saveInventory(inventory.getInventory());

    console.log(`[TRADE]  Troca concluída — dei ${trade.offer}, recebi ${trade.want}`);

    // Exibe o estado atualizado do inventário para as figurinhas envolvidas
    const qtyCedida = inventory.hasSticker(trade.offer);
    const qtyRecebida = inventory.hasSticker(trade.want);
    console.log(`[INVENTÁRIO] ${trade.offer}: ${qtyCedida} | ${trade.want}: ${qtyRecebida}`);

  } catch (err) {
    console.error(`[TRADE]  Erro ao executar troca: ${err.message}`);
    state.pendingTrades.delete(trade_id);
    return;
  }

  // Passo 4: envia TRANSFER_CONFIRM para o parceiro de troca
  const confirmMessage = {
    type: "TRANSFER_CONFIRM",
    trade_id: trade_id,
    from_peer: config.self.peer_id,
    gave: trade.offer,
    received: trade.want,
  };

  peers.sendTo(from_peer, confirmMessage);

  // Passo 5: registra no histórico de trocas em memória
  state.tradeHistory.push({
    trade_id,
    timestamp: new Date().toISOString(),
    partner: from_peer,
    gave: trade.offer,
    received: trade.want,
  });

  // Remove a troca da fila de pendentes — ela foi concluída com sucesso
  state.pendingTrades.delete(trade_id);
}

module.exports = { handle };
