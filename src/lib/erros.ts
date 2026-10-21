// Erro de regra de negócio lançado dentro das transações (provoca o rollback)
export class ErroNegocio extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function respostaErro(error: unknown) {
  if (error instanceof ErroNegocio) {
    return { status: error.status, corpo: { erro: error.message } }
  }
  return { status: 400, corpo: { erro: String(error) } }
}
