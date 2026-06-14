/**
 * inventory.js
 *
 * Responsável por toda a lógica de inventário do nó P2P.
 * Carrega o estado inicial do disco (config/inventory.json),
 * expõe funções para consultar, incrementar e decrementar figurinhas,
 * e persiste automaticamente qualquer alteração de volta ao disco.
 *
 * Estado inicial: se o arquivo não existir, cria com 28 cópias da figurinha autoral
 * definida em config/peers.json.
 *
 * Usado por: handlers/tradeAccept.js, handlers/tradeOffer.js, handlers/search.js, cli.js
 */

const fs = require("fs");
const path = require("path");

// Caminho absoluto para o arquivo de inventário
const INVENTORY_PATH = path.join(__dirname, "..", "config", "inventory.json");

// Caminho absoluto para a configuração do peer (para ler figurinha autoral)
const PEERS_PATH = path.join(__dirname, "..", "config", "peers.json");

// Mapa em memória: sticker_id → quantidade
// Inicializado pelo loadInventory()
let inventory = new Map();

// Carrega o inventário do arquivo JSON em disco e retorna um Map<sticker_id, quantity>.
// Se o arquivo não existir, cria o inventário padrão com a figurinha autoral (28 cópias).
// Retorna: Map<string, number>
function loadInventory() {
  if (fs.existsSync(INVENTORY_PATH)) {
    // Lê o arquivo existente e converte o objeto JSON para Map
    const raw = fs.readFileSync(INVENTORY_PATH, "utf-8");
    const obj = JSON.parse(raw);
    inventory = new Map(Object.entries(obj));
    console.log(`[INVENTÁRIO] Carregado do disco: ${inventory.size} figurinha(s)`);
  } else {
    // Arquivo não existe — cria inventário padrão com a figurinha autoral
    const peersConfig = JSON.parse(fs.readFileSync(PEERS_PATH, "utf-8"));
    const ownSticker = peersConfig.self.sticker_id;

    inventory = new Map([[ownSticker, 28]]);
    saveInventory(inventory);
    console.log(`[INVENTÁRIO] Criado inventário padrão: ${ownSticker}=28`);
  }

  return inventory;
}

// Serializa o Map do inventário e grava em config/inventory.json.
// Deve ser chamado após toda atualização de inventário para garantir persistência.
// map: Map<sticker_id, quantity> — estado atual do inventário
function saveInventory(map) {
  // Converte o Map para objeto JSON simples antes de gravar
  const obj = Object.fromEntries(map);
  fs.writeFileSync(INVENTORY_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

// Verifica se o nó possui determinada figurinha com quantidade disponível.
// sticker_id: string no formato FIG-XX
// Retorna: número inteiro >= 0 (0 significa que não possui)
function hasSticker(sticker_id) {
  return inventory.get(sticker_id) || 0;
}

// Decrementa em 1 a quantidade de uma figurinha no inventário.
// Lança um Error se a quantidade já for 0 (previne inventário negativo).
// sticker_id: string no formato FIG-XX
// Lança: Error se qty <= 0
function decrementSticker(sticker_id) {
  const qty = inventory.get(sticker_id) || 0;

  // Garante que o inventário nunca fique negativo
  if (qty <= 0) {
    throw new Error(
      `[INVENTÁRIO] Tentativa de decrementar ${sticker_id} com qty=${qty} — operação abortada`
    );
  }

  inventory.set(sticker_id, qty - 1);
}

// Incrementa em 1 a quantidade de uma figurinha no inventário.
// Se a figurinha ainda não existir no inventário, cria a entrada com qty=1.
// sticker_id: string no formato FIG-XX
function incrementSticker(sticker_id) {
  const qty = inventory.get(sticker_id) || 0;
  inventory.set(sticker_id, qty + 1);
}

// Retorna um array de objetos com todas as figurinhas e suas quantidades.
// Usado pela CLI para exibir o inventário completo.
// Retorna: Array<{ sticker_id: string, quantity: number }>
function listInventory() {
  return Array.from(inventory.entries()).map(([sticker_id, quantity]) => ({
    sticker_id,
    quantity,
  }));
}

// Retorna o Map de inventário em memória (para leitura interna).
// Não modificar diretamente — usar as funções de incremento/decremento.
// Retorna: Map<string, number>
function getInventory() {
  return inventory;
}

module.exports = {
  loadInventory,
  saveInventory,
  hasSticker,
  decrementSticker,
  incrementSticker,
  listInventory,
  getInventory,
};
