/**
 * cli.js
 *
 * Interface de linha de comando (CLI) do nó P2P.
 * Usa a biblioteca readline do Node.js para ler comandos do terminal
 * e executar operações como buscar figurinhas, iniciar trocas e consultar estado.
 *
 * Comandos disponíveis:
 * - inventario           — lista figurinhas e quantidades
 * - buscar FIG-XX        — inicia busca SEARCH por inundação
 * - trocar FIG-XX com ALUNO-YY — envia TRADE_OFFER para um peer específico
 * - vizinhos             — lista peers conectados atualmente
 * - historico            — exibe histórico de trocas concluídas
 * - ajuda                — exibe lista de comandos disponíveis
 * - sair                 — encerra o processo
 *
 * Usado por: index.js
 * Usa: inventory.js, peers.js, state.js
 */

const readline = require("readline");
const { v4: uuidv4 } = require("uuid");

const inventory = require("./inventory");
const peers = require("./peers");
const state = require("./state");

// TTL inicial da busca por inundação — define quantos hops a busca pode percorrer
const DEFAULT_TTL = 7;

// Inicia a interface de linha de comando e fica aguardando comandos do usuário.
// config: objeto de configuração do próprio nó (contém peer_id, sticker_id, sticker_url)
function startCli(config) {
  // Cria a interface readline para leitura do stdin e escrita no stdout
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `[${config.self.peer_id}]> `,
  });

  console.log("\n=== Album P2P — Interface de Linha de Comando ===");
  console.log('Digite "ajuda" para ver os comandos disponíveis.\n');

  // Exibe o prompt inicial
  rl.prompt();

  // Handler principal: disparado para cada linha digitada pelo usuário
  rl.on("line", (linha) => {
    // Remove espaços em branco extras e converte para minúsculas para normalização
    const input = linha.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Processa o comando digitado e executa a ação correspondente
    processCommand(input, config);

    // Exibe o prompt novamente após processar o comando
    rl.prompt();
  });

  // Handler de encerramento (Ctrl+C ou Ctrl+D)
  rl.on("close", () => {
    console.log("\n[CLI] Encerrando nó P2P...");
    process.exit(0);
  });
}

// Interpreta e executa um comando digitado pelo usuário.
// input: string com o comando completo (já trimado)
// config: objeto de configuração do próprio nó
function processCommand(input, config) {
  // Divide o comando em tokens para facilitar a interpretação
  const tokens = input.split(/\s+/);
  const comando = tokens[0].toLowerCase();

  switch (comando) {
    case "inventario":
      cmdInventario();
      break;

    case "buscar":
      // Formato esperado: buscar FIG-XX
      if (tokens.length < 2) {
        console.log("[CLI] Uso: buscar FIG-XX");
        break;
      }
      cmdBuscar(tokens[1], config);
      break;

    case "trocar":
      // Formato esperado: trocar FIG-XX com ALUNO-YY
      // tokens: ["trocar", "FIG-XX", "com", "ALUNO-YY"]
      if (tokens.length < 4 || tokens[2].toLowerCase() !== "com") {
        console.log("[CLI] Uso: trocar FIG-XX com ALUNO-YY");
        break;
      }
      cmdTrocar(tokens[1], tokens[3], config);
      break;

    case "vizinhos":
      cmdVizinhos();
      break;

    case "historico":
      cmdHistorico();
      break;

    case "ajuda":
      cmdAjuda();
      break;

    case "sair":
      console.log("[CLI] Encerrando...");
      process.exit(0);
      break;

    default:
      console.log(`[CLI] Comando desconhecido: "${comando}". Digite "ajuda" para ver os comandos.`);
  }
}

// Exibe todas as figurinhas do inventário local com suas quantidades.
function cmdInventario() {
  const items = inventory.listInventory();

  if (items.length === 0) {
    console.log("[CLI] Inventário vazio.");
    return;
  }

  console.log("[CLI] === Inventário ===");
  for (const { sticker_id, quantity } of items) {
    // Destaca figurinhas com quantidade zero para facilitar visualização
    const status = quantity === 0 ? " (esgotada)" : "";
    console.log(`  ${sticker_id}: ${quantity}${status}`);
  }
}

// Inicia uma busca por inundação (SEARCH) pela figurinha informada.
// sticker_id: string no formato FIG-XX
// config: configuração do próprio nó
function cmdBuscar(sticker_id, config) {
  const connectedList = peers.listPeers();

  if (connectedList.length === 0) {
    console.log("[CLI] Sem vizinhos conectados para buscar.");
    return;
  }

  // Gera um query_id único para esta busca (UUID v4 conforme protocolo)
  const query_id = uuidv4();

  // Monta a mensagem SEARCH conforme o protocolo
  const searchMessage = {
    type: "SEARCH",
    query_id,
    sender_id: config.self.peer_id,
    origin_id: config.self.peer_id,
    sticker_id,
    ttl: DEFAULT_TTL,
  };

  // Registra o query_id localmente para não reprocessar se receber de volta
  state.seenQueries.add(query_id);

  // Inicializa a lista de resultados para esta busca
  state.pendingResults.set(query_id, []);

  console.log(`[CLI] Buscando ${sticker_id} na rede (query_id: ${query_id.substring(0, 8)}..., ttl: ${DEFAULT_TTL})`);

  // Envia a busca para todos os vizinhos conectados
  peers.broadcast(searchMessage, null);

  console.log(`[CLI] Busca propagada para ${connectedList.length} vizinho(s). Aguarde SEARCH_HIT...`);
}

// Inicia uma proposta de troca (TRADE_OFFER) com um peer específico.
// sticker_id: figurinha que este nó quer receber (want)
// target_peer: peer_id do parceiro de troca (ALUNO-YY)
// config: configuração do próprio nó
function cmdTrocar(sticker_id, target_peer, config) {
  // Verifica se o peer alvo está conectado
  const peer = peers.getPeer(target_peer);

  if (!peer) {
    console.log(`[CLI] Peer ${target_peer} não está conectado.`);
    return;
  }

  // Verifica se este nó possui a própria figurinha autoral para oferecer
  const ownSticker = config.self.sticker_id;
  const qtyOwn = inventory.hasSticker(ownSticker);

  if (qtyOwn < 1) {
    console.log(`[CLI] Não possuo ${ownSticker} para oferecer (qty=${qtyOwn}).`);
    return;
  }

  // Gera um trade_id único para esta negociação (UUID v4 conforme protocolo)
  const trade_id = uuidv4();

  // Monta a mensagem TRADE_OFFER conforme o protocolo
  const tradeOfferMessage = {
    type: "TRADE_OFFER",
    trade_id,
    from_peer: config.self.peer_id,
    to_peer: target_peer,
    offer: ownSticker,   // o que este nó oferece (figurinha autoral)
    want: sticker_id,    // o que este nó quer receber
  };

  // Registra a troca como pendente antes de enviar
  state.pendingTrades.set(trade_id, {
    trade_id,
    from_peer: config.self.peer_id,
    to_peer: target_peer,
    offer: ownSticker,
    want: sticker_id,
    timestamp: new Date().toISOString(),
  });

  console.log(
    `[CLI] Enviando proposta de troca para ${target_peer}: ofereço ${ownSticker}, quero ${sticker_id}`
  );

  // Envia a proposta de troca diretamente ao peer alvo
  peers.sendTo(target_peer, tradeOfferMessage);
}

// Exibe a lista de peers atualmente conectados.
function cmdVizinhos() {
  const peerList = peers.listPeers();

  if (peerList.length === 0) {
    console.log("[CLI] Nenhum vizinho conectado no momento.");
    return;
  }

  console.log("[CLI] === Vizinhos Conectados ===");
  for (const peerId of peerList) {
    const peer = peers.getPeer(peerId);
    const host = peer.host || "desconhecido";
    console.log(`  ${peerId} — ${host}:${peer.port}`);
  }
}

// Exibe o histórico de todas as trocas concluídas nesta sessão.
function cmdHistorico() {
  if (state.tradeHistory.length === 0) {
    console.log("[CLI] Nenhuma troca realizada ainda.");
    return;
  }

  console.log("[CLI] === Histórico de Trocas ===");
  for (const trade of state.tradeHistory) {
    const data = new Date(trade.timestamp).toLocaleString("pt-BR");
    console.log(
      `  [${data}] trade ${trade.trade_id.substring(0, 8)}... | ` +
      `parceiro: ${trade.partner} | dei: ${trade.gave} | recebi: ${trade.received}`
    );
  }
}

// Exibe a lista de comandos disponíveis na CLI.
function cmdAjuda() {
  console.log("[CLI] === Comandos Disponíveis ===");
  console.log("  inventario             — lista figurinhas e quantidades");
  console.log("  buscar FIG-XX          — busca a figurinha na rede por inundação");
  console.log("  trocar FIG-XX com ALUNO-YY — propõe troca: oferece FIG autoral, quer FIG-XX");
  console.log("  vizinhos               — lista peers conectados");
  console.log("  historico              — exibe histórico de trocas concluídas");
  console.log("  ajuda                  — exibe esta mensagem");
  console.log("  sair                   — encerra o processo");
}

module.exports = { startCli };
