/**
 * handler: hello.js
 *
 * Processa mensagens do tipo HELLO recebidas de vizinhos.
 * O HELLO é enviado imediatamente após uma conexão WebSocket ser estabelecida
 * e serve para identificar o peer_id do remetente.
 *
 * Fluxo:
 * 1. Se vier peer_id: promove a chave temporária host:port para peer_id real
 * 2. Se não vier peer_id: aceita mesmo assim (vizinho já está registrado por host:port)
 * 3. Loga o conteúdo recebido para facilitar debug de interoperabilidade
 *
 * Nota: sticker_id e sticker_url são sempre opcionais.
 * Grupos com implementações diferentes devem ser aceitos normalmente.
 *
 * Ref: specs/03-protocolo.md seção HELLO
 */

const peers = require("../peers");

// Processa a mensagem HELLO e registra o peer remetente.
// message: objeto com { type, peer_id?, sticker_id?, sticker_url?, ...outros }
// ws: instância WebSocket da conexão de onde veio a mensagem
// config: configuração do próprio nó
function handle(message, ws, config) {
  const { peer_id, sticker_id } = message;

  // Loga o conteúdo completo recebido para facilitar debug de interoperabilidade
  console.log(`[HELLO] Conteúdo recebido: ${JSON.stringify(message)}`);

  if (peer_id) {
    // Vizinho se identificou: registra com peer_id real
    peers.registerPeer(peer_id, ws);
    const info = sticker_id ? `figurinha: ${sticker_id}` : `sticker_id não informado`;
    console.log(`[HELLO] Peer ${peer_id} registrado com sucesso (${info})`);
  } else {
    // Vizinho não enviou peer_id — conexão já está ativa via chave host:port
    // Apenas loga sem descartar — mensagens futuras (SEARCH, TRADE) chegam normalmente
    console.log(`[HELLO] HELLO sem peer_id recebido — vizinho já registrado por host:port, conexão ativa`);
  }
}

module.exports = { handle };
