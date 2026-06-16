export default async function handler(req, res) {

  try {

    const response = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'AcadêmicoFácil <contato@academicofacil.com.br>',
          to: ['paulosilvafilhoba@gmail.com'],
          subject: 'Teste Resend AcadêmicoFácil',
          html: '<h1>Resend funcionando!</h1>'
        })
      }
    );

    const data = await response.json();

    return res.status(200).json(data);

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }

}
