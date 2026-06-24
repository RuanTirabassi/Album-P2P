/**
 * dashboard.js
 *
 * Servidor HTTP na porta 3000.
 * Serve a interface gráfica (public/) e a API REST /api/status.
 *
 * As URLs das figurinhas seguem o padrão do professor:
 *   https://rgcoelho01.github.io/album/docs/images/FIG-XX.png
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const inventory = require('./inventory');
const peers     = require('./peers');
const state     = require('./state');

const DASHBOARD_PORT = 3000;
const PUBLIC_DIR     = path.join(__dirname, '..', 'public');
const STICKER_BASE_URL = 'https://rgcoelho01.github.io/album/docs/images';

// Monta a URL pública de uma figurinha
function stickerUrl(sticker_id) {
  // Normaliza: FIG-24 → FIG-24.png
  const name = sticker_id.replace(/\.png$/i, '');
  return `${STICKER_BASE_URL}/${name}.png`;
}

function startDashboard(config) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.url === '/api/status') return handleApiStatus(req, res, config);
    serveStaticFile(req, res);
  });

  server.listen(DASHBOARD_PORT, () => {
    console.log(`[DASHBOARD] Interface web disponível em http://localhost:${DASHBOARD_PORT}`);
  });

  server.on('error', (err) => {
    console.error(`[DASHBOARD] Erro: ${err.message}`);
  });

  return server;
}

function handleApiStatus(req, res, config) {
  // Inventário com sticker_url gerada a partir do link do professor
  const inventoryWithUrl = inventory.listInventory().map(item => ({
    ...item,
    sticker_url: stickerUrl(item.sticker_id),
  }));

  const status = {
    self: {
      peer_id:     config.self.peer_id,
      sticker_id:  config.self.sticker_id,
      sticker_url: stickerUrl(config.self.sticker_id),
    },
    inventory: inventoryWithUrl,
    peers: peers.listPeers().map(peerId => {
      const peer = peers.getPeer(peerId);
      return { peer_id: peerId, host: peer.host || 'desconhecido', port: peer.port };
    }),
    pendingTrades: Array.from(state.pendingTrades.values()),
    tradeHistory:  state.tradeHistory,
    timestamp:     new Date().toISOString(),
  };

  const json = JSON.stringify(status, null, 2);
  res.writeHead(200, {
    'Content-Type':   'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function serveStaticFile(req, res) {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0].split('#')[0];

  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
  };

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexData) => {
          if (err2) { res.writeHead(404); res.end('Not Found'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(indexData); }
        });
      } else { res.writeHead(500); res.end(`Internal Server Error: ${err.message}`); }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

module.exports = { startDashboard };
