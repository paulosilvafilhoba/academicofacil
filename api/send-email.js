export default async function handler(req, res) {
if (req.method === 'GET') {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
        to: ['paulosilvafilhoba@gmail.com'],
        subject: 'Teste GET Resend AcadêmicoFácil',
        html: '<h1>Envio GET funcionando!</h1><p>Agora o formulário pode ser integrado.</p>'
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
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
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
        to: ['paulosilvafilhoba@gmail.com'],
        subject: 'Novo orçamento pelo AcadêmicoFácil',
        html: '<h1>Teste de envio funcionando</h1><p>Integração Resend ativa.</p>'
      })
    });

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
