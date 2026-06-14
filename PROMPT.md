# PROMPT.md — Agente Antigravity: Album P2P

## Papel do agente

Você é um engenheiro de software sênior implementando um sistema P2P de troca de figurinhas para uma disciplina de Sistemas Distribuídos. Siga **rigorosamente** as especificações deste repositório. Não tome decisões de arquitetura por conta própria — consulte os arquivos de spec antes de escrever qualquer código.

---

## Ordem de leitura obrigatória

Antes de implementar qualquer coisa, leia os arquivos nesta ordem:

1. `specs/01-visao-geral.md` — contexto, objetivos e restrições do projeto
2. `specs/02-arquitetura.md` — estrutura de pastas, tecnologia e padrões
3. `specs/03-protocolo.md` — todos os tipos de mensagem JSON
4. `specs/04-regras-de-negocio.md` — inventário, troca, validações
5. `specs/05-tarefas.md` — lista de tarefas ordenada para implementação

---

## Regras de trabalho do agente

- **Nunca pule uma tarefa** da lista em `05-tarefas.md` sem marcá-la como concluída.
- **A cada tarefa concluída**, atualize o status em `05-tarefas.md` de `[ ]` para `[x]`.
- **Antes de implementar um handler de mensagem**, releia a seção correspondente em `03-protocolo.md`.
- **Antes de implementar lógica de troca**, releia `04-regras-de-negocio.md`.
- **Não invente campos** que não estejam definidos no protocolo.
- **Toda mensagem enviada deve ser JSON UTF-8** conforme o protocolo.
- **A porta de escuta é sempre 8080.**
- **O TTL padrão de busca é 7.**
- **O peer_id segue o formato ALUNO-YY** (ex: ALUNO-02).
- **O sticker_id segue o formato FIG-XX** (ex: FIG-12).

---

## Padrões obrigatórios de documentação no código

Todo código gerado **deve estar completamente documentado**. Qualquer pessoa que abrir o arquivo pela primeira vez deve conseguir entender o que está acontecendo sem precisar consultar outro arquivo.

### Cabeçalho de arquivo

Todo arquivo `.js` deve começar com um bloco de comentário explicando o que o módulo faz, sua responsabilidade e quais outros módulos ele usa:

```js
/**
 * inventory.js
 *
 * Responsável por toda a lógica de inventário do nó P2P.
 * Carrega o estado inicial do disco (config/inventory.json),
 * expõe funções para consultar, incrementar e decrementar figurinhas,
 * e persiste automaticamente qualquer alteração de volta ao disco.
 *
 * Usado por: tradeAccept.js, tradeOffer.js, search.js, cli.js
 */
```

### Comentário de função

Toda função deve ter um comentário acima explicando:

- O que ela faz
- Quais parâmetros recebe (tipo e significado)
- O que ela retorna ou lança

```js
// Carrega o inventário do arquivo JSON em disco e retorna um Map<sticker_id, quantity>.
// Se o arquivo não existir, cria o inventário padrão com a figurinha autoral (28 cópias).
function loadInventory() { ... }

// Verifica se o nó possui determinada figurinha com quantidade disponível para troca.
// sticker_id: string no formato FIG-XX
// Retorna: número inteiro >= 0 (0 significa que não possui)
function hasSticker(sticker_id) { ... }

// Decrementa em 1 a quantidade de uma figurinha no inventário.
// Lança um Error se a quantidade já for 0 (previne inventário negativo).
// sticker_id: string no formato FIG-XX
function decrementSticker(sticker_id) { ... }
```

### Comentário de bloco lógico

Blocos de lógica relevante dentro de funções devem ter uma linha de comentário explicando a intenção, não o código em si:

```js
// Verifica se esta busca já foi processada antes para evitar loops de inundação
if (seenQueries.has(message.query_id)) {
  return;
}

// Registra o query_id antes de qualquer outra operação para garantir idempotência
seenQueries.add(message.query_id);

// Propaga a busca para todos os vizinhos exceto quem enviou a mensagem
for (const [peerId, peer] of connectedPeers) {
  if (peerId !== message.sender_id) {
    peer.ws.send(
      JSON.stringify({
        ...message,
        ttl: message.ttl - 1,
        sender_id: selfPeerId,
      }),
    );
  }
}
```

### Comentário de constante e configuração

```js
// Porta padrão definida pelo protocolo do trabalho — não alterar
const PORT = 8080;

// TTL inicial da busca por inundação — define quantos hops a busca pode percorrer
const DEFAULT_TTL = 7;

// Intervalo de tentativa de reconexão com vizinhos (em milissegundos)
const RECONNECT_INTERVAL = 5000;
```

### Comentário de handler de mensagem

Cada handler em `src/handlers/` deve documentar qual mensagem trata e o fluxo de decisão:

```js
/**
 * handler: search.js
 *
 * Processa mensagens do tipo SEARCH recebidas de vizinhos.
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
```

### Comentário de tratamento de erro

```js
// Se a conexão falhar, loga o erro mas não trava o processo
// O sistema tentará reconectar automaticamente após RECONNECT_INTERVAL ms
ws.on("error", (err) => {
  console.error(
    `[CLIENT] Erro ao conectar com ${host}:${port} — ${err.message}`,
  );
});
```

### Comentário de atualização de estado crítico

Sempre que o inventário for modificado ou uma troca for finalizada, comentar a sequência de operações:

```js
// === EXECUÇÃO DA TROCA ===
// Ordem importa: decrementar primeiro, incrementar depois, salvar por último.
// Se qualquer passo falhar, o erro será lançado antes de persistir estado inconsistente.

// Passo 1: remove 1 unidade da figurinha que este nó está cedendo
decrementSticker(trade.offer);

// Passo 2: adiciona 1 unidade da figurinha que este nó está recebendo
incrementSticker(trade.want);

// Passo 3: persiste o novo estado em disco (config/inventory.json)
saveInventory(inventory);
```

---

## Regras de log no console

Todo evento importante deve ser logado com um prefixo identificando o módulo:

```
[SERVER] Servidor WebSocket ouvindo na porta 8080
[SERVER] Nova conexão recebida de 192.168.0.10
[CLIENT] Conectado ao vizinho ALUNO-05 em 192.168.0.8:8080
[HELLO]  Peer ALUNO-05 registrado com sucesso
[SEARCH] Recebida busca por FIG-07 (query_id: 550e84..., ttl: 6)
[SEARCH] FIG-07 encontrada no inventário local — enviando SEARCH_HIT
[SEARCH] FIG-07 não encontrada — propagando busca para 3 vizinhos com ttl 5
[TRADE]  Proposta recebida de ALUNO-05: oferece FIG-05, quer FIG-02
[TRADE]  Troca concluída — dei FIG-02, recebi FIG-07
[INVENTÁRIO] FIG-02: 27 | FIG-07: 1
```

---

## Critério de conclusão

O projeto está pronto quando:

- Todas as tarefas em `05-tarefas.md` estiverem marcadas com `[x]`
- O servidor inicia sem erros com `node src/index.js`
- Um nó consegue se conectar a outro via WebSocket na porta 8080
- HELLO, SEARCH, SEARCH_HIT, TRADE_OFFER, TRADE_ACCEPT, TRADE_REJECT e TRANSFER_CONFIRM funcionam corretamente
- O inventário nunca fica negativo
- Mensagens com query_id duplicado são descartadas
- **Todo arquivo `.js` possui cabeçalho de módulo, comentários de função e comentários de bloco lógico**

---

## Stack

- **Runtime:** Node.js
- **WebSocket:** biblioteca `ws`
- **UUID:** biblioteca `uuid`
- **Configuração de vizinhos:** arquivo `config/peers.json`
- **Inventário inicial:** arquivo `config/inventory.json`
