# 04 — Regras de Negócio

## Inventário

### Estado inicial

Ao iniciar o nó, o inventário deve ser carregado de `config/inventory.json`. Se o arquivo não existir, criar com o estado padrão:

```json
{
  "FIG-02": 28
}
```

> Substitua `FIG-02` pela sua figurinha autoral. O número 28 é obrigatório.

### Estrutura em memória

```js
// Map<sticker_id, quantity>
inventory = new Map([
  ["FIG-02", 28],
  ["FIG-07", 2], // adquiridas via troca
]);
```

### Persistência

Após **toda atualização de inventário**, gravar o estado atualizado em `config/inventory.json`. Isso garante que o nó possa ser reiniciado sem perder o progresso.

### Regras de validação

| Regra                                   | Detalhe                                                     |
| --------------------------------------- | ----------------------------------------------------------- |
| Inventário nunca negativo               | Antes de qualquer troca, verificar se qty >= 1              |
| Figurinha autoral não removida do disco | O arquivo PNG permanece, apenas a quantidade lógica diminui |
| Quantidade mínima para troca            | qty >= 1 no momento da proposta E no momento do aceite      |

---

## Troca

### Pré-condições para aceitar TRADE_OFFER

1. `to_peer` == próprio `peer_id`
2. A figurinha em `want` está no inventário com qty >= 1
3. Não há outra troca pendente com o mesmo `trade_id`

### Processo de execução da troca (após TRADE_ACCEPT)

Execute nesta ordem exata para evitar estado inconsistente:

1. Verificar novamente que ambas as figurinhas têm qty >= 1
2. Se alguma verificação falhar → enviar TRADE_REJECT com reason
3. Se ambas ok:
   a. Decrementar qty da figurinha cedida em -1
   b. Incrementar (ou inserir com qty 1) a figurinha recebida
   c. Gravar inventário em disco
   d. Enviar TRANSFER_CONFIRM
   e. Registrar no histórico de trocas

### Histórico de trocas

Manter em memória um array de objetos:

```js
tradeHistory = [
  {
    trade_id: "...",
    timestamp: "2026-06-14T15:00:00.000Z",
    partner: "ALUNO-05",
    gave: "FIG-02",
    received: "FIG-07",
  },
];
```

---

## Busca por inundação

### Algoritmo

```
receber SEARCH(query_id, sender_id, origin_id, sticker_id, ttl):
  se query_id em seenQueries:
    descartar e retornar          ← prevenção de duplicata

  adicionar query_id a seenQueries

  se sticker_id em inventário local com qty > 0:
    enviar SEARCH_HIT para origin_id
    retornar                      ← não propaga após encontrar

  senão:
    enviar SEARCH_MISS (opcional)

  se ttl - 1 > 0:
    para cada vizinho (exceto sender_id):
      enviar SEARCH com ttl = ttl - 1, sender_id = próprio peer_id
```

### Limites

- TTL padrão inicial: **7**
- `seenQueries` pode crescer indefinidamente em memória (não há expiração nesta etapa)
- A busca não tem timeout explícito nesta etapa; o requester aguarda passivamente por SEARCH_HIT

---

## Gerenciamento de vizinhos

### Arquivo `config/peers.json`

Configura vizinhos de forma estática. O agente não precisa implementar descoberta automática.

### Conexão ao iniciar

Ao iniciar o nó:

1. Carregar lista de vizinhos de `config/peers.json`
2. Para cada vizinho, abrir conexão WebSocket de saída
3. Após conexão estabelecida, enviar HELLO imediatamente
4. Em caso de falha de conexão, logar erro e continuar (não travar o processo)

### Reconexão

Implementar reconexão simples com intervalo de 5 segundos se a conexão cair.
