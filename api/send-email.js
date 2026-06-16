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

  try {
    const { nome, email, telefone, mensagem } = req.body || {};

    if (!nome || !email || !mensagem) {
      return res.status(400).json({
        error: 'Nome, e-mail e mensagem são obrigatórios.'
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        error: 'RESEND_API_KEY não configurada na Vercel.'
      });
    }

    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
        to: ['paulosilvafilhoba@gmail.com'],
        reply_to: email,
        subject: `Novo contato - ${nome}`,
        html: `
          <h2>Novo contato pelo AcadêmicoFácil</h2>
          <p><strong>Nome:</strong> ${nome}</p>
          <p><strong>E-mail:</strong> ${email}</p>
          <p><strong>Telefone:</strong> ${telefone || 'Não informado'}</p>
          <p><strong>Mensagem:</strong></p>
          <p>${mensagem}</p>
        `
      })
    });

    const data = await resposta.json();

    if (!resposta.ok) {
      return res.status(500).json({
        error: data.message || 'Erro ao enviar pelo Resend.',
        detalhe: data
      });
    }

    return res.status(200).json({
      success: true,
      message: 'E-mail enviado com sucesso.',
      data
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Erro interno na função.',
      detalhe: error.message
    });
  }
}
