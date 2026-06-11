// /api/ia-academica.js
// Agente IA Acadêmico — AcadêmicoFácil
// Claude Sonnet integrado com autenticação Firebase e salvamento no Firestore

export const config = { runtime: 'edge' };

// ============ PROMPT MESTRE ============
const PROMPT_MESTRE = `Você é a IA Acadêmica do AcadêmicoFácil, um agente especialista em produção acadêmica assistida.

MISSÃO: Orientar, estruturar, revisar e gerar documentos acadêmicos originais com qualidade de banca, ABNT, referências reais, linguagem formal e coerência metodológica.

PRINCÍPIOS INEGOCIÁVEIS:
1. Nunca inventar referências, DOI, autores, periódicos, normas, leis ou dados
2. Nunca prometer aprovação, nota ou resultado garantido
3. Sempre trabalhar por etapas: diagnosticar → planejar → produzir → revisar → entregar
4. Sempre adaptar ao nível: técnico, graduação, pós, MBA, mestrado, doutorado
5. Sempre sinalizar lacunas, riscos e dados que precisam de confirmação
6. Sempre usar linguagem acadêmica, humana e sem aparência mecânica
7. Nunca gerar trabalho completo sem antes validar o diagnóstico

RUBRICA NOTA 9+ (bloqueie entrega se qualquer critério < 80%):
- Aderência ao enunciado/orientador: 15 pontos
- Problema, objetivos e justificativa: 15 pontos
- Metodologia: 15 pontos
- Fundamentação teórica: 15 pontos
- Argumentação e análise crítica: 15 pontos
- ABNT e estrutura formal: 10 pontos
- Linguagem acadêmica: 10 pontos
- Originalidade e acabamento: 5 pontos
TOTAL: 100 pontos — mínimo 90 para liberar entrega

NORMAS: ABNT NBR 14724:2024, NBR 6023:2018, NBR 10520:2023, NBR 6028:2021. Manual institucional prevalece.

FORMATO DE SAÍDA — sempre retorne JSON válido:
{
  "agent": "ia_academica",
  "stage": "diagnostico|plano|capitulo|revisao|finalizacao",
  "summary": "Resumo breve da resposta",
  "content": "Texto acadêmico produzido ou análise completa",
  "pending_questions": ["pergunta 1", "pergunta 2"],
  "risks": ["risco 1", "risco 2"],
  "quality_score": {
    "overall": 0,
    "criteria": [
      {"name": "criterio", "score": 0, "comment": "observação"}
    ]
  },
  "next_action": "Próxima ação recomendada ao admin"
}`;

// ============ VERIFICAR TOKEN FIREBASE ============
async function verificarToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) return { uid: 'dev', email: process.env.ADMIN_EMAIL || '' };
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

// ============ SANITIZAR INPUT ============
function sanitize(v) {
  return String(v || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .trim()
    .slice(0, 20000);
}

// ============ MONTAR MENSAGEM DO USUÁRIO ============
function montarMensagem(body) {
  const { action, order, section, instructions, agentName } = body;
  const nome = agentName ? `\n\nNome do agente escolhido pelo cliente: "${sanitize(agentName)}"` : '';
  
  const pedido = order ? `
DADOS DO PEDIDO:
- Tipo: ${sanitize(order.serviceType || '')}
- Nível: ${sanitize(order.academicLevel || '')}
- Curso: ${sanitize(order.course || '')}
- Instituição: ${sanitize(order.institution || '')}
- Tema: ${sanitize(order.theme || '')}
- Laudas: ${order.pages || 0}
- Prazo: ${sanitize(order.deadline || '')}
- Requisitos: ${sanitize(order.requirements || '')}` : '';

  const instrucoes = instructions ? `\nINSTRUÇÕES ADICIONAIS: ${sanitize(instructions)}` : '';
  const secao = section ? `\nSEÇÃO SOLICITADA: ${sanitize(section)}` : '';

  return `AÇÃO SOLICITADA: ${sanitize(action)}${nome}${pedido}${secao}${instrucoes}

Retorne APENAS JSON válido conforme o formato especificado no prompt mestre.`;
}

// ============ SALVAR NO FIRESTORE ============
async function salvarNoFirestore(orderId, uid, resultado) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'academicofacil-87df6';
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey || !orderId) return;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${orderId}/ai_outputs`;
    await fetch(url + `?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          stage:       { stringValue: resultado.stage || '' },
          summary:     { stringValue: resultado.summary || '' },
          content:     { stringValue: resultado.content || '' },
          qualityScore:{ integerValue: resultado.quality_score?.overall || 0 },
          risks:       { stringValue: JSON.stringify(resultado.risks || []) },
          pendingQ:    { stringValue: JSON.stringify(resultado.pending_questions || []) },
          nextAction:  { stringValue: resultado.next_action || '' },
          createdBy:   { stringValue: 'ia_academica' },
          uid:         { stringValue: uid }
        }
      })
    });
  } catch (e) { console.error('Firestore save error:', e); }
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

  // Autenticação
  const user = await verificarToken(req.headers.get('Authorization'));
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Não autorizado' }), { status: 401 });
  }

  // Body
  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Body inválido' }), { status: 400 }); }

  const { orderId, action, agentName } = body;
  if (!action) {
    return new Response(JSON.stringify({ ok: false, error: '"action" é obrigatório' }), { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return new Response(JSON.stringify({ ok: false, error: 'IA não configurada' }), { status: 503 });
  }

  // Chamar Claude
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
        max_tokens: 4096,
        system: PROMPT_MESTRE,
        messages: [{ role: 'user', content: montarMensagem(body) }]
      })
    });

    const claudeData = await claudeResp.json();

    if (!claudeResp.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Erro na IA', details: claudeData }), { status: 502 });
    }

    const rawText = claudeData.content?.[0]?.text || '{}';

    // Parse JSON — remove possível ```json wrapper
    let resultado;
    try {
      const clean = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      resultado = JSON.parse(clean);
    } catch {
      // Se não for JSON válido, encapsula como content
      resultado = {
        agent: 'ia_academica',
        stage: action,
        summary: 'Resposta gerada',
        content: rawText,
        pending_questions: [],
        risks: [],
        quality_score: { overall: 0, criteria: [] },
        next_action: 'Revisar resposta no painel admin'
      };
    }

    // Nome personalizado do agente
    if (agentName) resultado.agent_name = sanitize(agentName);

    // Salvar no Firestore
    if (orderId) await salvarNoFirestore(orderId, user.uid, resultado);

    return new Response(JSON.stringify({ ok: true, ...resultado }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://academicofacil.com.br'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro interno', message: err.message }), { status: 500 });
  }
}
