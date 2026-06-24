/**
 * peers.js
 *
 * Gerencia o mapa de vizinhos conectados ao nó P2P.
 * Também persiste IPs conhecidos (diretos e de 2º grau via HELLO) em peers.json.
 */

const fs   = require('fs');
const path = require('path');

const PEERS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'peers.json');

// Map de peer_id → { ws, host, port }
const connectedPeers = new Map();

// Registra um peer no mapa
function registerPeer(peer_id, ws, host = null, port = 8080) {
  connectedPeers.set(peer_id, { ws, host, port });
  console.log(`[PEERS] Peer ${peer_id} registrado (${host || 'conexão entrante'}:${port})`);
}

// Remove um peer do mapa
function removePeer(peer_id) {
  if (connectedPeers.has(peer_id)) {
    connectedPeers.delete(peer_id);
    console.log(`[PEERS] Peer ${peer_id} removido`);
  }
}

function getPeer(peer_id)        { return connectedPeers.get(peer_id); }
function listPeers()             { return Array.from(connectedPeers.keys()); }
function getConnectedPeers()     { return connectedPeers; }

// Retorna o WebSocket de um peer (alias para uso no server.js)
function getSocket(peer_id) {
  const p = connectedPeers.get(peer_id);
  return p ? p.ws : null;
}

// Retorna lista de { peer_id, host, port } para o dashboard
function getPeerList() {
  return Array.from(connectedPeers.entries()).map(([peer_id, { host, port }]) => ({ peer_id, host, port }));
}

// Broadcast para todos exceto excludePeerId
function broadcast(message, excludePeerId = null) {
  const json = JSON.stringify(message);
  for (const [peerId, peer] of connectedPeers) {
    if (peerId === excludePeerId) continue;
    if (peer.ws.readyState === peer.ws.OPEN) peer.ws.send(json);
  }
}

// Envia para um peer específico. Retorna true se enviado.
function sendTo(peer_id, message) {
  const peer = connectedPeers.get(peer_id);
  if (!peer) {
    console.warn(`[PEERS] Peer desconhecido: ${peer_id}`);
    return false;
  }
  if (peer.ws.readyState !== peer.ws.OPEN) {
    console.warn(`[PEERS] WebSocket de ${peer_id} não está aberto`);
    return false;
  }
  peer.ws.send(JSON.stringify(message));
  return true;
}

/**
 * Persiste IPs de vizinhos no peers.json.
 * Recebe um array de strings de IP (ex: ["10.1.2.3", "10.1.2.4"]).
 * Não duplica entradas já existentes com o mesmo host.
 * Só salva IPs que parecem válidos (não salva localhost ou IPs internos inválidos).
 */
function saveKnownPeers(ipList) {
  if (!ipList || ipList.length === 0) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(PEERS_CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error('[PEERS] Erro ao ler peers.json para persistir vizinhos:', e.message);
    return;
  }

  const neighbors = config.neighbors || [];
  const existingHosts = new Set(neighbors.map(n => n.host));

  let changed = false;
  for (const ip of ipList) {
    const trimmed = (ip || '').trim();
    // Ignora entradas vazias, localhost e IPs malformados
    if (!trimmed || trimmed === 'localhost' || trimmed === '127.0.0.1') continue;
    // Validação básica de IPv4
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) continue;
    if (existingHosts.has(trimmed)) continue;

    neighbors.push({ host: trimmed, port: 8080 });
    existingHosts.add(trimmed);
    changed = true;
    console.log(`[PEERS] Novo vizinho descoberto via HELLO: ${trimmed}`);
  }

  if (changed) {
    config.neighbors = neighbors;
    fs.writeFileSync(PEERS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`[PEERS] peers.json atualizado com ${neighbors.length} vizinho(s).`);
  }
}

module.exports = {
  connectedPeers,
  registerPeer,
  removePeer,
  getPeer,
  getSocket,
  getPeerList,
  broadcast,
  sendTo,
  listPeers,
  getConnectedPeers,
  saveKnownPeers,
};
