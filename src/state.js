/**
 * state.js
 *
 * Armazena o estado global compartilhado entre todos os módulos do nó P2P.
 * Exporta as estruturas de dados centrais usadas pelos handlers, CLI e servidor.
 *
 * IMPORTANTE: config é exposto como wrapper { data } para que setConfig()
 * atualize o mesmo objeto referenciado por todos os módulos que já fizeram
 * require('./state'). Reatribuir a variável local não funciona porque o
 * module.exports já foi entregue por referência no momento do require.
 *
 * Usado por: messageHandler.js, handlers/search.js, handlers/tradeOffer.js,
 *            handlers/tradeAccept.js, handlers/searchHit.js, cli.js, server.js
 */

const inventory = require('./inventory');

// Set de query_ids já vistos — evita reprocessar buscas duplicadas (anti-loop de inundação)
const seenQueries = new Set();

// Map de trade_id → objeto com detalhes da negociação em andamento
// { trade_id, from_peer, to_peer, offer, want, timestamp }
const pendingTrades = new Map();

// Array de objetos representando o histórico de trocas concluídas
// Cada entrada: { trade_id, timestamp, partner, gave, received }
const tradeHistory = [];

// Map de query_id → array de resultados SEARCH_HIT recebidos
// Permite que a CLI exiba os resultados de uma busca em andamento
const pendingResults = new Map();

// Map de query_id → WebSocket do browser aguardando resposta de busca
const pendingUISearches = new Map();

// Configuração do próprio nó.
// Usamos um objeto mutável (em vez de reatribuir a variável) para que todos os
// módulos que já fizeram require('./state') vejam as atualizações feitas por
// setConfig() — já que o export entrega a referência ao objeto, não um snapshot.
const config = { peer_id: '', sticker_id: '', sticker_url: '' };

// Salva a configuração do nó no estado global.
// Copia as propriedades para DENTRO do objeto existente (não reatribui config)
// para que todos os módulos que guardam referência ao objeto vejam as mudanças.
function setConfig(cfg) {
  config.peer_id    = cfg.peer_id    || '';
  config.sticker_id = cfg.sticker_id || '';
  config.sticker_url = cfg.sticker_url || '';
}

// Retorna a lista do inventário no formato esperado pelo dashboard
// [ { sticker_id, quantity }, ... ]
function getInventoryList() {
  return inventory.listInventory();
}

// Retorna a quantidade disponível de uma figurinha específica
function getQuantity(sticker_id) {
  return inventory.hasSticker(sticker_id);
}

// Registra um query_id como já processado (anti-duplicata)
function markQuerySeen(query_id) {
  seenQueries.add(query_id);
}

// Verifica se um query_id já foi processado
function hasSeenQuery(query_id) {
  return seenQueries.has(query_id);
}

module.exports = {
  // Estruturas de dados
  seenQueries,
  pendingTrades,
  tradeHistory,
  pendingResults,
  pendingUISearches,

  // Config do nó (objeto mutável — sempre atualizado por setConfig)
  config,
  setConfig,

  // Helpers de inventário
  getInventoryList,
  getQuantity,

  // Helpers de busca
  markQuerySeen,
  hasSeenQuery,
};
