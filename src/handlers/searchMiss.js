/**
 * handler: searchMiss.js
 *
 * Processa mensagens do tipo SEARCH_MISS recebidas de vizinhos.
 * Indica que um peer não possui a figurinha buscada.
 *
 * O SEARCH_MISS é opcional pelo protocolo — apenas registra o evento
 * no log para rastreabilidade, sem alterar estado do sistema.
 *
 * Ref: specs/03-protocolo.md seção SEARCH_MISS
 */

// Processa uma mensagem SEARCH_MISS recebida de um vizinho.
// message: objeto com { type, query_id, responder_id, sticker_id }
// ws: instância WebSocket da conexão (não usada aqui)
// config: configuração do próprio nó (não usada aqui)
function handle(message, ws, config) {
  const { query_id, responder_id, sticker_id } = message;

  // Loga opcionalmente que o peer não possui a figurinha
  console.log(
    `[SEARCH] SEARCH_MISS: ${responder_id} não possui ${sticker_id} ` +
    `(query: ${query_id ? query_id.substring(0, 8) : "?"}...)`
  );
}

module.exports = { handle };
