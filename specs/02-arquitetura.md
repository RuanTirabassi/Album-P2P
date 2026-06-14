# 02 — Arquitetura

## Estrutura de pastas

```
Album P2P/
├── PROMPT.md                  ← instruções para o agente
├── specs/
│   ├── 01-visao-geral.md
│   ├── 02-arquitetura.md
│   ├── 03-protocolo.md
│   ├── 04-regras-de-negocio.md
│   └── 05-tarefas.md
├── config/
│   ├── peers.json             ← lista de vizinhos configuráveis
│   └── inventory.json         ← estado do inventário (lido/escrito em runtime)
├── src/
│   ├── index.js               ← entry point: inicia servidor WS + CLI
│   ├── server.js              ← WebSocket server (porta 8080)
│   ├── client.js              ← conexões de saída para vizinhos
│   ├── messageHandler.js      ← roteador de tipos de mensagem
│   ├── handlers/
│   │   ├── hello.js
│   │   ├── search.js
│   │   ├── searchHit.js
│   │   ├── searchMiss.js
│   │   ├── tradeOffer.js
│   │   ├── tradeAccept.js
│   │   ├── tradeReject.js
│   │   └── transferConfirm.js
│   ├── inventory.js           ← leitura, escrita e validação do inventário
│   ├── peers.js               ← gerenciamento de vizinhos conectados
│   └── cli.js                 ← interface de linha de comando
└── package.json
```

## Tecnologias

| Dependência | Uso                           |
| ----------- | ----------------------------- |
| `ws`        | WebSocket server e client     |
| `uuid`      | Geração de query_id (UUID v4) |
| `readline`  | Interface CLI no terminal     |

Instalar com: `npm install ws uuid`

## Modelo de execução

- Cada instância do processo representa **um nó** da rede P2P
- O nó escuta conexões entrantes na porta **8080**
- O nó também abre conexões de saída para os vizinhos configurados em `config/peers.json`
- Todas as mensagens trocadas são JSON codificado em UTF-8

## Configuração de vizinhos (`config/peers.json`)

```json
{
  "self": {
    "peer_id": "ALUNO-02",
    "sticker_id": "FIG-02",
    "sticker_url": "http://SEU-IP:8080/images/FIG-02.png"
  },
  "neighbors": [
    { "host": "192.168.0.10", "port": 8080 },
    { "host": "192.168.0.11", "port": 8080 }
  ]
}
```

> Substitua `ALUNO-02` e `FIG-02` pelo seu número na lista de chamada.

## Estado em memória

O nó mantém em memória durante a execução:

- `inventory` — Map de sticker_id → quantidade
- `neighbors` — Map de peer_id → conexão WebSocket ativa
- `seenQueries` — Set de query_id já processados (prevenção de duplicatas)
- `pendingTrades` — Map de trade_id → estado da negociação em andamento
