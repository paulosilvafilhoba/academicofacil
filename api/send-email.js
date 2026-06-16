export default async function handler(req, res) {
  return res.status(200).json({
    status: 'API do AcadêmicoFácil funcionando',
    metodo: req.method
  });
}
