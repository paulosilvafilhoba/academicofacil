// /api/ia-academica.js
// Agente IA Acadêmico — AcadêmicoFácil
// v2.0 — lê pedido do Firestore, valida dono, salva outputs

export const config = { runtime: 'edge' };

const ADMIN_EMAIL = 'paulosilvafilhoba@gmail.com';

// ============ PROMPT MESTRE ============
const PROMPT_MESTRE = `Você é a IA Acadêmica do AcadêmicoFácil, especialista em produção acadêmica assistida.

MISSÃO: Orientar, estruturar, revisar e gerar documentos acadêmicos originais com qualidade de banca, ABNT, referências reais, linguagem formal e coerência metodológica.

PRINCÍPIOS INEGOCIÁVEIS:
1. Nunca inventar referências, DOI, autores, periódicos, normas, leis ou dados
2. Nunca prometer aprovação, nota ou resultado garantido
3. Sempre trabalhar por etapas: diagnosticar → planejar → produzir → revisar → entregar
4. Sempre adaptar ao nível: técnico, graduação, pós, MBA, mestrado, doutorado
5. Sempre sinalizar lacunas, riscos e dados que precisam de confirmação
6. Sempre usar linguagem acadêmica, humana e sem aparência mecânica
7. Nunca gerar trabalho completo sem antes validar o diagnóstico

RUBRICA NOTA 9+ (score mínimo 90/100 para liberar entrega):
- Aderência ao enunciado/orientador: 15 pts
- Problema, objetivos e justificativa: 15 pts
- Metodologia: 15 pts
- Fundamentação teórica: 15 pts
- Argumentação e análise crítica: 15 pts
- ABNT e estrutura formal: 10 pts
- Linguagem acadêmica: 10 pts
- Originalidade e acabamento: 5 pts

NORMAS: ABNT NBR 14724:2024, NBR 6023:2018, NBR 10520:2023, NBR 6028:2021. Manual institucional prevalece.

FORMATO DE SAÍDA — sempre JSON válido:
{
  "agent": "ia_academica",
  "stage": "diagnostico|plano|capitulo|revisao|finalizacao",
  "summary": "Resumo breve da resposta",
  "content": "Texto acadêmico produzido ou análise completa",
  "pending_questions": ["pergunta 1"],
  "risks": ["risco 1"],
  "quality_score": {
    "overall": 0,
    "criteria": [{"name": "criterio", "score": 0, "comment": "observação"}]
  },
  "next_action": "Próxima ação recomendada"
}`;

// ============ SANITIZAR ============
function sanitize(v) {
  return String(v || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .trim()
    .slice(0, 20000);
}

// ============ VERIFICAR TOKEN FIREBASE ============
async function verificarToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) return { uid: 'dev', email: ADMIN_EMAIL };
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    const d = await r.json();
    if (!r.ok || !d.users?.[0]) return null;
    return { uid: d.users[0].localId, email: d.users[0].email };
  } catch { return null; }
}

// ============ LER PEDIDO DO FIRESTORE ============
async function lerPedido(orderId) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'academicofacil-87df6';
  const apiKey    = process.env.FIREBASE_API_KEY;
  if (!apiKey || !orderId) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${orderId}?key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const doc = await r.json();
    if (!doc.fields) return null;
    // Converter campos Firestore para objeto simples
    const get = (field) => {
      const f = doc.fields[field];
      if (!f) return '';
      return f.stringValue ?? f.integerValue ?? f.doubleValue ?? f.booleanValue ?? '';
    };
    return {
      clientId:    get('clientId') || get('userId'),
      serviceType: get('serviceType') || get('tipo'),
      course:      get('course')   || get('curso'),
      institution: get('institution') || get('instituicao'),
      theme:       get('theme')    || get('tema'),
      pages:       get('pages')    || get('laudas'),
      deadline:    get('deadline') || get('prazo'),
      requirements:get('requirements') || get('requisitos') || get('descricao'),
      academicLevel: get('academicLevel') || get('nivel'),
      status:      get('status'),
    };
  } catch(e) {
    console.error('Erro ao ler pedido:', e);
    return null;
  }
}

// ============ SALVAR OUTPUT NO FIRESTORE ============
async function salvarNoFirestore(orderId, uid, resultado) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'academicofacil-87df6';
  const apiKey    = process.env.FIREBASE_API_KEY;
  if (!apiKey || !orderId) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${orderId}/ai_outputs?key=${apiKey}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          stage:        { stringValue: resultado.stage || '' },
          summary:      { stringValue: resultado.summary || '' },
          content:      { stringValue: resultado.content || '' },
          qualityScore: { integerValue: resultado.quality_score?.overall || 0 },
          risks:        { stringValue: JSON.stringify(resultado.risks || []) },
          pendingQ:     { stringValue: JSON.stringify(resultado.pending_questions || []) },
          nextAction:   { stringValue: resultado.next_action || '' },
          createdBy:    { stringValue: 'ia_academica' },
          uid:          { stringValue: uid }
        }
      })
    });
  } catch(e) { console.error('Erro ao salvar output:', e); }
}

// ============ MONTAR PROMPT COM DADOS REAIS DO PEDIDO ============
function montarContextoPedido(order) {
  if (!order) return '';
  const tipoMap = {
    'tecnico':'TCC de Curso Técnico', 'graduacao':'TCC de Graduação',
    'pos':'Pós-Graduação/MBA', 'artigo':'Artigo Científico',
    'formatacao':'Formatação ABNT', 'revisao':'Revisão Acadêmica'
  };
  return `
DADOS REAIS DO PEDIDO:
- Tipo de trabalho: ${tipoMap[order.serviceType] || order.serviceType || 'não informado'}
- Nível acadêmico:  ${order.academicLevel || 'não informado'}
- Curso:            ${order.course || 'não informado'}
- Instituição:      ${order.institution || 'não informado'}
- Tema/título:      ${order.theme || 'não definido'}
- Quantidade:       ${order.pages || '?'} laudas
- Prazo:            ${order.deadline || 'normal'}
- Requisitos:       ${order.requirements || 'nenhum requisito específico'}
- Status atual:     ${order.status || 'novo'}`;
}

// ============ HANDLER PRINCIPAL ============
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://academicofacil.com.br',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método não permitido' }), { status: 405 });
  }

  // 1. Autenticação
  const user = await verificarToken(req.headers.get('Authorization'));
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Não autorizado' }), { status: 401 });
  }

  // 2. Body
  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 }); }

  const { orderId, action, agentName, agentType, mensagem, historico, section, instructions } = body;
  if (!action) {
    return new Response(JSON.stringify({ ok: false, error: '"action" é obrigatório' }), { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return new Response(JSON.stringify({ ok: false, error: 'IA não configurada' }), { status: 503 });
  }

  // 3. Carregar dados reais do pedido (se orderId fornecido)
  let orderData = body.order || null;
  if (orderId) {
    const firestoreOrder = await lerPedido(orderId);
    if (firestoreOrder) {
      // Validar que o pedido pertence ao usuário (ou é admin)
      const isAdmin = user.email === ADMIN_EMAIL;
      if (!isAdmin && firestoreOrder.clientId && firestoreOrder.clientId !== user.uid) {
        return new Response(JSON.stringify({ ok: false, error: 'Acesso negado a este pedido' }), { status: 403 });
      }
      orderData = firestoreOrder;
    }
  }

  // 4. Montar prompt e mensagens
  const isModoConversa = action === 'conversa' && mensagem;

  let systemPrompt;
  let messages;

  if (isModoConversa) {
    // MODO CHAT — conversa multi-turn com contexto do pedido
    const tipo = agentType || 'edu';
    const nomeAgente = sanitize(agentName || 'IA Acadêmica');
    const base = tipo === 'corp'
      ? `Você é ${nomeAgente}, assistente corporativo do AcadêmicoFácil.`
      : `Você é ${nomeAgente}, assistente acadêmico do AcadêmicoFácil especializado em TCC, artigos e monografias.`;

    systemPrompt = `${base}
${orderData ? montarContextoPedido(orderData) : ''}

REGRAS:
- Responda como ${nomeAgente}, nunca como "IA genérica"
- Seja objetivo e prático, use markdown básico
- Nunca invente referências ou dados
- Adapte o nível ao perfil do cliente
- Responda em português brasileiro`;

    const hist = Array.isArray(historico) ? historico.slice(-8) : [];
    messages = [
      ...hist.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: sanitize(h.content) })),
      { role: 'user', content: sanitize(mensagem) }
    ];

  } else {
    // MODO ACADÊMICO — JSON estruturado com rubrica
    const contexto = orderData ? montarContextoPedido(orderData) : '';
    const instrucoes = instructions ? `\nINSTRUÇÕES ESPECÍFICAS: ${sanitize(instructions)}` : '';
    const secao = section ? `\nSEÇÃO SOLICITADA: ${sanitize(section)}` : '';

    systemPrompt = PROMPT_MESTRE;
    messages = [{
      role: 'user',
      content: `AÇÃO SOLICITADA: ${sanitize(action)}${contexto}${secao}${instrucoes}\n\nRetorne APENAS JSON válido conforme o formato especificado.`
    }];
  }

  // 5. Chamar Claude
  try {
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: isModoConversa ? 1500 : 4096,
        system: systemPrompt,
        messages
      })
    });

    const claudeData = await claudeResp.json();

    if (!claudeResp.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Erro na IA', details: claudeData }), { status: 502 });
    }

    const rawText = claudeData.content?.[0]?.text || '';

    // 6. Processar resposta
    if (isModoConversa) {
      // Chat — retorna texto direto
      return new Response(JSON.stringify({
        ok: true,
        content: rawText,
        agent: 'ia_academica',
        stage: 'conversa',
        agent_name: sanitize(agentName || 'IA Acadêmica')
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://academicofacil.com.br' }
      });
    }

    // Acadêmico — parse JSON
    let resultado;
    try {
      const clean = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      resultado = JSON.parse(clean);
    } catch {
      resultado = {
        agent: 'ia_academica',
        stage: action,
        summary: 'Resposta gerada',
        content: rawText,
        pending_questions: [],
        risks: ['Resposta não estruturada — revisar manualmente'],
        quality_score: { overall: 0, criteria: [] },
        next_action: 'Revisar resposta no painel admin'
      };
    }

    if (agentName) resultado.agent_name = sanitize(agentName);

    // 7. Salvar no Firestore
    if (orderId) await salvarNoFirestore(orderId, user.uid, resultado);

    return new Response(JSON.stringify({ ok: true, ...resultado }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://academicofacil.com.br'
      }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Erro interno', message: err.message }),
      { status: 500 }
    );
  }
}
