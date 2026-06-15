// Vercel Edge Function — Mercado Pago
// Compatível com orçamento público e dashboard antigo.
// Configure MP_ACCESS_TOKEN nas variáveis de ambiente da Vercel.

export const config = { runtime: 'edge' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

const precos = {
  tecnico: { nome: 'TCC Técnico', pl: 25 },
  graduacao: { nome: 'TCC Graduação', pl: 35 },
  pos: { nome: 'Pós / MBA', pl: 55 },
  artigo: { nome: 'Artigo Científico', fx: 480 },
  formatacao: { nome: 'Formatação ABNT', pl: 12 },
  revisao: { nome: 'Revisão Textual', fx: 180 }
};

function calcularValor(tipo, laudas, prazo) {
  const p = precos[tipo];
  if (!p) return 0;
  let valor = p.fx || (Number(laudas || 0) * p.pl);
  if (prazo === 'rapido') valor = Math.round(valor * 1.15);
  if (prazo === 'urgente') valor = Math.round(valor * 1.30);
  return valor;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return json({ error: 'Token MP_ACCESS_TOKEN não configurado' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Corpo inválido' }, 400); }

  const metodo = body.tipo || body.metodo || 'card';
  const tipoServico = body.tipo_servico || body.tipoServico || body.tipo;
  const valorCalculado = calcularValor(tipoServico, body.laudas, body.prazo);
  const valor = Number(body.valor || valorCalculado || 0);
  const servico = body.servico || (precos[tipoServico]?.nome || 'AcadêmicoFácil — Serviço acadêmico');
  const email = body.email || body.payer_email || 'cliente@academicofacil.com.br';
  const uid = body.uid || body.orderId || body.orcamentoId || '';

  if (!valor || valor <= 0) return json({ error: 'Valor inválido ou dados incompletos' }, 400);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-Idempotency-Key': `${uid || email}-${Date.now()}`
  };

  try {
    if (metodo === 'pix') {
      const pixResp = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transaction_amount: valor,
          description: servico,
          payment_method_id: 'pix',
          external_reference: uid,
          payer: { email }
        })
      });
      const pixData = await pixResp.json();
      if (!pixResp.ok) return json({ error: 'Erro Pix MP', details: pixData }, 502);
      return json({
        payment_id: pixData.id,
        status: pixData.status,
        valor,
        qr_code: pixData.point_of_interaction?.transaction_data?.qr_code || null,
        qr_code_base64: pixData.point_of_interaction?.transaction_data?.qr_code_base64 || null
      });
    }

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [{ title: servico, quantity: 1, unit_price: valor, currency_id: 'BRL' }],
        payer: { email },
        back_urls: {
          success: `https://academicofacil.com.br/admin-orcamentos?status=success&ref=${encodeURIComponent(uid)}`,
          failure: `https://academicofacil.com.br/orcamento?status=failure&ref=${encodeURIComponent(uid)}`,
          pending: `https://academicofacil.com.br/orcamento?status=pending&ref=${encodeURIComponent(uid)}`
        },
        auto_return: 'approved',
        statement_descriptor: 'ACADEMICOFACIL',
        external_reference: uid
      })
    });
    const data = await mpResp.json();
    if (!mpResp.ok) return json({ error: 'Erro MP', details: data }, 502);
    return json({ init_point: data.init_point, preference_id: data.id, valor });
  } catch (err) {
    return json({ error: 'Erro interno', message: err.message }, 500);
  }
}
