// Vercel Edge Function — Webhook do Mercado Pago
// Recebe notificações de pagamento, consulta o status real no MP
// e atualiza o pedido correspondente no Firestore para "pago".
//
// Fluxo:
// 1. MP envia POST com {type:'payment', data:{id}} (ou query ?topic=payment&id=)
// 2. Consultamos o pagamento na API do MP usando MP_ACCESS_TOKEN
// 3. Se approved, achamos o pedido no Firestore (por mpPaymentId, senão por
//    external_reference=uid + status aguardando) e marcamos como "pago".
//
// Sempre responde 200 rapidamente para o MP não reenviar em loop.

export const config = { runtime: 'edge' };

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'academicofacil-87df6';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const keyQS = FIREBASE_API_KEY ? `?key=${FIREBASE_API_KEY}` : '';

// Extrai o ID do pagamento de diferentes formatos de notificação do MP
function extrairPaymentId(req, body) {
  const url = new URL(req.url);
  const topic = url.searchParams.get('topic') || url.searchParams.get('type');
  const qid = url.searchParams.get('id') || url.searchParams.get('data.id');
  if ((topic === 'payment' || !topic) && qid) return qid;
  if (body) {
    if (body.type === 'payment' && body.data && body.data.id) return String(body.data.id);
    if (body.action && body.action.startsWith('payment') && body.data && body.data.id) return String(body.data.id);
    if (body.resource && /\/payments\//.test(body.resource)) {
      const m = body.resource.match(/payments\/(\d+)/);
      if (m) return m[1];
    }
    if (body.topic === 'payment' && body.id) return String(body.id);
  }
  return null;
}

// Consulta o pagamento real no Mercado Pago
async function consultarPagamento(paymentId) {
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
  });
  if (!resp.ok) return null;
  return await resp.json();
}

// Procura o pedido no Firestore por mpPaymentId
async function acharPedidoPorPaymentId(paymentId) {
  const resp = await fetch(`${FS_BASE}:runQuery${keyQS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: { fieldFilter: { field: { fieldPath: 'mpPaymentId' }, op: 'EQUAL', value: { stringValue: String(paymentId) } } },
        limit: 1
      }
    })
  });
  const rows = await resp.json();
  if (Array.isArray(rows)) {
    const r = rows.find(x => x.document);
    if (r) return r.document.name; // caminho completo do doc
  }
  return null;
}

// Fallback: acha o pedido mais recente do cliente (external_reference=uid)
// que ainda está aguardando pagamento/comprovante.
async function acharPedidoPorCliente(uid) {
  const resp = await fetch(`${FS_BASE}:runQuery${keyQS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'clientId' }, op: 'EQUAL', value: { stringValue: uid } } },
              { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [
                { stringValue: 'aguardando_pagamento' },
                { stringValue: 'aguardando_comprovante' }
              ] } } } }
            ]
          }
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 1
      }
    })
  });
  const rows = await resp.json();
  if (Array.isArray(rows)) {
    const r = rows.find(x => x.document);
    if (r) return r.document.name;
  }
  return null;
}

// Atualiza o status do pedido para "pago"
async function marcarComoPago(docName, paymentId) {
  // docName é o caminho completo: projects/.../documents/orders/{id}
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=status&updateMask.fieldPaths=etapa&updateMask.fieldPaths=mpPaymentId&updateMask.fieldPaths=pagoEm${FIREBASE_API_KEY ? '&key=' + FIREBASE_API_KEY : ''}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        status: { stringValue: 'pago' },
        etapa: { stringValue: 'producao' },
        mpPaymentId: { stringValue: String(paymentId) },
        pagoEm: { timestampValue: new Date().toISOString() }
      }
    })
  });
  return resp.ok;
}

export default async function handler(req) {
  // MP pode mandar GET (validação) ou POST (evento). Sempre 200.
  let body = null;
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { body = null; }
  }

  const ok200 = () => new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });

  try {
    if (!MP_ACCESS_TOKEN) return ok200();

    const paymentId = extrairPaymentId(req, body);
    if (!paymentId) return ok200(); // notificação de outro tipo (merchant_order etc.)

    const pgto = await consultarPagamento(paymentId);
    if (!pgto || pgto.status !== 'approved') return ok200(); // só age em pagamento aprovado

    // 1) Tenta achar pelo payment_id já gravado no pedido (caso Pix)
    let docName = await acharPedidoPorPaymentId(paymentId);

    // 2) Fallback pelo cliente (external_reference = uid)
    if (!docName && pgto.external_reference) {
      docName = await acharPedidoPorCliente(pgto.external_reference);
    }

    if (!docName) return ok200(); // nada para atualizar

    await marcarComoPago(docName, paymentId);
    return ok200();
  } catch (e) {
    // Nunca retorna erro para o MP — evita reenvios em loop
    return ok200();
  }
}
