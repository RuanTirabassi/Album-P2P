/**
 * handler: hello.js
 *
 * Processa mensagens do tipo HELLO recebidas de vizinhos.
 * O HELLO é enviado imediatamente após uma conexão WebSocket ser estabelecida
 * e serve para identificar o peer_id do remetente.
 *
 * Fluxo:
 * 1. Validar que peer_id está presente (campo mínimo obrigatório)
 * 2. Remover eventual chave temporária "host:port" criada pelo client.js
 * 3. Registrar o peer_id no mapa de vizinhos via peers.registerPeer()
 * 4. Logar o peer identificado com sucesso
 *
 * Nota: sticker_id e sticker_url são opcionais — não são necessários para
 * rotear mensagens. Grupos que não os enviam devem ser aceitos normalmente.
 *
 * Ref: specs/03-protocolo.md seção HELLO
 */

const peers = require("../peers");

// Processa a mensagem HELLO e registra o peer remetente.
// message: objeto com { type, peer_id, sticker_id?, sticker_url? }
// ws: instância WebSocket da conexão de onde veio a mensagem
// config: configuração do próprio nó (não usada aqui, mantida por consistência de assinatura)
function handle(message, ws, config) {
  const { peer_id, sticker_id, sticker_url } = message;

  // Apenas peer_id é obrigatório para identificar o remetente
  if (!peer_id) {
    console.warn("[HELLO] HELLO recebido sem peer_id — ignorado");
    return;
  }

  // Registra (ou atualiza) o peer no mapa de vizinhos conectados
  // peers.registerPeer é idempotente: sobrescreve entrada temporária host:port se existir
  peers.registerPeer(peer_id, ws);

  const info = sticker_id ? `figurinha: ${sticker_id}` : `sticker_id não informado`;
  console.log(`[HELLO]  Peer ${peer_id} registrado com sucesso (${info})`);
}

module.exports = { handle };
