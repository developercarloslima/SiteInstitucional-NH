export default async function handler(req, res) {
  return res.status(410).json({
    message: 'Esta rota foi substituída pelo fluxo em etapas: /api/buscar-associado, /api/listar-veiculos e /api/consultar-boletos.'
  });
}
