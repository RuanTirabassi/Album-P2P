/**
 * messageHandler.js
 *
 * Roteador central de mensagens do nó P2P.
 * Recebe todas as mensagens WebSocket (de server.js e client.js),
 * identifica o tipo via campo "type" e despacha para o handler correto.
 *
 * Tipos suportados:
 * - HELLO           → handlers/hello.js
 * - SEARCH          → handlers/search.js
 * - SEARCH_HIT      → handlers/searchHit.js
 * - SEARCH_MISS     → handlers/searchMiss.js
 * - TRADE_OFFER     → handlers/tradeOffer.js
 * - TRADE_ACCEPT    → handlers/tradeAccept.js
 * - TRADE_REJECT    → handlers/tradeReject.js
 * - TRANSFER_CONFIRM → handlers/transferConfirm.js
 *
 * Usado por: server.js, client.js
 * Usa: todos os handlers em src/handlers/
 */

const hello = require("./handlers/hello");
const search = require("./handlers/search");
const searchHit = require("./handlers/searchHit");
const searchMiss = require("./handlers/searchMiss");
const tradeOffer = require("./handlers/tradeOffer");
const tradeAccept = require("./handlers/tradeAccept");
const tradeReject = require("./handlers/tradeReject");
const transferConfirm = require("./handlers/transferConfirm");

// Recebe uma mensagem, identifica o tipo e despacha para o handler correto.
// message: objeto JavaScript já parseado do JSON recebido
// ws: instância WebSocket da conexão que enviou a mensagem
// config: objeto de configuração do próprio nó (contém peer_id, sticker_id, sticker_url)
function handle(message, ws, config) {
  // Valida que o campo "type" está presente — descarta mensagens sem tipo
  if (!message || !message.type) {
    console.warn("[HANDLER] Mensagem recebida sem campo 'type' — descartada");
    return;
  }

  // Loga o tipo de mensagem recebida para rastreabilidade
  console.log(`[HANDLER] Mensagem recebida: ${message.type}`);

  // Roteia para o handler correto baseado no tipo da mensagem
  switch (message.type) {
    case "HELLO":
      hello.handle(message, ws, config);
      break;

    case "SEARCH":
      search.handle(message, ws, config);
      break;

    case "SEARCH_HIT":
      searchHit.handle(message, ws, config);
      break;

    case "SEARCH_MISS":
      searchMiss.handle(message, ws, config);
      break;

    case "TRADE_OFFER":
      tradeOffer.handle(message, ws, config);
      break;

    case "TRADE_ACCEPT":
      tradeAccept.handle(message, ws, config);
      break;

    case "TRADE_REJECT":
      tradeReject.handle(message, ws, config);
      break;

    case "TRANSFER_CONFIRM":
      transferConfirm.handle(message, ws, config);
      break;

    default:
      // Tipo desconhecido — loga aviso mas não interrompe o processo
      console.warn(`[HANDLER] Tipo de mensagem desconhecido: "${message.type}" — ignorado`);
  }
}

module.exports = { handle };
