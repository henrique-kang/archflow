import type { Doc } from './yaml'

/**
 * Diagrama de exemplo — fictício, só para demonstrar a ferramenta.
 *
 * Uma plataforma de pedidos genérica: clientes entram pela API, os pedidos
 * viram mensagens, workers processam e falam com serviços externos. Foi
 * desenhado para exercitar tudo que o ArchFlow faz: raias aninhadas, dobras
 * manuais nas arestas, fluxos animados e o modo automático (as setas seguem o
 * sentido do dado, então clicar no "Web App" cascateia o sistema inteiro).
 */
export function seedDoc(): Doc {
  return {
    version: 1,
    name: 'Plataforma de Pedidos — exemplo',
    groups: [
      { id: 'g_clientes', label: 'Clientes', color: '#5fb8c9', pos: { x: 40, y: 160 }, size: { w: 220, h: 420 } },
      { id: 'g_plataforma', label: 'Plataforma', color: '#6ea8dc', pos: { x: 320, y: 60 }, size: { w: 1180, h: 760 } },
      { id: 'g_api', label: 'API', color: '#a78bdf', parent: 'g_plataforma', pos: { x: 20, y: 48 }, size: { w: 250, h: 660 } },
      { id: 'g_msg', label: 'Mensageria', color: '#d873a8', parent: 'g_plataforma', pos: { x: 300, y: 48 }, size: { w: 280, h: 660 } },
      { id: 'g_proc', label: 'Processamento', color: '#e0985a', parent: 'g_plataforma', pos: { x: 610, y: 48 }, size: { w: 280, h: 660 } },
      { id: 'g_dados', label: 'Dados', color: '#7fb069', parent: 'g_plataforma', pos: { x: 920, y: 48 }, size: { w: 240, h: 660 } },
      { id: 'g_externos', label: 'Externos', color: '#9aa5b5', pos: { x: 1540, y: 150 }, size: { w: 250, h: 420 } },
    ],
    nodes: [
      { id: 'web_app', label: 'Web App', type: 'client', group: 'g_clientes', pos: { x: 16, y: 90 } },
      { id: 'mobile_app', label: 'App Mobile', type: 'client', group: 'g_clientes', pos: { x: 16, y: 240 } },

      { id: 'api_gw', label: 'API Gateway', type: 'gateway', group: 'g_api', pos: { x: 16, y: 120 } },
      { id: 'auth', label: 'Auth', type: 'service', group: 'g_api', pos: { x: 16, y: 340 } },

      { id: 'q_pedidos', label: 'pedidos_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 70 } },
      { id: 'q_pagamentos', label: 'pagamentos_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 190 } },
      { id: 'q_notificacoes', label: 'notificacoes_queue', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 310 } },
      { id: 'topic_eventos', label: 'pedido_eventos_topic', type: 'queue', icon: 'sns', group: 'g_msg', pos: { x: 16, y: 430 } },
      { id: 'q_dlq', label: 'pagamentos_dlq', type: 'queue', icon: 'sqs', group: 'g_msg', pos: { x: 16, y: 550 } },

      { id: 'w_pedido', label: 'Worker Pedido', type: 'function', group: 'g_proc', pos: { x: 16, y: 70 } },
      { id: 'w_pagamento', label: 'Worker Pagamento', type: 'function', group: 'g_proc', pos: { x: 16, y: 190 } },
      { id: 'w_notificacao', label: 'Worker Notificação', type: 'function', group: 'g_proc', pos: { x: 16, y: 310 } },
      { id: 'webhook', label: 'Webhook Pagamentos', type: 'service', icon: 'webhook', group: 'g_proc', pos: { x: 16, y: 430 } },
      { id: 'w_retry', label: 'Worker Retry', type: 'function', group: 'g_proc', pos: { x: 16, y: 550 } },

      { id: 'db', label: 'Postgres', type: 'storage', group: 'g_dados', pos: { x: 16, y: 150 } },
      { id: 'bucket', label: 'recibos_bucket', type: 'storage', icon: 's3', group: 'g_dados', pos: { x: 16, y: 370 } },

      { id: 'pay_gateway', label: 'Gateway de Pagamento', type: 'external', group: 'g_externos', pos: { x: 16, y: 50 } },
      { id: 'antifraude', label: 'Antifraude', type: 'external', group: 'g_externos', pos: { x: 16, y: 190 } },
      { id: 'email', label: 'Provedor de E-mail', type: 'external', group: 'g_externos', pos: { x: 16, y: 330 } },
    ],
    edges: [
      // entrada
      { id: 'e_web', from: 'web_app', to: 'api_gw', fromSide: 'r', toSide: 'l', label: 'HTTPS' },
      { id: 'e_mob', from: 'mobile_app', to: 'api_gw', fromSide: 'r', toSide: 'l', label: 'HTTPS' },
      { id: 'e_auth', from: 'api_gw', to: 'auth', fromSide: 'b', toSide: 't', label: 'valida token', dashed: true },

      // pedido
      { id: 'e_pub', from: 'api_gw', to: 'q_pedidos', fromSide: 'r', toSide: 'l', label: 'publica pedido' },
      { id: 'e_cons1', from: 'q_pedidos', to: 'w_pedido', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true },
      { id: 'e_db', from: 'w_pedido', to: 'db', fromSide: 'r', toSide: 'l', label: 'grava pedido' },

      // pagamento
      { id: 'e_pag', from: 'w_pedido', to: 'q_pagamentos', fromSide: 'l', toSide: 'r', label: 'solicita cobrança', dashed: true },
      { id: 'e_cons2', from: 'q_pagamentos', to: 'w_pagamento', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true },
      { id: 'e_fraude', from: 'w_pagamento', to: 'antifraude', fromSide: 'r', toSide: 'l', label: 'score (REST)' },
      { id: 'e_pay', from: 'w_pagamento', to: 'pay_gateway', fromSide: 'r', toSide: 'l', label: 'autoriza (REST)', waypoints: [{ x: 1510, y: 322 }] },
      { id: 'e_recibo', from: 'w_pagamento', to: 'bucket', fromSide: 'r', toSide: 'l', label: 'recibo (PDF)' },
      // volta do gateway pelo corredor entre as raias, por baixo do diagrama
      { id: 'e_callback', from: 'pay_gateway', to: 'webhook', fromSide: 'l', toSide: 'r', label: 'callback (HTTPS)', waypoints: [{ x: 1524, y: 790 }, { x: 1170, y: 790 }] },
      { id: 'e_evt', from: 'webhook', to: 'topic_eventos', fromSide: 'l', toSide: 'r', label: 'publica evento' },

      // notificação
      { id: 'e_fanout', from: 'topic_eventos', to: 'q_notificacoes', fromSide: 'l', toSide: 'l', label: 'fanout', dashed: true, waypoints: [{ x: 600, y: 562 }, { x: 600, y: 442 }] },
      { id: 'e_cons3', from: 'q_notificacoes', to: 'w_notificacao', fromSide: 'r', toSide: 'l', label: 'consome', dashed: true },
      { id: 'e_email', from: 'w_notificacao', to: 'email', fromSide: 'r', toSide: 'l', label: 'envia e-mail', waypoints: [{ x: 1510, y: 442 }] },

      // falha e reprocesso
      { id: 'e_dlq', from: 'w_pagamento', to: 'q_dlq', fromSide: 'l', toSide: 'r', label: 'falha (DLQ)', dashed: true },
      { id: 'e_retry', from: 'q_dlq', to: 'w_retry', fromSide: 'r', toSide: 'l', label: 'reprocessa', dashed: true },
      { id: 'e_requeue', from: 'w_retry', to: 'q_pagamentos', fromSide: 'b', toSide: 'l', label: 'reenfileira', dashed: true, waypoints: [{ x: 1017, y: 790 }, { x: 610, y: 790 }, { x: 610, y: 322 }] },
    ],
    flows: [
      { id: 'f_checkout', name: 'Checkout', color: '#2e7d32', edges: ['e_web', 'e_auth', 'e_pub', 'e_cons1', 'e_db'] },
      { id: 'f_pagamento', name: 'Pagamento', color: '#1565c0', edges: ['e_pag', 'e_cons2', 'e_fraude', 'e_pay', 'e_callback', 'e_evt', 'e_recibo'] },
      { id: 'f_notificacao', name: 'Notificação', color: '#6a1b9a', edges: ['e_fanout', 'e_cons3', 'e_email'] },
      { id: 'f_retry', name: 'Retry / DLQ', color: '#e65100', edges: ['e_dlq', 'e_retry', 'e_requeue'] },
    ],
  }
}
