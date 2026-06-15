/**
 * client.js
 *
 * Gerencia as conexões de saída (outbound) para vizinhos configurados.
 * Envia HELLO no formato oficial do spec ao conectar.
 * Registra vizinho por host:port imediatamente — não depende do HELLO de resposta.
 * Se o vizinho responder com HELLO (sender_peer_id), promove para peer_id real.
 */

const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const peers = require('./peers');
const messageHandler = require('./messageHandler');

const RECONNECT_INTERVAL = 5000;

function connectToNeighbors(neighborsList, config) {
  for (const neighbor of neighborsList) {
    connectToNeighbor(neighbor.host, neighbor.port, config);
  }
}

function connectToNeighbor(host, port, config) {
  const url = `ws://${host}:${port}`;
  const tempKey = `${host}:${port}`;

  console.log(`[CLIENT] Tentando conectar a ${url}...`);

  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`[CLIENT] Conectado a ${host}:${port}`);

    // Registra imediatamente com chave temporária para broadcast funcionar
    peers.registerPeer(tempKey, ws, host, port);

    // Envia HELLO no formato oficial do spec
    const helloMessage = {
      type: 'HELLO',
      message_id: uuidv4(),
      sender_peer_id: config.self.peer_id,
      peers: [],
    };

    ws.send(JSON.stringify(helloMessage));
    console.log(`[CLIENT] HELLO enviado para ${host}:${port}`);
  });

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString('utf-8'));
    } catch (err) {
      console.warn(`[CLIENT] Mensagem inválida de ${host}: ${err.message}`);
      return;
    }

    // Se o vizinho respondeu com HELLO, promove chave temporária para peer_id real
    if (message.type === 'HELLO' && message.sender_peer_id) {
      peers.removePeer(tempKey);
      peers.registerPeer(message.sender_peer_id, ws, host, port);
      console.log(`[CLIENT] Vizinho identificado: ${message.sender_peer_id} (${host}:${port})`);
    }

    messageHandler.handle(message, ws, config);
  });

  ws.on('error', (err) => {
    console.error(`[CLIENT] Erro ao conectar com ${host}:${port} — ${err.message}`);
  });

  ws.on('close', () => {
    peers.removePeer(tempKey);
    console.warn(`[CLIENT] Conexão com ${host}:${port} encerrada. Reconectando em ${RECONNECT_INTERVAL / 1000}s...`);
    setTimeout(() => connectToNeighbor(host, port, config), RECONNECT_INTERVAL);
  });
}

module.exports = { connectToNeighbors };
