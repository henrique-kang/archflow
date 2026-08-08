# Proposta: configurações de envio e comportamento — 2026-08-07

Registro do brainstorm sobre enriquecer os eventos/animações com configuração (inspirado no
Packet Tracer).

> **Status (mesma data):** itens **1–5 do pacote prioritário e 7–8 da fila secundária
> implementados** — inspetor de pacote (payload por fluxo, transformação e antes/depois por nó,
> nota por hop, botão 👁 no transporte/apresentação, clique no pacote), variáveis com
> interpolação `{{nome}}`, config no nó com `source` (round-trip visual de consulta) + arestas
> condicionais `when` com chip `[var = valor]` e dormência, switch ao vivo (painel e menu de
> contexto), cenários nomeados (salvar/aplicar), estado fora do ar com ✕ persistente, peso de
> aresta e ficha técnica. **Item 6 (variantes de fluxo) também implementado**: um fluxo pode
> carregar os dois ramos de uma decisão; a config escolhe a variante que flui (hops dormentes
> com alternativa são pulados, continuações do ramo não escolhido saem por alcançabilidade, e
> hop dormente sem alternativa continua sendo barreira ⚠). Pendente: item 9 (modo replay).

## Princípio de fronteira (decidido na conversa)

Existem três níveis, e o ArchFlow fica **deliberadamente no nível 1**:

1. **Visual/declarativo** (o que somos): tudo que aparece foi declarado pelo usuário. A
   ferramenta nunca computa resultados — ela lê valores declarados e escolhe qual seta já
   desenhada animar. "Fantoche: o usuário escreve o roteiro, a ferramenta encena."
2. **Simulador** (não vamos): motor interno executando lógica sobre dados fictícios — payloads
   avaliados por regras (`se total > 1000 → FTP`), filas com semântica real, latências, falhas
   aleatórias. Não requer acesso externo (Packet Tracer nunca tocou num roteador real), mas
   explode a complexidade: modelo de payload, motor de regras, estado, tempo.
3. **Integração real** (cortado desde a spec original): credenciais AWS, SQS de verdade,
   consultas a banco, traces ao vivo.

Régua prática: comparar uma variável declarada com um valor (`envia_por_ftp == true`) é nível 1;
avaliar conteúdo de mensagem (`payload.total > 1000`) já é nível 2 — não fazemos.

---

## Pacote prioritário (ordem recomendada)

### 1. Inspetor de Pacote

A experiência Packet Tracer de "inspecionar o pacote em cada parada", 100% declarativa:

- **Payload de exemplo** anexado a um fluxo ou evento (snippet JSON, nome de documento).
  O pacote em trânsito vira clicável e abre o payload num card.
- **Transformação por nó**: cada nó declara o que faz com a mensagem ("valida token",
  "converte EDI→JSON"). No passo a passo, ao chegar no hop, aparece o card — opcionalmente com
  payload **antes/depois** (dois snippets estáticos escritos pelo usuário; nada executa).
- **Nota por hop**: texto rico por etapa ("timeout 30s, retry 3x, DLQ após 3 falhas") exibido
  na apresentação.

### 2. Variáveis do diagrama (interpolação)

Painel de variáveis (`ambiente: prd`, `pedido: "#1234"`) com interpolação `{{pedido}}` em
rótulos, payloads e notas. Trocar o valor atualiza o diagrama inteiro — apresentar o caso A e o
caso B vira trocar uma variável.

### 3. Config no nó + arestas condicionais (a ideia do worker com flag)

Um worker tem uma config (própria ou "buscada do banco") e o caminho muda conforme ela:

```yaml
nodes:
  - id: w_pedido
    vars: {envia_por_ftp: false}
edges:
  - id: e_rest
    from: w_pedido
    to: api_distribuidor
    when: {var: envia_por_ftp, equals: false}
  - id: e_ftp
    from: w_pedido
    to: ftp_distribuidor
    when: {var: envia_por_ftp, equals: true}
```

- No modo automático, ao chegar no nó, o evento segue **só** as setas cujo `when` casa com o
  valor declarado (setas sem `when` sempre disparam). Arestas condicionais mostram o rótulo
  `[envia_por_ftp = true]` e ficam esmaecidas quando dormentes.
- **Origem da variável**: `vars: {envia_por_ftp: {value: true, source: config_db}}` — quando
  `source` aponta para outro nó, a animação faz um round-trip visual (worker → banco → worker,
  pacotinho de consulta distinto) antes de ramificar. Puro teatro: o valor continua declarado,
  mas a plateia vê de onde a config vem na arquitetura real.
- **Switch ao vivo**: alternar a flag no card do nó (inclusive em apresentação), redisparar o
  evento e ver o outro caminho. É a demo matadora.
- Condição é só `variável = valor` (booleano/enum). Sem linguagem de expressão, sem olhar
  conteúdo de mensagem — é a fronteira do nível 1.

### 4. Cenários nomeados

Um cenário = conjunto nomeado de valores de variáveis ("Padrão", "Contingência FTP",
"Gateway fora"). Trocar de cenário no painel reconfigura todos os nós de uma vez. Persistem no
YAML junto do diagrama.

### 5. Estado do nó (cenário de falha)

Marcar um nó como *degradado/fora* num cenário → visual muda (vermelho, pulsando) e o evento
que chega nele morre ali (pacote vira ✕ e para, em vez de seguir). Para discussões de
resiliência: "se o gateway cair, o pedido para aqui — por isso existe a DLQ".

---

## Fila secundária

6. **Caminhos condicionais em fluxos manuais**: variantes de um fluxo ("sucesso" vs "falha")
   escolhidas na apresentação — sem avaliar nada, só escolher qual história contar.
7. **Duração relativa por aresta**: peso por hop (ex.: 3×) respeitado pela animação — gargalos
   visíveis sem métrica real. Barata; pode entrar de carona.
8. **Ficha técnica por nó**: tecnologia, SLA, owner, links de repo/runbook — card clicável na
   apresentação. Documentação viva, simulação zero.
9. **Modo replay** (a versão honesta do "dados reais"): importar um arquivo de trace exportado
   do sistema real (JSON simples; OTel um dia) e animar os eventos que de fato aconteceram.
   Nada de credenciais nem conexão — arquivo em disco. Forte para post-mortem de incidentes.

## Notas de implementação (quando for feito)

- Tudo persiste no YAML no formato legível de sempre; validar `vars`/`when` no import com o
  mesmo rigor hostil do resto (`yamlToDoc`).
- A decisão condicional entra em `pulseWavesFrom` (lib/graph.ts): filtrar as arestas de saída
  pelo `when` contra os `vars` do nó de origem; o round-trip visual do `source` é uma onda
  extra sintética antes da ramificação.
- Exemplo no seed: adicionar uma flag no "Worker Pagamento" (gateway A/B) ou no retry
  (reenfileira vs descarta) para o recurso ser demonstrável de fábrica — mantendo o seed
  fictício (nunca dados reais de projeto).
