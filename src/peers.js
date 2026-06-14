/**
 * peers.js
 *
 * Gerencia o mapa de vizinhos conectados ao nó P2P.
 * Mantém um registro de todos os peers identificados via HELLO,
 * associando cada peer_id à sua conexão WebSocket ativa.
 *
 * Oferece funções para registrar, remover, buscar e enviar mensagens
 * para vizinhos individualmente ou em broadcast.
 *
 * Usado por: server.js, client.js, handlers/search.js, handlers/tradeOffer.js,
 *            handlers/tradeAccept.js, cli.js
 */

// Map de peer_id → { ws, host, port }
// Representa todos os vizinhos que já enviaram HELLO e estão conectados
const connectedPeers = new Map();

// Registra um peer identificado no mapa de vizinhos conectados.
// peer_id: string no formato ALUNO-YY
// ws: instância WebSocket da conexão ativa
// host: string — endereço IP do peer (pode ser undefined para conexões entrantes)
// port: number — porta do peer (padrão 8080)
function registerPeer(peer_id, ws, host = null, port = 8080) {
  connectedPeers.set(peer_id, { ws, host, port });
  console.log(`[PEERS] Peer ${peer_id} registrado (${host || "conexão entrante"}:${port})`);
}

// Remove um peer do mapa de vizinhos conectados.
// Chamado quando a conexão WebSocket é encerrada.
// peer_id: string no formato ALUNO-YY
function removePeer(peer_id) {
  if (connectedPeers.has(peer_id)) {
    connectedPeers.delete(peer_id);
    console.log(`[PEERS] Peer ${peer_id} removido da lista de conectados`);
  }
}

// Retorna o objeto de conexão { ws, host, port } de um peer específico.
// peer_id: string no formato ALUNO-YY
// Retorna: { ws, host, port } ou undefined se não encontrado
function getPeer(peer_id) {
  return connectedPeers.get(peer_id);
}

// Envia uma mensagem JSON para todos os peers conectados, exceto o peer excluído.
// Usado na propagação de SEARCH para evitar retornar a mensagem ao remetente.
// message: objeto JavaScript (será serializado para JSON)
// excludePeerId: string — peer_id que não deve receber a mensagem (pode ser null)
function broadcast(message, excludePeerId = null) {
  const json = JSON.stringify(message);

  for (const [peerId, peer] of connectedPeers) {
    // Pula o peer excluído (geralmente o remetente da mensagem)
    if (peerId === excludePeerId) continue;

    // Só envia se o WebSocket estiver no estado OPEN
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(json);
    }
  }
}

// Envia uma mensagem JSON para um peer específico.
// peer_id: string no formato ALUNO-YY
// message: objeto JavaScript (será serializado para JSON)
// Retorna: true se enviado com sucesso, false se peer não encontrado ou desconectado
function sendTo(peer_id, message) {
  const peer = connectedPeers.get(peer_id);

  if (!peer) {
    console.warn(`[PEERS] Tentativa de enviar para peer desconhecido: ${peer_id}`);
    return false;
  }

  // Só envia se o WebSocket estiver aberto
  if (peer.ws.readyState !== peer.ws.OPEN) {
    console.warn(`[PEERS] WebSocket de ${peer_id} não está aberto (estado: ${peer.ws.readyState})`);
    return false;
  }

  peer.ws.send(JSON.stringify(message));
  return true;
}

// Retorna a lista de todos os peer_ids atualmente conectados.
// Usado pela CLI para exibir vizinhos ativos.
// Retorna: Array<string>
function listPeers() {
  return Array.from(connectedPeers.keys());
}

// Retorna o mapa completo de peers conectados (para iteração interna).
// Retorna: Map<peer_id, { ws, host, port }>
function getConnectedPeers() {
  return connectedPeers;
}

module.exports = {
  connectedPeers,
  registerPeer,
  removePeer,
  getPeer,
  broadcast,
  sendTo,
  listPeers,
  getConnectedPeers,
};
