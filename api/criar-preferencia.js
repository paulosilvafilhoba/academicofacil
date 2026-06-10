// Vercel Edge Function — cria preferência de pagamento no Mercado Pago
// O Access Token fica APENAS aqui, no servidor. Nunca vai para o browser.

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Lê o token da variável de ambiente (configurada no Vercel Dashboard)
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Token não configurado' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Lê os dados do pedido enviados pelo browser
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { servico, valor, email, uid } = body;

  // Valida os campos obrigatórios
  if (!servico || !valor || !email) {
    return new Response(JSON.stringify({ error: 'Dados incompletos' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Chama a API do Mercado Pago com o token seguro
  try {
    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        items: [{
          title: servico,
          quantity: 1,
          unit_price: Number(valor),
          currency_id: 'BRL'
        }],
        payer: { email },
        back_urls: {
          success: 'https://academicofacil.com.br/dashboard?status=success',
          failure: 'https://academicofacil.com.br/dashboard?status=failure',
          pending: 'https://academicofacil.com.br/dashboard?status=pending'
        },
        auto_return: 'approved',
        statement_descriptor: 'ACADEMICOFACIL',
        external_reference: uid || ''
      })
    });

    const data = await mpResp.json();

    if (!mpResp.ok) {
      return new Response(JSON.stringify({ error: 'Erro no Mercado Pago', details: data }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Retorna só o link de pagamento para o browser — nunca o token
    return new Response(JSON.stringify({ init_point: data.init_point }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://academicofacil.com.br'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
