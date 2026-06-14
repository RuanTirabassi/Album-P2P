/**
 * handler: searchHit.js
 *
 * Processa mensagens do tipo SEARCH_HIT recebidas de vizinhos.
 * Indica que um peer encontrou a figurinha buscada e está disponível para troca.
 *
 * Fluxo:
 * 1. Exibir resultado no console para o usuário
 * 2. Armazenar o resultado em pendingResults (Map de query_id → resultados)
 *    para que a CLI possa exibir ao usuário e permitir enviar TRADE_OFFER
 *
 * Ref: specs/03-protocolo.md seção SEARCH_HIT
 */

const state = require("../state");

// Processa uma mensagem SEARCH_HIT recebida de um vizinho.
// message: objeto com { type, query_id, responder_id, sticker_id, sticker_url, quantity }
// ws: instância WebSocket da conexão (não usada aqui)
// config: configuração do próprio nó (não usada aqui)
function handle(message, ws, config) {
  const { query_id, responder_id, sticker_id, sticker_url, quantity } = message;

  console.log(
    `[SEARCH] SEARCH_HIT: ${sticker_id} encontrada em ${responder_id} ` +
    `(qty: ${quantity}) — query ${query_id ? query_id.substring(0, 8) : "?"}...`
  );
  console.log(`[SEARCH] URL da figurinha: ${sticker_url}`);

  // Inicializa o array de resultados para este query_id se ainda não existir
  if (!state.pendingResults.has(query_id)) {
    state.pendingResults.set(query_id, []);
  }

  // Adiciona o resultado ao array de resultados pendentes desta busca
  state.pendingResults.get(query_id).push({
    responder_id,
    sticker_id,
    sticker_url,
    quantity,
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[SEARCH] Resultado armazenado. Use "trocar ${sticker_id} com ${responder_id}" para iniciar uma troca.`
  );
}

module.exports = { handle };
