/**
 * handler: tradeOffer.js
 *
 * Processa mensagens do tipo TRADE_OFFER recebidas de vizinhos.
 * Uma TRADE_OFFER é uma proposta de troca: o remetente oferece uma figurinha
 * e quer receber outra em troca.
 *
 * Fluxo:
 * 1. Validar que to_peer corresponde ao próprio peer_id
 * 2. Verificar pré-condições (ver specs/04-regras-de-negocio.md):
 *    a. O nó possui a figurinha em "want" com qty >= 1
 *    b. Não há trade_id duplicado em pendingTrades
 * 3. Registrar a troca em pendingTrades
 * 4. Aceitar automaticamente se as condições forem satisfeitas,
 *    ou rejeitar com reason se alguma condição falhar
 *
 * Nota: Aceite automático é adequado para testes — em produção poderia
 * aguardar confirmação do usuário via CLI (readline pergunta).
 *
 * Ref: specs/03-protocolo.md seção TRADE_OFFER
 * Ref: specs/04-regras-de-negocio.md seção "Pré-condições para aceitar TRADE_OFFER"
 */

const peers = require("../peers");
const inventory = require("../inventory");
const state = require("../state");

// Processa uma mensagem TRADE_OFFER recebida de um vizinho.
// message: objeto com { type, trade_id, from_peer, to_peer, offer, want }
// ws: instância WebSocket da conexão (não usada diretamente)
// config: configuração do próprio nó (contém peer_id)
function handle(message, ws, config) {
  const { trade_id, from_peer, to_peer, offer, want } = message;

  console.log(
    `[TRADE]  Proposta recebida de ${from_peer}: oferece ${offer}, quer ${want} (trade_id: ${trade_id ? trade_id.substring(0, 8) : "?"}...)`
  );

  // Verifica se esta proposta foi endereçada ao próprio nó
  if (to_peer !== config.self.peer_id) {
    console.warn(
      `[TRADE]  TRADE_OFFER destinada a ${to_peer}, mas este nó é ${config.self.peer_id} — ignorando`
    );
    return;
  }

  // Verifica se já existe uma troca pendente com o mesmo trade_id (evita duplicatas)
  if (state.pendingTrades.has(trade_id)) {
    console.warn(`[TRADE]  trade_id ${trade_id ? trade_id.substring(0, 8) : "?"}... já está pendente — ignorando`);
    return;
  }

  // Verifica se o nó possui a figurinha pedida (want) com quantidade >= 1
  const qtyWant = inventory.hasSticker(want);

  if (qtyWant < 1) {
    // Condição não satisfeita: rejeitar a proposta com motivo
    console.log(`[TRADE]  Rejeito ${from_peer}: não possuo ${want} (qty=${qtyWant})`);

    const rejectMessage = {
      type: "TRADE_REJECT",
      trade_id: trade_id,
      from_peer: config.self.peer_id,
      to_peer: from_peer,
      reason: `Figurinha ${want} indisponível no inventário (qty=${qtyWant})`,
    };

    peers.sendTo(from_peer, rejectMessage);
    return;
  }

  // Pré-condições satisfeitas: registrar a troca como pendente
  state.pendingTrades.set(trade_id, {
    trade_id,
    from_peer,       // quem propôs (o outro nó)
    to_peer: config.self.peer_id,
    offer,           // o que o outro nó oferece (vou receber)
    want,            // o que o outro nó quer (vou ceder)
    timestamp: new Date().toISOString(),
  });

  console.log(`[TRADE]  Proposta válida — aceitando troca com ${from_peer}`);

  // Envia TRADE_ACCEPT ao proponente
  const acceptMessage = {
    type: "TRADE_ACCEPT",
    trade_id: trade_id,
    from_peer: config.self.peer_id,
    to_peer: from_peer,
  };

  peers.sendTo(from_peer, acceptMessage);
}

module.exports = { handle };
