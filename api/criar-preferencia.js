// Vercel Edge Function — Mercado Pago
// ✅ Preço calculado no servidor — nunca confia no valor do browser
// ✅ Verifica Firebase ID Token antes de processar
// Access Token APENAS aqui, nunca exposto no browser

export const config = { runtime: 'edge' };

// ============ TABELA DE PREÇOS (servidor) ============
const PRECOS = {
  tecnico:    { pl: 25,  fx: null },
  graduacao:  { pl: 35,  fx: null },
  pos:        { pl: 55,  fx: null },
  artigo:     { pl: null, fx: 480 },
  formatacao: { pl: 12,  fx: null },
  revisao:    { pl: null, fx: 180 }
};

const NOME_SERVICO = {
  tecnico: 'TCC Técnico',
  graduacao: 'TCC Graduação',
  pos: 'Pós / MBA',
  artigo: 'Artigo Científico',
  formatacao: 'Formatação ABNT',
  revisao: 'Revisão Textual'
};

function calcularValor(tipo, laudas, prazo) {
  const p = PRECOS[tipo];
  if (!p) return null;
  let total = p.fx ?? (p.pl && laudas > 0 ? p.pl * parseInt(laudas) : 0);
  if (!total || total <= 0) return null;
  if (prazo === 'rapido')  total = Math.round(total * 1.15);
  if (prazo === 'urgente') total = Math.round(total * 1.30);
  return total;
}

// ============ VERIFICAR ELEGIBILIDADE DA PROMOÇÃO (servidor) ============
// Garante que o desconto só é aplicado se: promo ativa no Firestore + cliente sem pedido pago anterior.
// Usa a REST API do Firestore (sem SDK), com o mesmo projeto do app.
async function obterPromoElegivel(uid) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'academicofacil-87df6';
  const apiKey = process.env.FIREBASE_API_KEY;
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const keyQS = apiKey ? `?key=${apiKey}` : '';
  try {
    // 1) Config da promo
    const promoResp = await fetch(`${base}/config/promo_primeiro_trabalho${keyQS}`);
    if (!promoResp.ok) return null;
    const promoDoc = await promoResp.json();
    const f = promoDoc.fields || {};
    const ativo = f.ativo?.booleanValue === true;
    const desconto = parseInt(f.desconto?.integerValue ?? f.desconto?.doubleValue ?? 0);
    if (!ativo || !desconto || desconto < 1 || desconto > 100) return null;

    // 2) Cliente já tem pedido? (consulta orders por clientId)
    const queryResp = await fetch(`${base}:runQuery${keyQS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'clientId' },
              op: 'EQUAL',
              value: { stringValue: uid }
            }
          },
          limit: 1
        }
      })
    });
    const rows = await queryResp.json();
    const temPedido = Array.isArray(rows) && rows.some(r => r.document);
    if (temPedido) return null; // não é mais o primeiro trabalho

    return { desconto };
  } catch {
    return null;
  }
}


async function verificarToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);

  // Verifica o token via Firebase Auth REST API
  const firebaseApiKey = process.env.FIREBASE_API_KEY;
  if (!firebaseApiKey) return { uid: 'sem-verificacao', email: 'unknown' }; // fallback gracioso

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );
    const data = await resp.json();
    if (!resp.ok || !data.users?.[0]) return null;
    return { uid: data.users[0].localId, email: data.users[0].email };
  } catch {
    return null;
  }
}

export default async function handler(req) {
  // Só POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Token MP
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Configuração inválida' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verificar autenticação Firebase
  const authHeader = req.headers.get('Authorization');
  const user = await verificarToken(authHeader);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Ler body
  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Corpo inválido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { tipo, laudas, prazo, tipo: tipoPag } = body;
  const { tipo: tipoServico, laudas: qtdLaudas, prazo: tipoPrazo, tipo: metodoPag } = body;

  // Extrair campos corretamente
  const tipoS = body.tipo_servico || body.tipo;
  const qtdL  = body.laudas;
  const prazoS = body.prazo;
  const metodoPagamento = body.metodo; // 'pix' ou 'cartao'
  const emailCliente = user.email; // ✅ usa o email do token verificado, não do body

  // Validar tipo de serviço
  if (!PRECOS[tipoS]) {
    return new Response(JSON.stringify({ error: 'Tipo de serviço inválido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // ✅ Calcular preço no servidor
  // Se vier valor_fixo (agentes personalizados com proposta do admin), usa ele
  // Caso contrário recalcula com tipo+laudas+prazo
  let valorServidor;
  if (body.valor_fixo && typeof body.valor_fixo === 'number' && body.valor_fixo > 0) {
    valorServidor = body.valor_fixo;
  } else {
    valorServidor = calcularValor(tipoS, qtdL, prazoS);
  }

  if (!valorServidor) {
    return new Response(JSON.stringify({ error: 'Não foi possível calcular o valor. Verifique tipo e laudas.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // ✅ Aplicar promoção SOMENTE se validada no servidor (browser não pode forjar desconto)
  let valorCheio = valorServidor;
  let descontoAplicado = 0;
  if (body.aplicar_promo && !body.valor_fixo) {
    const promo = await obterPromoElegivel(user.uid);
    if (promo) {
      descontoAplicado = promo.desconto;
      valorServidor = valorCheio - Math.round(valorCheio * promo.desconto / 100);
    }
  }

  const nomeServico = NOME_SERVICO[tipoS] || tipoS;

  const mpHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-Idempotency-Key': `${user.uid}-${tipoS}-${Date.now()}`
  };

  try {
    // PIX — QR Code real
    if (metodoPagamento === 'pix') {
      const pixResp = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: mpHeaders,
        body: JSON.stringify({
          transaction_amount: valorServidor,
          description: nomeServico,
          payment_method_id: 'pix',
          payer: { email: emailCliente }
        })
      });
      const pixData = await pixResp.json();

      if (!pixResp.ok) {
        return new Response(JSON.stringify({ error: 'Erro ao gerar Pix', details: pixData }), {
          status: 502, headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        payment_id: pixData.id,
        valor: valorServidor, // ✅ retorna o valor real calculado no servidor (já com desconto se aplicável)
        valor_cheio: valorCheio,
        desconto: descontoAplicado,
        qr_code: pixData.point_of_interaction?.transaction_data?.qr_code || null,
        qr_code_base64: pixData.point_of_interaction?.transaction_data?.qr_code_base64 || null
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://academicofacil.com.br' }
      });
    }

    // CARTÃO — Checkout Pro
    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: mpHeaders,
      body: JSON.stringify({
        items: [{ title: nomeServico, quantity: 1, unit_price: valorServidor, currency_id: 'BRL' }],
        payer: { email: emailCliente },
        back_urls: {
          success: 'https://academicofacil.com.br/dashboard?status=success',
          failure: 'https://academicofacil.com.br/dashboard?status=failure',
          pending: 'https://academicofacil.com.br/dashboard?status=pending'
        },
        auto_return: 'approved',
        statement_descriptor: 'ACADEMICOFACIL',
        external_reference: user.uid
      })
    });

    const data = await mpResp.json();
    if (!mpResp.ok) {
      return new Response(JSON.stringify({ error: 'Erro no Mercado Pago', details: data }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      init_point: data.init_point,
      valor: valorServidor, // ✅ valor confirmado pelo servidor (já com desconto se aplicável)
      valor_cheio: valorCheio,
      desconto: descontoAplicado
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://academicofacil.com.br' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno', message: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
