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

    const htmlInterno = `
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

    const htmlCliente = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2>Recebemos sua solicitação no AcadêmicoFácil</h2>
        <p>Olá!</p>
        <p>Recebemos sua solicitação de orçamento e nossa equipe entrará em contato em breve.</p>
        ${tipo ? `<p><strong>Tipo de trabalho:</strong> ${escapeHtml(tipo)}</p>` : ''}
        ${laudas ? `<p><strong>Laudas:</strong> ${escapeHtml(String(laudas))}</p>` : ''}
        ${prazo ? `<p><strong>Prazo:</strong> ${escapeHtml(prazo)}</p>` : ''}
        ${valor ? `<p><strong>Valor estimado:</strong> ${escapeHtml(valor)}</p>` : ''}
        <p>Atenciosamente,<br><strong>Equipe AcadêmicoFácil</strong></p>
        <hr>
        <p style="font-size:12px;color:#6b7280">Este é um e-mail automático enviado por academicofacil.com.br</p>
      </div>
    `;

    const headers = {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    };

    const responseInterno = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
        to: ['paulosilvafilhoba@gmail.com'],
        reply_to: email,
        subject: `Novo orçamento pelo AcadêmicoFácil - ${nome}`,
        html: htmlInterno
      })
    });

    const dataInterno = await responseInterno.json();

    if (!responseInterno.ok) {
      return res.status(responseInterno.status).json({
        error: dataInterno.message || 'Erro ao enviar e-mail interno pelo Resend.',
        detalhe: dataInterno
      });
    }

    const responseCliente = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
        to: [email],
        reply_to: 'contato@academicofacil.com.br',
        subject: 'Recebemos sua solicitação - AcadêmicoFácil',
        html: htmlCliente
      })
    });

    const dataCliente = await responseCliente.json();

    if (!responseCliente.ok) {
      return res.status(responseCliente.status).json({
        error: dataCliente.message || 'Erro ao enviar confirmação ao cliente pelo Resend.',
        detalhe: dataCliente,
        idInterno: dataInterno.id
      });
    }

    return res.status(200).json({
      success: true,
      message: 'E-mails enviados com sucesso.',
      idInterno: dataInterno.id,
      idCliente: dataCliente.id
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
