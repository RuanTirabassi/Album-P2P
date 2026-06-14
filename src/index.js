/**
 * index.js
 *
 * Entry point do nó P2P do sistema de troca de figurinhas.
 * Orquestra a inicialização de todos os módulos na ordem correta:
 *
 * 1. Carrega configuração de config/peers.json (peer_id, sticker_id, vizinhos)
 * 2. Carrega o inventário de config/inventory.json (ou cria o padrão)
 * 3. Inicia o servidor WebSocket na porta 8080
 * 4. Conecta-se aos vizinhos configurados
 * 5. Inicia o dashboard web na porta 3000 (http://localhost:3000)
 * 6. Inicia a interface CLI no terminal
 *
 * Para iniciar o nó: node src/index.js
 *
 * Usado por: package.json (script "start")
 * Usa: server.js, client.js, inventory.js, cli.js, dashboard.js
 */

const fs = require("fs");
const path = require("path");

const { startServer } = require("./server");
const { connectToNeighbors } = require("./client");
const inventory = require("./inventory");
const { startCli } = require("./cli");
const { startDashboard } = require("./dashboard");

// Caminho para o arquivo de configuração de peers
const PEERS_CONFIG_PATH = path.join(__dirname, "..", "config", "peers.json");

// Função principal de inicialização do nó P2P.
// Carrega configurações, inicializa módulos e exibe mensagem de boas-vindas.
function main() {
  // === PASSO 1: Carregar configuração de vizinhos ===
  if (!fs.existsSync(PEERS_CONFIG_PATH)) {
    console.error(
      `[INDEX] Arquivo de configuração não encontrado: ${PEERS_CONFIG_PATH}`
    );
    console.error("[INDEX] Crie o arquivo config/peers.json com seu peer_id e vizinhos.");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(PEERS_CONFIG_PATH, "utf-8"));

  // Valida campos obrigatórios da configuração
  if (!config.self || !config.self.peer_id || !config.self.sticker_id) {
    console.error("[INDEX] config/peers.json inválido: campos self.peer_id e self.sticker_id são obrigatórios");
    process.exit(1);
  }

  // === PASSO 2: Carregar inventário ===
  // Se config/inventory.json não existir, loadInventory() cria com o estado padrão
  inventory.loadInventory();

  // === PASSO 3: Iniciar servidor WebSocket ===
  startServer(config);

  // === PASSO 4: Conectar a vizinhos configurados ===
  const neighbors = config.neighbors || [];

  if (neighbors.length > 0) {
    console.log(`[INDEX] Conectando a ${neighbors.length} vizinho(s) configurado(s)...`);
    // Aguarda 500ms para o servidor estar completamente pronto antes de conectar
    setTimeout(() => {
      connectToNeighbors(neighbors, config);
    }, 500);
  } else {
    console.log("[INDEX] Nenhum vizinho configurado. Aguardando conexões entrantes...");
  }

  // === PASSO 5: Iniciar dashboard web ===
  // Servidor HTTP na porta 3000 com interface visual e API REST
  startDashboard(config);

  // === PASSO 6: Exibir mensagem de boas-vindas ===
  console.log("=".repeat(50));
  console.log(`  Nó P2P iniciado com sucesso!`);
  console.log(`  Peer ID   : ${config.self.peer_id}`);
  console.log(`  Figurinha : ${config.self.sticker_id}`);
  console.log(`  Porta WS  : 8080`);
  console.log(`  Dashboard : http://localhost:3000`);
  console.log(`  Vizinhos  : ${neighbors.length} configurado(s)`);
  console.log("=".repeat(50));

  // === PASSO 7: Iniciar interface CLI ===
  // A CLI fica bloqueante aguardando comandos do usuário
  startCli(config);
}

// Tratamento de erros não capturados para evitar travamento silencioso do processo
process.on("uncaughtException", (err) => {
  console.error(`[INDEX] Erro não capturado: ${err.message}`);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[INDEX] Promise rejeitada sem handler: ${reason}`);
});

// Inicia o nó
main();
