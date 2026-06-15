/**
 * cli.js
 *
 * Interface de linha de comando (CLI) do nó P2P.
 *
 * Comandos disponíveis:
 * - inventario               — lista figurinhas e quantidades
 * - buscar FIG-XX            — inicia busca SEARCH por inundação
 * - trocar FIG-XX com ALUNO-YY — envia TRADE_OFFER para um peer
 * - aceitar <message_id>     — aceita uma TRADE_OFFER pendente
 * - rejeitar <message_id>    — rejeita uma TRADE_OFFER pendente
 * - pendentes                — lista propostas de troca pendentes
 * - vizinhos                 — lista peers conectados
 * - historico                — exibe histórico de trocas concluídas
 * - ajuda                    — exibe lista de comandos
 * - sair                     — encerra o processo
 */

const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const inventory = require('./inventory');
const peers = require('./peers');
const state = require('./state');

const DEFAULT_TTL = 7;

// Obtém o IP local para preencher origin_peer_ip no SEARCH
function getLocalIp() {
  try {
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) return alias.address;
      }
    }
  } catch (_) {}
  return 'localhost';
}

function startCli(config) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `[${config.self.peer_id}]> `,
  });

  console.log('\n=== Album P2P — Interface de Linha de Comando ===');
  console.log('Digite "ajuda" para ver os comandos disponíveis.\n');
  rl.prompt();

  rl.on('line', (linha) => {
    const input = linha.trim();
    if (input) processCommand(input, config);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n[CLI] Encerrando nó P2P...');
    process.exit(0);
  });
}

function processCommand(input, config) {
  const tokens = input.split(/\s+/);
  const comando = tokens[0].toLowerCase();

  switch (comando) {
    case 'inventario':  cmdInventario();                                     break;
    case 'vizinhos':    cmdVizinhos();                                       break;
    case 'historico':   cmdHistorico();                                      break;
    case 'pendentes':   cmdPendentes();                                      break;
    case 'ajuda':       cmdAjuda();                                          break;
    case 'sair':        process.exit(0);                                     break;

    case 'buscar':
      if (tokens.length < 2) { console.log('[CLI] Uso: buscar FIG-XX'); break; }
      cmdBuscar(tokens[1].toUpperCase(), config);
      break;

    case 'trocar':
      // trocar FIG-XX com ALUNO-YY
      if (tokens.length < 4 || tokens[2].toLowerCase() !== 'com') {
        console.log('[CLI] Uso: trocar FIG-XX com ALUNO-YY');
        break;
      }
      cmdTrocar(tokens[1].toUpperCase(), tokens[3].toUpperCase(), config);
      break;

    case 'aceitar':
      if (tokens.length < 2) { console.log('[CLI] Uso: aceitar <message_id>'); break; }
      cmdAceitar(tokens[1], config);
      break;

    case 'rejeitar':
      if (tokens.length < 2) { console.log('[CLI] Uso: rejeitar <message_id>'); break; }
      cmdRejeitar(tokens[1], config);
      break;

    default:
      console.log(`[CLI] Comando desconhecido: "${comando}". Digite "ajuda".`);
  }
}

// Lista inventário
function cmdInventario() {
  const items = inventory.listInventory();
  if (items.length === 0) { console.log('[CLI] Inventário vazio.'); return; }
  console.log('[CLI] === Inventário ===');
  for (const { sticker_id, quantity } of items) {
    console.log(`  ${sticker_id}: ${quantity}${quantity === 0 ? ' (esgotada)' : ''}`);
  }
}

// Busca por inundação — formato oficial do spec
function cmdBuscar(sticker_id, config) {
  const connectedList = peers.listPeers();
  if (connectedList.length === 0) {
    console.log('[CLI] Sem vizinhos conectados para buscar.');
    return;
  }

  const query_id = uuidv4();

  // Formato oficial: SEARCH com todos os campos do spec
  const searchMessage = {
    type: 'SEARCH',
    message_id: uuidv4(),
    origin_peer_id: config.self.peer_id,
    origin_peer_ip: getLocalIp(),
    sender_peer_id: config.self.peer_id,
    receiver_peer_id: null,   // preenchido por cada vizinho no broadcast
    query_id,
    ttl: DEFAULT_TTL,
    sticker_id,
  };

  state.seenQueries.add(query_id);
  state.pendingResults.set(query_id, []);

  console.log(`[CLI] Buscando ${sticker_id} | query_id: ${query_id.substring(0, 8)}... | ttl: ${DEFAULT_TTL}`);
  peers.broadcast(searchMessage, null);
  console.log(`[CLI] Busca propagada para ${connectedList.length} vizinho(s). Aguarde SEARCH_HIT...`);

  // Exibe resultados após 5 segundos
  setTimeout(() => {
    const hits = state.pendingResults.get(query_id) || [];
    if (hits.length === 0) {
      console.log(`[CLI] Nenhum resultado para ${sticker_id}.`);
    } else {
      console.log(`[CLI] Resultados para ${sticker_id}:`);
      for (const h of hits) {
        console.log(`  -> ${h.peer_id} possui ${h.sticker_id}`);
      }
    }
  }, 5000);
}

// Proposta de troca — formato oficial do spec
function cmdTrocar(sticker_id, target_peer, config) {
  const peer = peers.getPeer(target_peer);
  if (!peer) {
    console.log(`[CLI] Peer ${target_peer} não está conectado.`);
    console.log(`[CLI] Vizinhos ativos: ${peers.listPeers().join(', ') || 'nenhum'}`);
    return;
  }

  const ownSticker = config.self.sticker_id;
  const qtyOwn = inventory.hasSticker(ownSticker);
  if (qtyOwn < 1) {
    console.log(`[CLI] Não possuo ${ownSticker} para oferecer (qty=${qtyOwn}).`);
    return;
  }

  const message_id = uuidv4();

  // Formato oficial: TRADE_OFFER com campos do spec
  const tradeOfferMessage = {
    type: 'TRADE_OFFER',
    message_id,
    origin_peer_id: config.self.peer_id,
    sender_peer_id: config.self.peer_id,
    receiver_peer_id: target_peer,
    offer_sticker_id: ownSticker,
    want_sticker_id: sticker_id,
  };

  state.pendingTrades.set(message_id, {
    trade_id: message_id,
    from_peer: config.self.peer_id,
    to_peer: target_peer,
    offer: ownSticker,
    want: sticker_id,
    timestamp: new Date().toISOString(),
  });

  console.log(`[CLI] Enviando TRADE_OFFER para ${target_peer}: ofereço ${ownSticker}, quero ${sticker_id}`);
  peers.sendTo(target_peer, tradeOfferMessage);
}

// Aceita uma proposta de troca pendente
function cmdAceitar(message_id_prefix, config) {
  // Busca pelo prefixo do message_id
  let found = null;
  for (const [id, trade] of state.pendingTrades) {
    if (id.startsWith(message_id_prefix)) { found = { id, trade }; break; }
  }

  if (!found) {
    console.log(`[CLI] Proposta "${message_id_prefix}" não encontrada. Use "pendentes" para listar.`);
    return;
  }

  const { id, trade } = found;
  const haveToGive = inventory.hasSticker(trade.want);
  if (!haveToGive || haveToGive <= 0) {
    console.log(`[CLI] Não possuo ${trade.want} para entregar.`);
    return;
  }

  const acceptMsg = {
    type: 'TRADE_ACCEPT',
    message_id: uuidv4(),
    origin_peer_id: config.self.peer_id,
    sender_peer_id: config.self.peer_id,
    receiver_peer_id: trade.from_peer,
    offer_sticker_id: trade.offer,
    want_sticker_id: trade.want,
  };

  // Atualiza inventário
  inventory.removeSticker(trade.want, 1);
  inventory.addSticker(trade.offer, 1);

  state.tradeHistory.push({
    trade_id: id,
    timestamp: new Date().toISOString(),
    partner: trade.from_peer,
    gave: trade.want,
    received: trade.offer,
  });

  state.pendingTrades.delete(id);

  peers.sendTo(trade.from_peer, acceptMsg);
  console.log(`[CLI] Troca aceita! Dei: ${trade.want}, recebi: ${trade.offer}`);
}

// Rejeita uma proposta de troca pendente
function cmdRejeitar(message_id_prefix, config) {
  let found = null;
  for (const [id, trade] of state.pendingTrades) {
    if (id.startsWith(message_id_prefix)) { found = { id, trade }; break; }
  }

  if (!found) {
    console.log(`[CLI] Proposta "${message_id_prefix}" não encontrada. Use "pendentes" para listar.`);
    return;
  }

  const { id, trade } = found;

  const rejectMsg = {
    type: 'TRADE_REJECT',
    message_id: uuidv4(),
    origin_peer_id: config.self.peer_id,
    sender_peer_id: config.self.peer_id,
    receiver_peer_id: trade.from_peer,
    offer_sticker_id: trade.offer,
    want_sticker_id: trade.want,
  };

  state.pendingTrades.delete(id);
  peers.sendTo(trade.from_peer, rejectMsg);
  console.log(`[CLI] Proposta ${id.substring(0, 8)}... rejeitada.`);
}

// Lista propostas de troca pendentes
function cmdPendentes() {
  if (state.pendingTrades.size === 0) {
    console.log('[CLI] Nenhuma proposta de troca pendente.');
    return;
  }
  console.log('[CLI] === Propostas Pendentes ===');
  for (const [id, trade] of state.pendingTrades) {
    console.log(`  ${id.substring(0, 8)}... | de: ${trade.from_peer} | oferece: ${trade.offer} | quer: ${trade.want}`);
  }
}

function cmdVizinhos() {
  const peerList = peers.listPeers();
  if (peerList.length === 0) { console.log('[CLI] Nenhum vizinho conectado.'); return; }
  console.log('[CLI] === Vizinhos Conectados ===');
  for (const peerId of peerList) {
    const peer = peers.getPeer(peerId);
    console.log(`  ${peerId} — ${peer.host || '?'}:${peer.port}`);
  }
}

function cmdHistorico() {
  if (state.tradeHistory.length === 0) { console.log('[CLI] Nenhuma troca realizada.'); return; }
  console.log('[CLI] === Histórico de Trocas ===');
  for (const trade of state.tradeHistory) {
    const data = new Date(trade.timestamp).toLocaleString('pt-BR');
    console.log(`  [${data}] ${trade.trade_id.substring(0,8)}... | parceiro: ${trade.partner} | dei: ${trade.gave} | recebi: ${trade.received}`);
  }
}

function cmdAjuda() {
  console.log('[CLI] === Comandos Disponíveis ===');
  console.log('  inventario               — lista figurinhas e quantidades');
  console.log('  buscar FIG-XX            — busca figurinha na rede por inundação');
  console.log('  trocar FIG-XX com ALUNO-YY — propõe troca (oferece FIG autoral, quer FIG-XX)');
  console.log('  aceitar <message_id>     — aceita proposta de troca pendente');
  console.log('  rejeitar <message_id>    — rejeita proposta de troca pendente');
  console.log('  pendentes                — lista propostas de troca recebidas');
  console.log('  vizinhos                 — lista peers conectados');
  console.log('  historico                — exibe histórico de trocas concluídas');
  console.log('  ajuda                    — exibe esta mensagem');
  console.log('  sair                     — encerra o processo');
}

module.exports = { startCli };
