/**
 * handler: hello.js
 *
 * Processa mensagens do tipo HELLO recebidas de vizinhos.
 * O HELLO é enviado imediatamente após uma conexão WebSocket ser estabelecida
 * e serve para identificar o peer_id do remetente.
 *
 * Fluxo:
 * 1. Validar que peer_id, sticker_id e sticker_url estão presentes
 * 2. Registrar o peer_id no mapa de vizinhos via peers.registerPeer()
 * 3. Logar o peer identificado com sucesso
 *
 * Nota: o registro no mapa de peers pode já ter ocorrido em server.js antes
 * de chegar aqui — peers.registerPeer() é idempotente (sobrescreve a entrada).
 *
 * Ref: specs/03-protocolo.md seção HELLO
 */

const peers = require("../peers");

// Processa a mensagem HELLO e registra o peer remetente.
// message: objeto com { type, peer_id, sticker_id, sticker_url }
// ws: instância WebSocket da conexão de onde veio a mensagem
// config: configuração do próprio nó (não usada aqui, mantida por consistência de assinatura)
function handle(message, ws, config) {
  const { peer_id, sticker_id, sticker_url } = message;

  // Valida campos obrigatórios antes de processar
  if (!peer_id || !sticker_id) {
    console.warn("[HELLO] HELLO recebido sem peer_id ou sticker_id — ignorado");
    return;
  }

  // Registra (ou atualiza) o peer no mapa de vizinhos conectados
  peers.registerPeer(peer_id, ws);

  console.log(`[HELLO]  Peer ${peer_id} registrado com sucesso (figurinha: ${sticker_id})`);
}

module.exports = { handle };
