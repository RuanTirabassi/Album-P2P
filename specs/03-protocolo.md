# 03 — Protocolo de Mensagens

Todas as mensagens são objetos JSON UTF-8. Toda mensagem obrigatoriamente possui o campo `"type"`.

---

## HELLO

Anuncia presença do nó ao vizinho assim que a conexão WebSocket é estabelecida.

```json
{
  "type": "HELLO",
  "peer_id": "ALUNO-02",
  "sticker_id": "FIG-02",
  "sticker_url": "http://192.168.0.5:8080/images/FIG-02.png"
}
```

| Campo         | Tipo   | Descrição                                        |
| ------------- | ------ | ------------------------------------------------ |
| `peer_id`     | string | Identificador do nó remetente (formato ALUNO-YY) |
| `sticker_id`  | string | Figurinha autoral do nó (formato FIG-XX)         |
| `sticker_url` | string | URL pública da imagem PNG da figurinha           |

**Comportamento ao receber:** registrar o peer_id e associar à conexão WebSocket.

---

## SEARCH

Busca uma figurinha na rede por inundação.

```json
{
  "type": "SEARCH",
  "query_id": "550e8400-e29b-41d4-a716-446655440000",
  "sender_id": "ALUNO-02",
  "origin_id": "ALUNO-02",
  "sticker_id": "FIG-07",
  "ttl": 7
}
```

| Campo        | Tipo    | Descrição                                   |
| ------------ | ------- | ------------------------------------------- |
| `query_id`   | string  | UUID v4 único para esta busca               |
| `sender_id`  | string  | Quem enviou esta mensagem (muda a cada hop) |
| `origin_id`  | string  | Quem originou a busca (não muda)            |
| `sticker_id` | string  | Figurinha sendo buscada                     |
| `ttl`        | integer | Tempo de vida restante (padrão inicial: 7)  |

**Comportamento ao receber:**

1. Se `query_id` já está em `seenQueries` → **descartar silenciosamente**
2. Caso contrário → adicionar `query_id` a `seenQueries`
3. Verificar se `sticker_id` está no inventário local com qty > 0
   - Sim → responder com `SEARCH_HIT` diretamente ao `origin_id`
   - Não → responder opcionalmente com `SEARCH_MISS`
4. Se `ttl - 1 > 0` → reenviar SEARCH para todos os vizinhos **exceto o remetente**, com `ttl - 1` e `sender_id` atualizado para o próprio peer_id

---

## SEARCH_HIT

Resposta positiva informando que a figurinha foi encontrada.

```json
{
  "type": "SEARCH_HIT",
  "query_id": "550e8400-e29b-41d4-a716-446655440000",
  "responder_id": "ALUNO-05",
  "sticker_id": "FIG-07",
  "sticker_url": "http://192.168.0.8:8080/images/FIG-07.png",
  "quantity": 3
}
```

| Campo          | Tipo    | Descrição                        |
| -------------- | ------- | -------------------------------- |
| `query_id`     | string  | Mesmo UUID da busca original     |
| `responder_id` | string  | Peer que possui a figurinha      |
| `sticker_id`   | string  | Figurinha encontrada             |
| `sticker_url`  | string  | URL da imagem                    |
| `quantity`     | integer | Quantidade disponível para troca |

---

## SEARCH_MISS

Resposta opcional indicando que o nó não possui a figurinha.

```json
{
  "type": "SEARCH_MISS",
  "query_id": "550e8400-e29b-41d4-a716-446655440000",
  "responder_id": "ALUNO-03",
  "sticker_id": "FIG-07"
}
```

---

## TRADE_OFFER

Propõe uma troca entre dois nós.

```json
{
  "type": "TRADE_OFFER",
  "trade_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "from_peer": "ALUNO-02",
  "to_peer": "ALUNO-05",
  "offer": "FIG-02",
  "want": "FIG-07"
}
```

| Campo       | Tipo   | Descrição                                |
| ----------- | ------ | ---------------------------------------- |
| `trade_id`  | string | UUID v4 único para esta negociação       |
| `from_peer` | string | Quem propõe a troca                      |
| `to_peer`   | string | Quem recebe a proposta                   |
| `offer`     | string | sticker_id que o proponente oferece      |
| `want`      | string | sticker_id que o proponente quer receber |

**Validação ao receber:**

- Verificar se `to_peer` corresponde ao próprio peer_id
- Verificar se o nó possui `want` (a figurinha pedida) com qty > 0
- Verificar se o remetente possui `offer` (implícito — confirmado no TRANSFER_CONFIRM)

---

## TRADE_ACCEPT

Aceita a proposta de troca.

```json
{
  "type": "TRADE_ACCEPT",
  "trade_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "from_peer": "ALUNO-05",
  "to_peer": "ALUNO-02"
}
```

---

## TRADE_REJECT

Rejeita a proposta de troca.

```json
{
  "type": "TRADE_REJECT",
  "trade_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "from_peer": "ALUNO-05",
  "to_peer": "ALUNO-02",
  "reason": "Figurinha indisponível no inventário"
}
```

| Campo    | Tipo   | Descrição                     |
| -------- | ------ | ----------------------------- |
| `reason` | string | (opcional) Motivo da rejeição |

---

## TRANSFER_CONFIRM

Confirma que os inventários foram atualizados após a troca. Enviado por **ambos os nós** após o TRADE_ACCEPT.

```json
{
  "type": "TRANSFER_CONFIRM",
  "trade_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "from_peer": "ALUNO-02",
  "gave": "FIG-02",
  "received": "FIG-07"
}
```

| Campo      | Tipo   | Descrição                      |
| ---------- | ------ | ------------------------------ |
| `gave`     | string | sticker_id que este nó cedeu   |
| `received` | string | sticker_id que este nó recebeu |

**Comportamento ao receber:** registrar no histórico de trocas. A atualização de inventário já deve ter ocorrido localmente ao enviar esta mensagem.

---

## Fluxo completo de troca

```
ALUNO-02                          ALUNO-05
    |                                 |
    |--- SEARCH (FIG-07) ------------>|
    |<-- SEARCH_HIT (FIG-07) ---------|
    |                                 |
    |--- TRADE_OFFER ---------------->|
    |    offer: FIG-02, want: FIG-07  |
    |                                 |
    |<-- TRADE_ACCEPT ----------------|
    |                                 |
    | [ambos atualizam inventários]   |
    |                                 |
    |--- TRANSFER_CONFIRM ----------->|
    |<-- TRANSFER_CONFIRM ------------|
```
