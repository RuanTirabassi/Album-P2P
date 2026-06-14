/**
 * client.js
 *
 * Gerencia as conexões de saída (outbound) do nó P2P para seus vizinhos configurados.
 * Ao iniciar, conecta-se a todos os vizinhos listados em config/peers.json,
 * envia HELLO imediatamente após conexão, e implementa reconexão automática.
 *
 * Responsabilidades:
 * - Abrir conexão WebSocket para cada vizinho em neighborsList
 * - Enviar HELLO logo após a conexão ser estabelecida
 * - Rotear mensagens recebidas para messageHandler.js
 * - Reconectar automaticamente após 5 segundos se a conexão cair
 * - Logar sucesso, falha e reconexões
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
    // Inicia uma conexão de saída para cada vizinho configurado
    connectToNeighbor(neighbor.host, neighbor.port, config);
  }
}

// Abre uma conexão WebSocket de saída para um vizinho específico.
// Configura os handlers de conexão, mensagem, erro e fechamento.
// host: string — endereço IP do vizinho
// port: number — porta do vizinho (sempre 8080 conforme protocolo)
// config: objeto de configuração do próprio nó (contém peer_id, sticker_id, sticker_url)
function connectToNeighbor(host, port, config) {
  const url = `ws://${host}:${port}`;
  console.log(`[CLIENT] Tentando conectar a ${url}...`);

  const ws = new WebSocket(url);

  // Ao estabelecer conexão com sucesso: enviar HELLO imediatamente
  ws.on("open", () => {
    console.log(`[CLIENT] Conectado a ${host}:${port}`);

    // Monta e envia a mensagem HELLO conforme o protocolo
    const helloMessage = {
      type: "HELLO",
      peer_id: config.self.peer_id,
      sticker_id: config.self.sticker_id,
      sticker_url: config.self.sticker_url,
    };

    ws.send(JSON.stringify(helloMessage));
    console.log(`[CLIENT] HELLO enviado para ${host}:${port}`);
  });

  // Ao receber mensagem do vizinho: rotear para o messageHandler
  ws.on("message", (data) => {
    let message;

    // Tenta decodificar a mensagem JSON — descarta silenciosamente se inválida
    try {
      message = JSON.parse(data.toString("utf-8"));
    } catch (err) {
      console.warn(`[CLIENT] Mensagem inválida recebida de ${host}: ${err.message}`);
      return;
    }

    // Caso o vizinho responda com HELLO (handshake bidirecional), registrar o peer
    if (message.type === "HELLO") {
      peers.registerPeer(message.peer_id, ws, host, port);
    }

    // Roteia a mensagem para o handler correspondente
    messageHandler.handle(message, ws, config);
  });

  // Se a conexão falhar, loga o erro mas não trava o processo
  // O sistema tentará reconectar automaticamente após RECONNECT_INTERVAL ms
  ws.on("error", (err) => {
    console.error(
      `[CLIENT] Erro ao conectar com ${host}:${port} — ${err.message}`
    );
  });

  // Ao detectar fechamento da conexão: agenda reconexão automática
  ws.on("close", () => {
    console.warn(
      `[CLIENT] Conexão com ${host}:${port} encerrada. Reconectando em ${RECONNECT_INTERVAL / 1000}s...`
    );

    // Aguarda RECONNECT_INTERVAL ms e tenta reconectar ao mesmo vizinho
    setTimeout(() => {
      connectToNeighbor(host, port, config);
    }, RECONNECT_INTERVAL);
  });
}

module.exports = { connectToNeighbors };
