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
 *   "peers": ["ip1", "ip2"]   // opcional — lista de IPs conhecidos pelo remetente
 * }
 *
 * Comportamento:
 * - Registra o peer no mapa de vizinhos com host extraído do WebSocket
 * - Salva o IP direto do remetente em peers.json
 * - Salva IPs recebidos no campo `peers` dentro de config/peers.json
 * - Responde com HELLO próprio (handshake bidirecional)
 */

const { v4: uuidv4 } = require('uuid');
const peers = require('../peers');

function handle(message, ws, config) {
  const { sender_peer_id, peers: knownPeers } = message;

  console.log(`[HELLO] Recebido de ${sender_peer_id || 'desconhecido'}`);

  // Extrai IP do socket do remetente (conexão entrante)
  const remoteIp = ws._socket && ws._socket.remoteAddress
    ? ws._socket.remoteAddress.replace(/^::ffff:/, '') // normaliza IPv4-mapped IPv6
    : null;

  if (sender_peer_id) {
    peers.registerPeer(sender_peer_id, ws, remoteIp, 8080);
    console.log(`[HELLO] Peer ${sender_peer_id} registrado (IP: ${remoteIp || 'desconhecido'})`);

    // Persiste o IP direto do remetente em peers.json
    if (remoteIp) {
      peers.saveKnownPeers([remoteIp]);
    }
  } else {
    console.log(`[HELLO] HELLO sem sender_peer_id — conexão ativa por host:port`);
  }

  // Salva IPs de vizinhos de 2º grau recebidos no campo `peers` do HELLO
  if (Array.isArray(knownPeers) && knownPeers.length > 0) {
    console.log(`[HELLO] ${sender_peer_id} informou ${knownPeers.length} vizinho(s) conhecido(s): ${knownPeers.join(', ')}`);
    peers.saveKnownPeers(knownPeers);
  }

  // Responde com HELLO próprio incluindo lista dos nossos vizinhos conhecidos
  const myNeighborIps = peers.getPeerList()
    .map(p => p.host)
    .filter(h => h && h !== 'null' && h !== 'localhost');

  const reply = {
    type:           'HELLO',
    message_id:     uuidv4(),
    sender_peer_id: config.self.peer_id,
    peers:          myNeighborIps,
  };

  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(reply));
    console.log(`[HELLO] Respondido com HELLO para ${sender_peer_id} (${myNeighborIps.length} vizinho(s) compartilhado(s))`);
  }
}

module.exports = { handle };
