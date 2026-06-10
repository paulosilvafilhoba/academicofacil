// Vercel Edge Function — Mercado Pago
// Access Token APENAS no servidor, nunca exposto no browser

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Token não configurado' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Corpo inválido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { servico, valor, email, uid, tipo } = body;

  if (!servico || !valor || !email) {
    return new Response(JSON.stringify({ error: 'Dados incompletos' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-Idempotency-Key': `${uid || 'anon'}-${Date.now()}`
  };

  try {
    // Se tipo === 'pix', cria pagamento Pix real com QR Code
    if (tipo === 'pix') {
      const pixResp = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transaction_amount: Number(valor),
          description: servico,
          payment_method_id: 'pix',
          payer: { email }
        })
      });
      const pixData = await pixResp.json();

      if (!pixResp.ok) {
        return new Response(JSON.stringify({ error: 'Erro Pix MP', details: pixData }), {
          status: 502, headers: { 'Content-Type': 'application/json' }
        });
      }

      // Retorna QR Code base64 e código copia-e-cola
      return new Response(JSON.stringify({
        payment_id: pixData.id,
        status: pixData.status,
        qr_code: pixData.point_of_interaction?.transaction_data?.qr_code || null,
        qr_code_base64: pixData.point_of_interaction?.transaction_data?.qr_code_base64 || null
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://academicofacil.com.br'
        }
      });
    }

    // Padrão: Checkout Pro (cartão)
    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [{ title: servico, quantity: 1, unit_price: Number(valor), currency_id: 'BRL' }],
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
      return new Response(JSON.stringify({ error: 'Erro MP', details: data }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ init_point: data.init_point }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://academicofacil.com.br'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno', message: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
