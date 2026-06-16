export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'API do AcadêmicoFácil funcionando',
      metodo: 'GET'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      error: 'RESEND_API_KEY não configurada na Vercel'
    });
  }

  try {
    const body = req.body || {};

    const nome = body.nome || 'Lead do site AcadêmicoFácil';
    const email = body.email || '';
    const telefone = body.telefone || 'Não informado';
    const mensagem = body.mensagem || '';
    const tipo = body.tipo || '';
    const laudas = body.laudas || '';
    const prazo = body.prazo || '';
    const valor = body.valor || '';

    if (!email) {
      return res.status(400).json({
        error: 'O campo e-mail é obrigatório.'
      });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2>Novo contato/orçamento pelo AcadêmicoFácil</h2>
        <p><strong>Nome:</strong> ${escapeHtml(nome)}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
        <p><strong>Telefone:</strong> ${escapeHtml(telefone)}</p>
        ${tipo ? `<p><strong>Tipo de trabalho:</strong> ${escapeHtml(tipo)}</p>` : ''}
        ${laudas ? `<p><strong>Laudas:</strong> ${escapeHtml(String(laudas))}</p>` : ''}
        ${prazo ? `<p><strong>Prazo:</strong> ${escapeHtml(prazo)}</p>` : ''}
        ${valor ? `<p><strong>Valor estimado:</strong> ${escapeHtml(valor)}</p>` : ''}
        ${mensagem ? `<p><strong>Mensagem:</strong></p><p>${escapeHtml(mensagem).replace(/\n/g, '<br>')}</p>` : ''}
        <hr>
        <p style="font-size:12px;color:#6b7280">Enviado automaticamente pelo site academicofacil.com.br</p>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
        to: ['paulosilvafilhoba@gmail.com'],
        reply_to: email,
        subject: `Novo orçamento pelo AcadêmicoFácil - ${nome}`,
        html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Erro ao enviar e-mail pelo Resend.',
        detalhe: data
      });
    }

    return res.status(200).json({
      success: true,
      message: 'E-mail enviado com sucesso.',
      id: data.id
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Erro interno na função.',
      detalhe: error.message
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
