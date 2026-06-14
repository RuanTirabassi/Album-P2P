# 01 — Visão Geral

## Objetivo

Implementar um nó de uma rede P2P não estruturada para troca de figurinhas digitais entre alunos. Cada nó representa um aluno, possui uma figurinha autoral e pode buscar, oferecer e aceitar trocas com outros nós da rede.

## Contexto acadêmico

- Disciplina: Sistemas Distribuídos
- Primeira etapa: descoberta por **inundação (flooding)**
- Interoperabilidade entre grupos é obrigatória — todos seguem o mesmo protocolo

## Restrições absolutas

| Item                | Valor obrigatório                         |
| ------------------- | ----------------------------------------- |
| Arquitetura         | P2P não estruturada, sem servidor central |
| Transporte          | WebSocket                                 |
| Formato de mensagem | JSON UTF-8                                |
| Porta de escuta     | 8080                                      |
| peer_id             | ALUNO-YY (ex: ALUNO-02)                   |
| sticker_id          | FIG-XX (ex: FIG-12)                       |
| TTL padrão de busca | 7                                         |
| query_id            | UUID v4 gerado aleatoriamente             |

## O que o sistema deve suportar

1. **Cadastrar figurinha autoral** — cada nó inicia com 28 cópias lógicas da própria figurinha
2. **Consultar inventário** — listar figurinhas que o nó possui e suas quantidades
3. **Buscar figurinha na rede** — por inundação, com TTL e supressão de duplicatas
4. **Realizar troca** — protocolo de oferta → aceite/rejeição → confirmação de inventário

## Escopo fora desta etapa

- Descoberta automática de vizinhos (Kademlia, DHT etc.)
- Interface gráfica (terminal/CLI é suficiente)
- Persistência em banco de dados (arquivos JSON são suficientes)
