/**
 * inventory.js
 *
 * Gerencia o inventário do nó P2P.
 * Carrega config/inventory.json ao iniciar e persiste automaticamente
 * após QUALQUER alteração (incremento ou decremento).
 *
 * Estado inicial: se o arquivo não existir, cria com 28 cópias da figurinha autoral.
 */

const fs = require('fs');
const path = require('path');

const INVENTORY_PATH = path.join(__dirname, '..', 'config', 'inventory.json');
const PEERS_PATH     = path.join(__dirname, '..', 'config', 'peers.json');

// Mapa em memória: sticker_id → quantidade
let inventory = new Map();

// Carrega o inventário do disco (ou cria padrão com 28 cópias)
function loadInventory() {
  if (fs.existsSync(INVENTORY_PATH)) {
    const raw = fs.readFileSync(INVENTORY_PATH, 'utf-8');
    const obj = JSON.parse(raw);
    inventory = new Map(Object.entries(obj).map(([k, v]) => [k, Number(v)]));
    console.log(`[INVENTÁRIO] Carregado do disco: ${inventory.size} figurinha(s)`);
  } else {
    const peersConfig = JSON.parse(fs.readFileSync(PEERS_PATH, 'utf-8'));
    const ownSticker  = peersConfig.self.sticker_id;
    inventory = new Map([[ownSticker, 28]]);
    saveInventory(inventory);
    console.log(`[INVENTÁRIO] Criado padrão: ${ownSticker}=28`);
  }
  return inventory;
}

// Grava o mapa em config/inventory.json
function saveInventory(map) {
  const obj = Object.fromEntries(map);
  fs.writeFileSync(INVENTORY_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  console.log('[INVENTÁRIO] Salvo no disco.');
}

// Persiste após qualquer mudança
function _persist() {
  saveInventory(inventory);
}

// Retorna a quantidade de uma figurinha (0 se não possuir)
function hasSticker(sticker_id) {
  return inventory.get(sticker_id) || 0;
}

// Remove N unidades de uma figurinha e persiste. Impede inventário negativo.
function removeSticker(sticker_id, qty = 1) {
  const current = inventory.get(sticker_id) || 0;
  if (current < qty) {
    throw new Error(`[INVENTÁRIO] Sem estoque suficiente de ${sticker_id} (tem ${current}, pediu ${qty})`);
  }
  inventory.set(sticker_id, current - qty);
  _persist();
}

// Adiciona N unidades de uma figurinha e persiste.
function addSticker(sticker_id, qty = 1) {
  const current = inventory.get(sticker_id) || 0;
  inventory.set(sticker_id, current + qty);
  _persist();
}

// Aliases para compatibilidade com código antigo
function decrementSticker(sticker_id) { removeSticker(sticker_id, 1); }
function incrementSticker(sticker_id) { addSticker(sticker_id, 1); }

// Retorna array com { sticker_id, quantity } para exibição
function listInventory() {
  return Array.from(inventory.entries()).map(([sticker_id, quantity]) => ({ sticker_id, quantity }));
}

// Retorna o Map interno (somente leitura interna)
function getInventory() {
  return inventory;
}

module.exports = {
  loadInventory,
  saveInventory,
  hasSticker,
  removeSticker,
  addSticker,
  decrementSticker,
  incrementSticker,
  listInventory,
  getInventory,
};
