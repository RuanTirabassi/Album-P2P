/**
 * handler: search.js
 *
 * Processa mensagens do tipo SEARCH recebidas de vizinhos.
 * Implementa o algoritmo de busca por inundação (flooding) com TTL e
 * supressão de duplicatas via seenQueries.
 *
 * Fluxo:
 * 1. Verificar se query_id já foi processado (descartar se sim)
 * 2. Registrar query_id no histórico de buscas vistas
 * 3. Verificar inventário local para a figurinha buscada
 *    - Se encontrada: enviar SEARCH_HIT de volta ao origin_id
 *    - Se não encontrada: enviar SEARCH_MISS (opcional)
 * 4. Se ttl - 1 > 0: reenviar SEARCH para todos os vizinhos exceto o remetente
 *
 * Ref: specs/03-protocolo.md seção SEARCH
 * Ref: specs/04-regras-de-negocio.md seção "Busca por inundação"
 */

const peers = require("../peers");
const inventory = require("../inventory");
const state = require("../state");

// Porta padrão definida pelo protocolo do trabalho — não alterar
const PORT = 8080;

// Processa uma mensagem SEARCH recebida de um vizinho.
// message: objeto com { type, query_id, sender_id, origin_id, sticker_id, ttl }
// ws: instância WebSocket da conexão de onde veio a mensagem
// config: configuração do próprio nó (contém peer_id, sticker_id, sticker_url)
function handle(message, ws, config) {
  const { query_id, sender_id, origin_id, sticker_id, ttl } = message;

  console.log(
    `[SEARCH] Recebida busca por ${sticker_id} (query_id: ${query_id ? query_id.substring(0, 8) : "?"}..., ttl: ${ttl})`
  );

  // Verifica se esta busca já foi processada antes para evitar loops de inundação
  if (state.seenQueries.has(query_id)) {
    console.log(`[SEARCH] query_id ${query_id ? query_id.substring(0, 8) : "?"}... já visto — descartando`);
    return;
  }

  // Registra o query_id antes de qualquer outra operação para garantir idempotência
  state.seenQueries.add(query_id);

  // Verifica se possui a figurinha buscada no inventário local
  const qty = inventory.hasSticker(sticker_id);

  if (qty > 0) {
    // Figurinha encontrada: enviar SEARCH_HIT diretamente ao peer que originou a busca
    console.log(`[SEARCH] ${sticker_id} encontrada no inventário local — enviando SEARCH_HIT`);

    const hitMessage = {
      type: "SEARCH_HIT",
      query_id: query_id,
      responder_id: config.self.peer_id,
      sticker_id: sticker_id,
      sticker_url: `http://${getLocalIp()}:${PORT}/images/${sticker_id}.png`,
      quantity: qty,
    };

    // Tenta enviar o SEARCH_HIT diretamente ao originador da busca
    const sent = peers.sendTo(origin_id, hitMessage);

    if (!sent) {
      // Se não há conexão direta com o origin_id, faz broadcast (exceto remetente)
      // para que a mensagem chegue ao destino por roteamento transitivo
      console.warn(`[SEARCH] Sem conexão direta com ${origin_id} — fazendo broadcast do SEARCH_HIT`);
      peers.broadcast(hitMessage, sender_id);
    }

    // Não propaga a busca após encontrar (retorna imediatamente)
    return;
  }

  // Figurinha não encontrada localmente: enviar SEARCH_MISS opcional
  const missMessage = {
    type: "SEARCH_MISS",
    query_id: query_id,
    responder_id: config.self.peer_id,
    sticker_id: sticker_id,
  };

  // Envia SEARCH_MISS apenas para o originador (ou faz broadcast se não conectado)
  const missent = peers.sendTo(origin_id, missMessage);
  if (!missent) {
    // Silencia o aviso se não há conexão — SEARCH_MISS é opcional pelo protocolo
  }

  // Propaga a busca para todos os vizinhos exceto quem enviou a mensagem
  if (ttl - 1 > 0) {
    const propagatedCount = propagateSearch(message, sender_id, config);
    console.log(
      `[SEARCH] ${sticker_id} não encontrada — propagando busca para ${propagatedCount} vizinhos com ttl ${ttl - 1}`
    );
  } else {
    console.log(`[SEARCH] TTL esgotado para busca de ${sticker_id} — não propagando`);
  }
}

// Repropaga a mensagem SEARCH para todos os vizinhos exceto o remetente original.
// message: objeto SEARCH original recebido
// senderPeerId: peer_id do vizinho que enviou esta mensagem (deve ser excluído)
// config: configuração do próprio nó
// Retorna: número de vizinhos para quem a busca foi propagada
function propagateSearch(message, senderPeerId, config) {
  const propagated = {
    ...message,
    // Decrementa TTL a cada hop para limitar a propagação
    ttl: message.ttl - 1,
    // Atualiza sender_id para o próprio peer_id (este nó agora é o remetente)
    sender_id: config.self.peer_id,
  };

  const json = JSON.stringify(propagated);
  let count = 0;

  // Propaga para todos os vizinhos conectados, exceto quem enviou a mensagem
  for (const [peerId, peer] of peers.getConnectedPeers()) {
    if (peerId === senderPeerId) continue;

    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(json);
      count++;
    }
  }

  return count;
}

// Obtém o IP local do processo para construir sticker_url no SEARCH_HIT.
// Em ambiente de desenvolvimento, retorna "localhost".
// Retorna: string com o endereço IP ou "localhost"
function getLocalIp() {
  try {
    const os = require("os");
    const ifaces = os.networkInterfaces();
    for (const iface of Object.values(ifaces)) {
      for (const alias of iface) {
        if (alias.family === "IPv4" && !alias.internal) {
          return alias.address;
        }
      }
    }
  } catch (_) {}
  return "localhost";
}

module.exports = { handle };
