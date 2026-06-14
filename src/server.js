/**
 * server.js
 *
 * Implementa o servidor WebSocket do nó P2P, escutando na porta 8080.
 * Aceita conexões de outros nós, aguarda a mensagem HELLO para identificar
 * o peer_id do remetente, e roteia todas as mensagens subsequentes para
 * o messageHandler.js.
 *
 * Responsabilidades:
 * - Iniciar o WebSocket.Server na porta 8080
 * - Registrar peers ao receber HELLO (via peers.js)
 * - Rotear mensagens recebidas para messageHandler.js
 * - Remover peers ao detectar desconexão
 * - Logar eventos de conexão e desconexão
 *
 * Usado por: index.js
 * Usa: messageHandler.js, peers.js
 */

const WebSocket = require("ws");
const peers = require("./peers");
const messageHandler = require("./messageHandler");

// Porta padrão definida pelo protocolo do trabalho — não alterar
const PORT = 8080;

// Inicia o servidor WebSocket e configura os handlers de conexão.
// config: objeto com os dados de configuração do próprio nó (peers.json)
// Retorna: instância de WebSocket.Server
function startServer(config) {
  const wss = new WebSocket.Server({ port: PORT });

  console.log(`[SERVER] Servidor WebSocket ouvindo na porta ${PORT}`);

  // Handler disparado para cada nova conexão entrante
  wss.on("connection", (ws, req) => {
    // Extrai o IP da conexão entrante para logging
    const remoteIp = req.socket.remoteAddress;
    console.log(`[SERVER] Nova conexão recebida de ${remoteIp}`);

    // peer_id desta conexão — será preenchido ao receber HELLO
    let remotePeerId = null;

    // Handler de mensagem: processa cada mensagem JSON recebida
    ws.on("message", (data) => {
      let message;

      // Tenta decodificar a mensagem JSON — descarta silenciosamente se inválida
      try {
        message = JSON.parse(data.toString("utf-8"));
      } catch (err) {
        console.warn(`[SERVER] Mensagem inválida recebida de ${remoteIp}: ${err.message}`);
        return;
      }

      // Caso especial: HELLO identifica o peer pela primeira vez nesta conexão
      if (message.type === "HELLO" && !remotePeerId) {
        remotePeerId = message.peer_id;
        // Registra o WebSocket no mapa de peers usando o peer_id declarado
        peers.registerPeer(remotePeerId, ws, remoteIp, PORT);
      }

      // Roteia a mensagem para o handler correto (inclusive HELLO)
      messageHandler.handle(message, ws, config);
    });

    // Handler de encerramento de conexão: remove o peer do mapa
    ws.on("close", () => {
      if (remotePeerId) {
        console.log(`[SERVER] Conexão encerrada com ${remotePeerId}`);
        peers.removePeer(remotePeerId);
      } else {
        console.log(`[SERVER] Conexão encerrada com ${remoteIp} (peer não identificado)`);
      }
    });

    // Handler de erro: loga mas não trava o processo
    ws.on("error", (err) => {
      console.error(
        `[SERVER] Erro na conexão com ${remotePeerId || remoteIp}: ${err.message}`
      );
    });
  });

  // Handler de erro do servidor (porta ocupada, permissão negada etc.)
  wss.on("error", (err) => {
    console.error(`[SERVER] Erro fatal no servidor: ${err.message}`);
    process.exit(1);
  });

  return wss;
}

module.exports = { startServer };
