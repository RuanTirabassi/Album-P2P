/**
 * client.js
 *
 * Gerencia as conexões de saída (outbound) do nó P2P para seus vizinhos configurados.
 * Ao iniciar, conecta-se a todos os vizinhos listados em config/peers.json,
 * envia HELLO imediatamente após conexão, e implementa reconexão automática.
 *
 * O vizinho é registrado imediatamente com chave temporária "host:port" assim
 * que a conexão abre, garantindo que o broadcast de SEARCH funcione mesmo que
 * o nó remoto não envie HELLO de volta. Se o HELLO chegar, a chave é atualizada
 * para o peer_id real.
 *
 * Usado por: index.js
 * Usa: messageHandler.js, peers.js
 */

const WebSocket = require("ws");
const peers = require("./peers");
const messageHandler = require("./messageHandler");

// Intervalo de tentativa de reconexão com vizinhos (em milissegundos)
const RECONNECT_INTERVAL = 5000;

// Conecta-se a todos os vizinhos configurados e mantém as conexões ativas.
// neighborsList: array de { host, port } — lido de config/peers.json
// config: objeto completo de configuração do próprio nó (para enviar HELLO)
function connectToNeighbors(neighborsList, config) {
  for (const neighbor of neighborsList) {
    connectToNeighbor(neighbor.host, neighbor.port, config);
  }
}

// Abre uma conexão WebSocket de saída para um vizinho específico.
// host: string — endereço IP do vizinho
// port: number — porta do vizinho (sempre 8080 conforme protocolo)
// config: objeto de configuração do próprio nó
function connectToNeighbor(host, port, config) {
  const url = `ws://${host}:${port}`;
  // Chave temporária usada antes de receber o HELLO do vizinho
  const tempKey = `${host}:${port}`;

  console.log(`[CLIENT] Tentando conectar a ${url}...`);

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log(`[CLIENT] Conectado a ${host}:${port}`);

    // Registra imediatamente com chave host:port para que o broadcast
    // funcione mesmo que o vizinho não implemente HELLO de volta.
    peers.registerPeer(tempKey, ws, host, port);

    // Envia HELLO para que o vizinho nos identifique
    const helloMessage = {
      type:        "HELLO",
      peer_id:     config.self.peer_id,
      sticker_id:  config.self.sticker_id,
      sticker_url: config.self.sticker_url || '',
    };
    ws.send(JSON.stringify(helloMessage));
    console.log(`[CLIENT] HELLO enviado para ${host}:${port}`);
  });

  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString("utf-8"));
    } catch (err) {
      console.warn(`[CLIENT] Mensagem inválida de ${host}: ${err.message}`);
      return;
    }

    // Se o vizinho respondeu com HELLO, promove a chave temporária para peer_id real
    if (message.type === "HELLO" && message.peer_id) {
      // Remove a entrada temporária e cria com o peer_id correto
      peers.removePeer(tempKey);
      peers.registerPeer(message.peer_id, ws, host, port);
      console.log(`[CLIENT] Vizinho identificado: ${message.peer_id} (${host}:${port})`);
    }

    messageHandler.handle(message, ws, config);
  });

  ws.on("error", (err) => {
    console.error(`[CLIENT] Erro ao conectar com ${host}:${port} — ${err.message}`);
  });

  ws.on("close", () => {
    // Remove tanto a chave temporária quanto um eventual peer_id já registrado
    peers.removePeer(tempKey);
    console.warn(`[CLIENT] Conexão com ${host}:${port} encerrada. Reconectando em ${RECONNECT_INTERVAL / 1000}s...`);
    setTimeout(() => {
      connectToNeighbor(host, port, config);
    }, RECONNECT_INTERVAL);
  });
}

module.exports = { connectToNeighbors };
