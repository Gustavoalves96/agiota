import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { ErroNegocio, respostaErro } from "../lib/erros"
import { arredonda, atualizaAtraso } from "../lib/juros"

const router = Router()

const pagamentoSchema = z.object({
  emprestimoId: z.number().int().positive(),
  valor: z.number().positive({ message: "Valor deve ser maior que zero" }),
  forma: z.enum(["PIX", "DINHEIRO"]),
  data: z.coerce.date().optional()
})

router.get("/", async (req, res) => {
  // #swagger.tags = ['Pagamentos']
  // #swagger.summary = 'Lista os pagamentos com empréstimo e cliente'
  try {
    const pagamentos = await prisma.pagamento.findMany({
      include: { emprestimo: { include: { cliente: true } } },
      orderBy: { id: "desc" }
    })
    res.status(200).json(pagamentos)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.post("/", async (req, res) => {
  /*
    #swagger.tags = ['Pagamentos']
    #swagger.summary = 'Registra um pagamento (transação)'
    #swagger.description = 'Atualiza os juros de atraso até a data do pagamento, cria o pagamento, abate o valor do saldo devedor do cliente e, se o total pago chegar ao valorTotal, muda o empréstimo para QUITADO.'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Pagamento" } } }
    }
  */
  const valida = pagamentoSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }
  const { emprestimoId, valor, forma } = valida.data
  const data = valida.data.data ?? new Date()

  try {
    const pagamento = await prisma.$transaction(async (tx) => {
      const existe = await tx.emprestimo.findUnique({ where: { id: emprestimoId } })
      if (!existe) throw new ErroNegocio(404, "Empréstimo não encontrado")
      if (existe.status === "QUITADO") throw new ErroNegocio(400, "Empréstimo já está quitado")

      // 1. juros de atraso (1% ao dia) até a data do pagamento
      const emprestimo = await atualizaAtraso(tx, emprestimoId, data)

      const pagos = await tx.pagamento.aggregate({ where: { emprestimoId }, _sum: { valor: true } })
      const totalPago = Number(pagos._sum.valor ?? 0)
      const restante = arredonda(Number(emprestimo.valorTotal) - totalPago)
      if (valor > restante) throw new ErroNegocio(400, `Valor maior que o restante da dívida (R$ ${restante.toFixed(2)})`)

      // 2. cria o pagamento
      const novo = await tx.pagamento.create({ data: { emprestimoId, valor, forma, data } })

      // 3. abate do saldo devedor do cliente
      await tx.cliente.update({
        where: { id: emprestimo.clienteId },
        data: { saldoDevedor: { decrement: valor } }
      })

      // 4. quita o empréstimo se pagou tudo
      if (arredonda(totalPago + valor) >= Number(emprestimo.valorTotal)) {
        await tx.emprestimo.update({ where: { id: emprestimoId }, data: { status: "QUITADO" } })
      }

      return novo
    })
    res.status(201).json(pagamento)
  } catch (error) {
    const { status, corpo } = respostaErro(error)
    res.status(status).json(corpo)
  }
})

router.delete("/:id", async (req, res) => {
  /*
    #swagger.tags = ['Pagamentos']
    #swagger.summary = 'Exclui (estorna) um pagamento (transação)'
    #swagger.description = 'Exclui o pagamento, devolve o valor ao saldo devedor do cliente e reabre o empréstimo (ABERTO, ou ATRASADO se já venceu).'
  */
  const id = Number(req.params.id)
  try {
    const pagamento = await prisma.$transaction(async (tx) => {
      const pagamento = await tx.pagamento.findUnique({ where: { id }, include: { emprestimo: true } })
      if (!pagamento) throw new ErroNegocio(404, "Pagamento não encontrado")

      await tx.pagamento.delete({ where: { id } })

      await tx.cliente.update({
        where: { id: pagamento.emprestimo.clienteId },
        data: { saldoDevedor: { increment: pagamento.valor } }
      })

      const vencido = pagamento.emprestimo.vencimento < new Date()
      await tx.emprestimo.update({
        where: { id: pagamento.emprestimoId },
        data: { status: vencido ? "ATRASADO" : "ABERTO" }
      })

      return pagamento
    })
    res.status(200).json(pagamento)
  } catch (error) {
    const { status, corpo } = respostaErro(error)
    res.status(status).json(corpo)
  }
})

export default router
