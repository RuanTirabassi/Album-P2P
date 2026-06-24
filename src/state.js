/**
 * state.js
 *
 * Estado global compartilhado entre todos os módulos do nó P2P.
 */

const inventory = require('./inventory');

// Anti-loop: query_ids já vistos
const seenQueries = new Set();

// Trocas pendentes aguardando decisão do usuário
// trade_id → { trade_id, from_peer, to_peer, offer, want, timestamp, ws }
const pendingTrades = new Map();

// Histórico de trocas concluídas
// [ { trade_id, timestamp, partner, gave, received }, ... ]
const tradeHistory = [];

// Resultados de buscas em andamento (para a CLI)
// query_id → [ { peer_id, sticker_id }, ... ]
const pendingResults = new Map();

// Buscas iniciadas pela UI aguardando SEARCH_HIT
// query_id → WebSocket do browser
const pendingUISearches = new Map();

// Set de WebSockets do browser (dashboard) conectados
const uiClients = new Set();

// Configuração do próprio nó (objeto mutável)
const config = { peer_id: '', sticker_id: '' };

function setConfig(cfg) {
  config.peer_id    = cfg.peer_id    || '';
  config.sticker_id = cfg.sticker_id || '';
}

function getInventoryList() {
  return inventory.listInventory();
}

function getQuantity(sticker_id) {
  return inventory.hasSticker(sticker_id);
}

function markQuerySeen(query_id) {
  seenQueries.add(query_id);
}

function hasSeenQuery(query_id) {
  return seenQueries.has(query_id);
}

module.exports = {
  seenQueries,
  pendingTrades,
  tradeHistory,
  pendingResults,
  pendingUISearches,
  uiClients,
  config,
  setConfig,
  getInventoryList,
  getQuantity,
  markQuerySeen,
  hasSeenQuery,
};
