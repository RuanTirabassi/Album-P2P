/**
 * handler: hello.js
 *
 * Processa mensagens do tipo HELLO recebidas de vizinhos.
 *
 * Spec do professor:
 * {
 *   "type": "HELLO",
 *   "message_id": "<uuid>",
 *   "sender_peer_id": "ALUNO-XX",
 *   "peers": ["ip1", "ip2"]   // opcional
 * }
 *
 * Comportamento:
 * - Registra o peer no mapa de vizinhos
 * - Responde com HELLO próprio (handshake bidirecional)
 */

const { v4: uuidv4 } = require('uuid');
const peers = require('../peers');

function handle(message, ws, config) {
  const { sender_peer_id } = message;

  console.log(`[HELLO] Recebido de ${sender_peer_id || 'desconhecido'}: ${JSON.stringify(message)}`);

  if (sender_peer_id) {
    peers.registerPeer(sender_peer_id, ws);
    console.log(`[HELLO] Peer ${sender_peer_id} registrado com sucesso`);
  } else {
    console.log(`[HELLO] HELLO sem sender_peer_id — conexão ativa por host:port`);
  }

  // Responde com HELLO próprio (handshake bidirecional — permite que o outro nos identifique)
  const reply = {
    type: 'HELLO',
    message_id: uuidv4(),
    sender_peer_id: config.self.peer_id,
    peers: [],
  };

  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(reply));
    console.log(`[HELLO] Respondido com HELLO para ${sender_peer_id}`);
  }
}

module.exports = { handle };
