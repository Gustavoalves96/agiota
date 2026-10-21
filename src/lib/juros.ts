import { Prisma } from "@prisma/client"

export const JUROS_FIXO = 20          // % cobrado uma única vez sobre o valor emprestado
export const JUROS_DIA_ATRASO = 1     // % do valor emprestado por dia após o vencimento

const UM_DIA = 24 * 60 * 60 * 1000

export function arredonda(valor: number) {
  return Math.round(valor * 100) / 100
}

export function calculaValorTotal(valor: number) {
  return arredonda(valor * (1 + JUROS_FIXO / 100))
}

export function diasDeAtraso(vencimento: Date, ate: Date) {
  const dias = Math.floor((ate.getTime() - vencimento.getTime()) / UM_DIA)
  return dias > 0 ? dias : 0
}

export function calculaJurosAtraso(valor: number, vencimento: Date, ate: Date) {
  return arredonda(valor * (JUROS_DIA_ATRASO / 100) * diasDeAtraso(vencimento, ate))
}

// Atualiza os juros de atraso de um empréstimo até a data informada.
// Deve ser chamada dentro de uma transação: altera o empréstimo e o saldo do cliente juntos.
export async function atualizaAtraso(tx: Prisma.TransactionClient, emprestimoId: number, ate = new Date()) {
  const emprestimo = await tx.emprestimo.findUniqueOrThrow({ where: { id: emprestimoId } })

  if (emprestimo.status === "QUITADO") {
    return emprestimo
  }

  const novoJuros = calculaJurosAtraso(Number(emprestimo.valor), emprestimo.vencimento, ate)
  const diferenca = arredonda(novoJuros - Number(emprestimo.jurosAtraso))

  if (diasDeAtraso(emprestimo.vencimento, ate) === 0 || diferenca <= 0) {
    return emprestimo
  }

  await tx.cliente.update({
    where: { id: emprestimo.clienteId },
    data: { saldoDevedor: { increment: diferenca } }
  })

  return tx.emprestimo.update({
    where: { id: emprestimoId },
    data: {
      jurosAtraso: novoJuros,
      valorTotal: { increment: diferenca },
      status: "ATRASADO"
    }
  })
}
