# Album-P2P — Sistema de Figurinhas P2P

Projeto da disciplina de **Sistemas Distribuídos** da UENP.

Implementa um nó de rede P2P não estruturada para troca de figurinhas digitais entre alunos. Cada nó representa um aluno, possui uma figurinha autoral e pode buscar, oferecer e aceitar trocas com outros nós da rede via WebSocket.

---

## Tecnologias

- **Runtime:** Node.js
- **Transporte:** WebSocket (`ws`)
- **Identificação única de buscas:** UUID v4 (`uuid`)
- **Interface:** CLI via terminal (`readline`) + Dashboard web

---

## Estrutura do projeto

```
Album-P2P/
├── PROMPT.md                  ← instruções do agente (spec-driven)
├── specs/                     ← especificações do projeto
│   ├── 01-visao-geral.md
│   ├── 02-arquitetura.md
│   ├── 03-protocolo.md
│   ├── 04-regras-de-negocio.md
│   └── 05-tarefas.md
├── config/
│   ├── peers.json             ← configuração do nó e vizinhos
│   └── inventory.json         ← estado do inventário (persiste em disco)
├── src/
│   ├── index.js               ← entry point
│   ├── server.js              ← WebSocket server (porta 8080)
│   ├── client.js              ← conexões de saída para vizinhos
│   ├── messageHandler.js      ← roteador de tipos de mensagem
│   ├── inventory.js           ← lógica de inventário
│   ├── peers.js               ← gerenciamento de vizinhos
│   ├── state.js               ← estado global compartilhado
│   ├── cli.js                 ← interface de linha de comando
│   ├── dashboard.js           ← servidor HTTP do dashboard (porta 3000)
│   └── handlers/
│       ├── hello.js
│       ├── search.js
│       ├── searchHit.js
│       ├── searchMiss.js
│       ├── tradeOffer.js
│       ├── tradeAccept.js
│       ├── tradeReject.js
│       └── transferConfirm.js
└── public/
    ├── index.html             ← dashboard visual (servido em :3000)
    └── images/                ← PNGs das figurinhas (FIG-XX.png)
```

---

## Instalação

```bash
# Clonar o repositório
git clone https://github.com/RuanTirabassi/Album-P2P.git
cd Album-P2P

# Instalar dependências
npm install
```

---

## Configuração

Edite o arquivo `config/peers.json` com as informações do seu nó:

```json
{
  "self": {
    "peer_id": "ALUNO-XX",
    "sticker_id": "FIG-XX",
    "sticker_url": "http://SEU-IP:3000/images/FIG-XX.png"
  },
  "neighbors": [
    { "host": "IP-DO-VIZINHO", "port": 8080 }
  ]
}
```

> Substitua `ALUNO-XX` e `FIG-XX` pelo seu número na lista de chamada.
>
> O `sticker_url` usa a porta **3000** (servidor HTTP/Express) que serve os arquivos estáticos de `public/images/`.

Coloque sua figurinha em `public/images/FIG-XX.png` para que ela apareça no dashboard e seja acessível aos outros nós.

---

## Execução

```bash
npm start
# ou
node src/index.js
```

Ao iniciar, dois serviços sobem simultaneamente:

| Serviço | Porta | Descrição |
|---------|-------|----------|
| WebSocket P2P | **8080** | Comunicação com outros nós e com o dashboard |
| Dashboard Web | **3000** | Interface visual — acesse `http://localhost:3000` |

---

## Dashboard Web

Abra `http://localhost:3000` no navegador para visualizar em tempo real:

- Status da conexão WebSocket
- Seu `peer_id` e `sticker_id`
- Inventário com imagem real de cada figurinha
- Vizinhos conectados
- Busca P2P por inundação diretamente pela interface
- Histórico de trocas realizadas

---

## Comandos da CLI

Após iniciar o nó, os seguintes comandos estão disponíveis no terminal:

| Comando | Descrição |
|---------|----------|
| `inventario` | Lista as figurinhas possuídas e quantidades |
| `buscar FIG-XX` | Inicia busca por inundação na rede |
| `trocar FIG-XX com ALUNO-YY` | Envia proposta de troca para um peer |
| `vizinhos` | Lista os peers conectados |
| `historico` | Exibe histórico de trocas realizadas |
| `ajuda` | Lista todos os comandos disponíveis |

---

## Protocolo de mensagens

Todas as mensagens são JSON UTF-8 trocadas via WebSocket na porta **8080**.

| Tipo | Descrição |
|------|----------|
| `HELLO` | Anuncia presença ao se conectar a um vizinho |
| `SEARCH` | Busca figurinha por inundação (TTL padrão: 7) |
| `SEARCH_HIT` | Resposta positiva — figurinha encontrada |
| `SEARCH_MISS` | Resposta opcional — figurinha não encontrada |
| `TRADE_OFFER` | Propõe uma troca entre dois nós |
| `TRADE_ACCEPT` | Aceita a proposta de troca |
| `TRADE_REJECT` | Rejeita a proposta de troca |
| `TRANSFER_CONFIRM` | Confirma atualização de inventário após troca |

Documentação completa do protocolo em [`specs/03-protocolo.md`](./specs/03-protocolo.md).

---

## Padrões obrigatórios

| Item | Valor |
|------|-------|
| Arquitetura | P2P não estruturada, sem servidor central |
| Transporte | WebSocket |
| Formato | JSON UTF-8 |
| Porta P2P | 8080 |
| Porta Dashboard | 3000 |
| peer_id | `ALUNO-YY` |
| sticker_id | `FIG-XX` |
| TTL de busca | 7 |
| query_id | UUID v4 aleatório |

---

## Autor

Ruan Tirabassi — Ciência da Computação, UENP
