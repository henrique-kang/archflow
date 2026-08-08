import type { Doc } from './yaml'

/**
 * Diagrama de exemplo — fictício, só para demonstrar a ferramenta.
 *
 * Uma plataforma de pedidos genérica que exercita TODOS os recursos:
 * - raias aninhadas, dobras manuais, pesos de aresta (Redis rápido, antifraude lento)
 * - fluxos com VARIANTES por condição: Pagamento (gateway A/B por flag buscada do
 *   Postgres), Notificação (e-mail/SMS por enum local), Retry (reenfileira/descarta)
 * - variáveis {{interpoladas}} em rótulos e payloads (ex.: recibos_{{ambiente}})
 * - inspetor de pacote (transformações, payload antes/depois, notas de hop)
 * - cenários prontos, incluindo falha (Gateway A fora) e Black Friday
 * - modo automático: clicar no Web App cascateia o sistema inteiro
 */
export function seedDoc(): Doc {
  return {
    version: 1,
    name: 'Plataforma de Pedidos — exemplo',
    variables: {
      pedido: '#1042',
      ambiente: 'prd',
      cliente: 'ACME Ltda',
    },
    groups: [
      { id: 'g_clientes', label: 'Clientes', color: '#5fb8c9', pos: { x: 40, y: 160 }, size: { w: 220, h: 420 } },
      { id: 'g_plataforma', label: 'Plataforma', color: '#6ea8dc', pos: { x: 320, y: 60 }, size: { w: 1180, h: 760 } },
      { id: 'g_api', label: 'API', color: '#a78bdf', parent: 'g_plataforma', pos: { x: 20, y: 48 }, size: { w: 250, h: 660 } },
      { id: 'g_msg', label: 'Mensageria', color: '#d873a8', parent: 'g_plataforma', pos: { x: 300, y: 48 }, size: { w: 280, h: 660 } },
      { id: 'g_proc', label: 'Processamento', color: '#e0985a', parent: 'g_plataforma', pos: { x: 610, y: 48 }, size: { w: 280, h: 660 } },
      { id: 'g_dados', label: 'Dados', color: '#7fb069', parent: 'g_plataforma', pos: { x: 920, y: 48 }, size: { w: 240, h: 660 } },
      { id: 'g_externos', label: 'Externos', color: '#9aa5b5', pos: { x: 1540, y: 100 }, size: { w: 260, h: 580 } },
    ],
    nodes: [
      { id: 'web_app', label: 'Web App', type: 'client', group: 'g_clientes', pos: { x: 16, y: 90 }, tech: 'React + Vite', owner: 'time web' },
      { id: 'mobile_app', label: 'App Mobile', type: 'client', group: 'g_clientes', pos: { x: 16, y: 240 }, tech: 'React Native' },

      {
        id: 'api_gw',
        label: 'API Gateway',
        type: 'gateway',
        group: 'g_api',
        pos: { x: 16, y: 120 },
        transform: 'Autentica, valida o schema e publica o pedido na fila',
        payloadBefore: 'POST /pedidos\n{"itens": 3, "total": 189.90}',
        payloadAfter: '{"pedido": "{{pedido}}", "cliente": "{{cliente}}",\n "itens": 3, "total": 189.90, "ts": "…"}',
        tech: 'Kong',
        owner: 'plataforma',
      },
      {
        id: 'auth',
        label: 'Auth',
        type: 'service',
        group: 'g_api',
        pos: { x: 16, y: 340 },
        transform: 'Valida o token JWT e devolve os escopos',
        tech: 'Keycloak',
      },

      { id: 'q_pedidos', label: 'pedidos_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 60 } },
      { id: 'q_pagamentos', label: 'pagamentos_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 160 } },
      { id: 'q_notificacoes', label: 'notificacoes_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 260 } },
      { id: 'topic_eventos', label: 'pedido_eventos_topic', type: 'queue', icon: 'sns', group: 'g_msg', pos: { x: 16, y: 360 } },
      { id: 'q_estoque', label: 'estoque_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 460 } },
      { id: 'q_dlq', label: 'pagamentos_dlq', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 560 } },

      {
        id: 'w_pedido',
        label: 'Worker Pedido',
        type: 'function',
        group: 'g_proc',
        pos: { x: 16, y: 60 },
        transform: 'Grava o pedido {{pedido}}, reserva estoque e solicita cobrança',
      },
      {
        id: 'w_pagamento',
        label: 'Worker Pagamento',
        type: 'function',
        group: 'g_proc',
        pos: { x: 16, y: 160 },
        transform: 'Consulta a config no Postgres, escolhe o gateway e autoriza',
        vars: { usa_gateway_b: { value: false, source: 'db' } },
        tech: 'Node 22',
        owner: 'time de pagamentos',
      },
      {
        id: 'w_notificacao',
        label: 'Worker Notificação',
        type: 'function',
        group: 'g_proc',
        pos: { x: 16, y: 260 },
        transform: 'Monta a mensagem do pedido {{pedido}} e envia pelo canal configurado',
        vars: { canal: { value: 'email' } },
        payloadBefore: '{"evento": "pagamento_aprovado",\n "pedido": "{{pedido}}"}',
        payloadAfter: '{"para": "{{cliente}}", "canal": "email|sms",\n "template": "pedido_confirmado"}',
      },
      {
        id: 'webhook',
        label: 'Webhook Pagamentos',
        type: 'service',
        icon: 'webhook',
        group: 'g_proc',
        pos: { x: 16, y: 360 },
        transform: 'Recebe o callback do gateway e publica o evento',
      },
      {
        id: 'svc_estoque',
        label: 'Serviço Estoque',
        type: 'service',
        group: 'g_proc',
        pos: { x: 16, y: 460 },
        transform: 'Reserva os itens e dá baixa no saldo',
        owner: 'time de logística',
      },
      {
        id: 'w_retry',
        label: 'Worker Retry',
        type: 'function',
        group: 'g_proc',
        pos: { x: 16, y: 560 },
        transform: 'Decide entre reenfileirar a cobrança ou descartar e alertar',
        vars: { descarta_apos_3x: { value: false } },
      },

      { id: 'redis', label: 'Redis', type: 'storage', group: 'g_dados', pos: { x: 16, y: 80 }, tech: 'ElastiCache', transform: 'Cache de sessões e catálogo' },
      { id: 'db', label: 'Postgres', type: 'storage', group: 'g_dados', pos: { x: 16, y: 260 }, tech: 'RDS', transform: 'Pedidos, estoque e a config de pagamentos' },
      { id: 'bucket', label: 'recibos_{{ambiente}}', type: 'storage', icon: 's3', group: 'g_dados', pos: { x: 16, y: 440 } },

      { id: 'pay_gateway', label: 'Gateway A', type: 'external', group: 'g_externos', pos: { x: 16, y: 40 }, tech: 'REST' },
      { id: 'pay_gateway_b', label: 'Gateway B', type: 'external', group: 'g_externos', pos: { x: 16, y: 150 }, tech: 'REST' },
      { id: 'antifraude', label: 'Antifraude', type: 'external', group: 'g_externos', pos: { x: 16, y: 260 } },
      { id: 'email', label: 'Provedor de E-mail', type: 'external', group: 'g_externos', pos: { x: 16, y: 370 } },
      { id: 'sms', label: 'Gateway SMS', type: 'external', group: 'g_externos', pos: { x: 16, y: 480 } },
    ],
    edges: [
      // entrada e sessão
      { id: 'e_web', from: 'web_app', to: 'api_gw', fromSide: 'r', toSide: 'l', label: 'HTTPS' },
      { id: 'e_mob', from: 'mobile_app', to: 'api_gw', fromSide: 'r', toSide: 'l', label: 'HTTPS' },
      { id: 'e_auth', from: 'api_gw', to: 'auth', fromSide: 'b', toSide: 't', label: 'valida token', dashed: true, note: 'cache de 5 min por token' },
      { id: 'e_redis', from: 'api_gw', to: 'redis', fromSide: 'r', toSide: 'l', label: 'sessão (cache)', weight: 0.5, note: 'p95 de 3ms — o hop mais rápido da casa', waypoints: [{ x: 1220, y: 254 }] },

      // pedido
      { id: 'e_pub', from: 'api_gw', to: 'q_pedidos', fromSide: 'r', toSide: 'l', label: 'publica pedido', note: 'idempotente por {{pedido}}' },
      { id: 'e_cons1', from: 'q_pedidos', to: 'w_pedido', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true, note: 'long-polling 20s; lote de até 10' },
      { id: 'e_db', from: 'w_pedido', to: 'db', fromSide: 'r', toSide: 'l', label: 'grava pedido' },

      // estoque
      { id: 'e_estq_pub', from: 'w_pedido', to: 'q_estoque', fromSide: 'l', toSide: 'r', label: 'reserva estoque', dashed: true },
      { id: 'e_estq_cons', from: 'q_estoque', to: 'svc_estoque', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true },
      { id: 'e_estq_db', from: 'svc_estoque', to: 'db', fromSide: 'r', toSide: 'l', label: 'baixa saldo' },

      // pagamento — variantes A/B pela flag buscada do Postgres
      { id: 'e_pag', from: 'w_pedido', to: 'q_pagamentos', fromSide: 'l', toSide: 'r', label: 'solicita cobrança', dashed: true },
      { id: 'e_cons2', from: 'q_pagamentos', to: 'w_pagamento', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true },
      { id: 'e_fraude', from: 'w_pagamento', to: 'antifraude', fromSide: 'r', toSide: 'l', label: 'score (REST)', weight: 2, note: 'p95 de 800ms — o hop mais lento do fluxo', waypoints: [{ x: 1516, y: 294 }] },
      { id: 'e_pay', from: 'w_pagamento', to: 'pay_gateway', fromSide: 'r', toSide: 'l', label: 'autoriza (REST)', waypoints: [{ x: 1510, y: 294 }], when: { var: 'usa_gateway_b', equals: false } },
      { id: 'e_pay_b', from: 'w_pagamento', to: 'pay_gateway_b', fromSide: 'r', toSide: 'l', label: 'autoriza (REST)', waypoints: [{ x: 1524, y: 294 }], when: { var: 'usa_gateway_b', equals: true } },
      { id: 'e_recibo', from: 'w_pagamento', to: 'bucket', fromSide: 'r', toSide: 'l', label: 'recibo (PDF)' },
      // callbacks voltam pelo corredor entre Plataforma e Externos
      { id: 'e_callback', from: 'pay_gateway', to: 'webhook', fromSide: 'l', toSide: 'r', label: 'callback (HTTPS)', weight: 1.5, waypoints: [{ x: 1510, y: 494 }] },
      { id: 'e_callback_b', from: 'pay_gateway_b', to: 'webhook', fromSide: 'l', toSide: 'r', label: 'callback (HTTPS)', weight: 1.5, waypoints: [{ x: 1524, y: 512 }, { x: 1210, y: 512 }] },
      { id: 'e_evt', from: 'webhook', to: 'topic_eventos', fromSide: 'l', toSide: 'r', label: 'publica evento' },

      // notificação — variantes e-mail/SMS pelo canal configurado no worker
      { id: 'e_fanout', from: 'topic_eventos', to: 'q_notificacoes', fromSide: 'l', toSide: 'l', label: 'fanout', dashed: true, note: 'SNS → SQS; entrega pelo menos uma vez', waypoints: [{ x: 600, y: 444 }] },
      { id: 'e_cons3', from: 'q_notificacoes', to: 'w_notificacao', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true },
      { id: 'e_email', from: 'w_notificacao', to: 'email', fromSide: 'r', toSide: 'l', label: 'envia e-mail', when: { var: 'canal', equals: 'email' }, waypoints: [{ x: 1220, y: 440 }, { x: 1510, y: 440 }] },
      { id: 'e_sms', from: 'w_notificacao', to: 'sms', fromSide: 'r', toSide: 'l', label: 'envia SMS', when: { var: 'canal', equals: 'sms' }, waypoints: [{ x: 1228, y: 452 }, { x: 1518, y: 452 }] },

      // falha e reprocesso — variantes reenfileira/descarta
      { id: 'e_dlq', from: 'w_pagamento', to: 'q_dlq', fromSide: 'l', toSide: 'r', label: 'falha (DLQ)', dashed: true },
      { id: 'e_retry', from: 'q_dlq', to: 'w_retry', fromSide: 'r', toSide: 'l', label: 'reprocessa', dashed: true, note: 'backoff exponencial; máx. 3 tentativas' },
      { id: 'e_requeue', from: 'w_retry', to: 'q_pagamentos', fromSide: 'b', toSide: 'l', label: 'reenfileira', dashed: true, when: { var: 'descarta_apos_3x', equals: false }, waypoints: [{ x: 1006, y: 840 }, { x: 606, y: 840 }, { x: 606, y: 294 }] },
      { id: 'e_alerta', from: 'w_retry', to: 'email', fromSide: 'r', toSide: 'l', label: 'alerta o time', when: { var: 'descarta_apos_3x', equals: true }, waypoints: [{ x: 1502, y: 694 }] },
    ],
    flows: [
      {
        id: 'f_login',
        name: 'Login',
        color: '#26c6da',
        edges: ['e_web', 'e_auth', 'e_redis'],
        payload: '{"cliente": "{{cliente}}", "escopos": ["pedidos:rw"]}',
      },
      {
        id: 'f_checkout',
        name: 'Checkout',
        color: '#2e7d32',
        edges: ['e_web', 'e_auth', 'e_pub', 'e_cons1', 'e_db'],
        payload: '{"pedido": "{{pedido}}", "cliente": "{{cliente}}",\n "itens": 3, "total": 189.90}',
      },
      {
        id: 'f_estoque',
        name: 'Reserva de Estoque',
        color: '#d4e157',
        edges: ['e_estq_pub', 'e_estq_cons', 'e_estq_db'],
        payload: '{"pedido": "{{pedido}}", "itens": [{"sku": "AB-12", "qtd": 2}]}',
      },
      {
        // carrega os DOIS ramos (A e B): a config escolhe qual variante flui
        id: 'f_pagamento',
        name: 'Pagamento',
        color: '#1565c0',
        edges: ['e_pag', 'e_cons2', 'e_fraude', 'e_pay', 'e_pay_b', 'e_callback', 'e_callback_b', 'e_evt', 'e_recibo'],
        payload: '{"pedido": "{{pedido}}", "valor": 189.90,\n "moeda": "BRL"}',
      },
      {
        // variantes e-mail/SMS pelo canal do Worker Notificação
        id: 'f_notificacao',
        name: 'Notificação',
        color: '#6a1b9a',
        edges: ['e_fanout', 'e_cons3', 'e_email', 'e_sms'],
        payload: '{"pedido": "{{pedido}}", "para": "{{cliente}}"}',
      },
      {
        // variantes reenfileira/descarta pela flag do Worker Retry
        id: 'f_retry',
        name: 'Retry / DLQ',
        color: '#e65100',
        edges: ['e_dlq', 'e_retry', 'e_requeue', 'e_alerta'],
      },
    ],
    scenarios: [
      {
        id: 'sc_padrao',
        name: 'Padrão (A · e-mail · reenfileira)',
        variables: { pedido: '#1042', ambiente: 'prd', cliente: 'ACME Ltda' },
        nodeVars: {
          w_pagamento: { usa_gateway_b: false },
          w_notificacao: { canal: 'email' },
          w_retry: { descarta_apos_3x: false },
        },
        down: [],
      },
      {
        id: 'sc_contingencia',
        name: 'Contingência — Gateway A fora',
        variables: { pedido: '#1042', ambiente: 'prd', cliente: 'ACME Ltda' },
        nodeVars: {
          w_pagamento: { usa_gateway_b: true },
          w_notificacao: { canal: 'email' },
          w_retry: { descarta_apos_3x: false },
        },
        down: ['pay_gateway'],
      },
      {
        id: 'sc_sms',
        name: 'Notificação por SMS',
        variables: { pedido: '#1042', ambiente: 'prd', cliente: 'ACME Ltda' },
        nodeVars: {
          w_pagamento: { usa_gateway_b: false },
          w_notificacao: { canal: 'sms' },
          w_retry: { descarta_apos_3x: false },
        },
        down: [],
      },
      {
        id: 'sc_blackfriday',
        name: 'Black Friday (SMS · descarta na DLQ)',
        variables: { pedido: '#9999', ambiente: 'black-friday', cliente: 'ACME Ltda' },
        nodeVars: {
          w_pagamento: { usa_gateway_b: false },
          w_notificacao: { canal: 'sms' },
          w_retry: { descarta_apos_3x: true },
        },
        down: [],
      },
    ],
  }
}
