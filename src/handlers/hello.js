/**
 * handler: hello.js
 *
 * Processa mensagens do tipo HELLO recebidas de vizinhos.
 *
 * Formato oficial (spec do professor):
 * {
 *   "type": "HELLO",
 *   "message_id": "<uuid>",
 *   "sender_peer_id": "ALUNO-XX",
 *   "peers": ["ip1", "ip2"]   // opcional
 * }
 */

const peers = require('../peers');

function handle(message, ws, config) {
  const { sender_peer_id, message_id, peers: knownPeers } = message;

  // Loga conteudo completo para debug de interoperabilidade
  console.log(`[HELLO] Conteúdo recebido: ${JSON.stringify(message)}`);

  if (sender_peer_id) {
    // Promove chave temporária host:port para peer_id real
    peers.registerPeer(sender_peer_id, ws);
    console.log(`[HELLO] Peer ${sender_peer_id} registrado com sucesso`);
  } else {
    // Vizinho não enviou sender_peer_id — conexão já ativa via host:port
    console.log(`[HELLO] HELLO sem sender_peer_id — vizinho registrado por host:port, conexão ativa`);
  }
}

module.exports = { handle };
