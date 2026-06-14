/**
 * state.js
 *
 * Armazena o estado global compartilhado entre todos os módulos do nó P2P.
 * Exporta as estruturas de dados centrais usadas pelos handlers, CLI e servidor.
 *
 * Usado por: messageHandler.js, handlers/search.js, handlers/tradeOffer.js,
 *            handlers/tradeAccept.js, handlers/searchHit.js, cli.js
 */

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

module.exports = {
  seenQueries,
  pendingTrades,
  tradeHistory,
  pendingResults,
};
