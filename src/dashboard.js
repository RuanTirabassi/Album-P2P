/**
 * dashboard.js
 *
 * Servidor HTTP embutido que expõe um dashboard web para visualização
 * do estado do nó P2P em tempo real. Serve a interface gráfica em HTML/CSS/JS
 * e disponibiliza uma API REST para que a página consulte dados do nó.
 *
 * Endpoints:
 * - GET /            → serve public/index.html (interface gráfica)
 * - GET /api/status  → retorna JSON com inventário, peers, histórico e trades pendentes
 *
 * Porta padrão: 3000 (separada da porta WebSocket 8080)
 *
 * Usado por: index.js
 * Usa: inventory.js, peers.js, state.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const inventory = require("./inventory");
const peers = require("./peers");
const state = require("./state");

// Porta do servidor HTTP do dashboard (separada da porta WebSocket 8080)
const DASHBOARD_PORT = 3000;

// Caminho para a pasta pública com os arquivos estáticos
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Inicia o servidor HTTP do dashboard.
// config: objeto de configuração do nó (contém peer_id, sticker_id etc.)
// Retorna: instância de http.Server
function startDashboard(config) {
  const server = http.createServer((req, res) => {
    // Adiciona cabeçalhos CORS para permitir requests do browser
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    // Rota da API: retorna o estado atual do nó em JSON
    if (req.url === "/api/status") {
      return handleApiStatus(req, res, config);
    }

    // Todas as outras rotas servem o arquivo estático correspondente em /public
    serveStaticFile(req, res);
  });

  server.listen(DASHBOARD_PORT, () => {
    console.log(
      `[DASHBOARD] Interface web disponível em http://localhost:${DASHBOARD_PORT}`
    );
  });

  // Loga erros do servidor HTTP mas não trava o processo P2P
  server.on("error", (err) => {
    console.error(`[DASHBOARD] Erro no servidor HTTP: ${err.message}`);
  });

  return server;
}

// Retorna um objeto JSON com o estado completo do nó para o dashboard.
// Inclui: informações do peer, inventário, vizinhos conectados,
// trades pendentes e histórico de trocas.
// req: IncomingMessage do http.createServer
// res: ServerResponse
// config: configuração do próprio nó
function handleApiStatus(req, res, config) {
  // Monta o objeto de status agregando dados de todos os módulos
  const status = {
    // Dados de identidade do nó
    self: {
      peer_id: config.self.peer_id,
      sticker_id: config.self.sticker_id,
      sticker_url: config.self.sticker_url,
    },

    // Inventário completo com todas as figurinhas e quantidades
    inventory: inventory.listInventory(),

    // Lista de peers atualmente conectados
    peers: peers.listPeers().map((peerId) => {
      const peer = peers.getPeer(peerId);
      return {
        peer_id: peerId,
        host: peer.host || "desconhecido",
        port: peer.port,
      };
    }),

    // Trades pendentes aguardando resposta
    pendingTrades: Array.from(state.pendingTrades.values()),

    // Histórico de trocas concluídas nesta sessão
    tradeHistory: state.tradeHistory,

    // Timestamp para saber quando foi atualizado
    timestamp: new Date().toISOString(),
  };

  const json = JSON.stringify(status, null, 2);

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

// Serve um arquivo estático da pasta /public.
// Suporta HTML, CSS e JavaScript com os Content-Types corretos.
// req: IncomingMessage — req.url é usado para resolver o caminho do arquivo
// res: ServerResponse
function serveStaticFile(req, res) {
  // Normaliza a URL: "/" vira "/index.html"
  let urlPath = req.url === "/" ? "/index.html" : req.url;

  // Remove query strings e fragments para resolver o arquivo corretamente
  urlPath = urlPath.split("?")[0].split("#")[0];

  // Resolve o caminho absoluto do arquivo dentro da pasta public
  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Garante que o caminho não escapa da pasta public (segurança)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Mapa de extensões para Content-Type
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";

  // Lê e serve o arquivo solicitado
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Arquivo não encontrado: serve o index.html como fallback (SPA behavior)
      if (err.code === "ENOENT") {
        const indexPath = path.join(PUBLIC_DIR, "index.html");
        fs.readFile(indexPath, (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end("Not Found");
          } else {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(indexData);
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Internal Server Error: ${err.message}`);
      }
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

module.exports = { startDashboard };
