import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { ErroNegocio, respostaErro } from "../lib/erros"
import { atualizaAtraso, calculaValorTotal, JUROS_FIXO } from "../lib/juros"

const router = Router()

const emprestimoSchema = z.object({
  clienteId: z.number().int().positive(),
  cobradorId: z.number().int().positive(),
  valor: z.number().positive({ message: "Valor deve ser maior que zero" }),
  vencimento: z.coerce.date(),
  data: z.coerce.date().optional()
})

router.get("/", async (req, res) => {
  // #swagger.tags = ['Empréstimos']
  // #swagger.summary = 'Lista os empréstimos com cliente e cobrador'
  try {
    const emprestimos = await prisma.emprestimo.findMany({
      include: { cliente: true, cobrador: true },
      orderBy: { id: "desc" }
    })
    res.status(200).json(emprestimos)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.get("/:id", async (req, res) => {
  // #swagger.tags = ['Empréstimos']
  // #swagger.summary = 'Exibe um empréstimo com seus pagamentos'
  const id = Number(req.params.id)
  try {
    const emprestimo = await prisma.emprestimo.findUnique({
      where: { id },
      include: { cliente: true, cobrador: true, pagamentos: true }
    })
    if (!emprestimo) {
      res.status(404).json({ erro: "Empréstimo não encontrado" })
      return
    }
    res.status(200).json(emprestimo)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.post("/", async (req, res) => {
  /*
    #swagger.tags = ['Empréstimos']
    #swagger.summary = 'Registra um empréstimo (transação)'
    #swagger.description = 'Registra um novo empréstimo para o cliente, numa única transação:<br>
      1. Cria o empréstimo calculando <b>valorTotal = valor × 1,20</b> (juros fixos de 20%).<br>
      2. Soma o valorTotal ao <b>saldoDevedor</b> do cliente.<br><br>
      Após o vencimento, cada dia sem quitar acrescenta <b>1% do valor emprestado</b> (juros simples),
      cobrado no próximo pagamento ou extrato. Ex.: R$ 1.000 → R$ 1.200 no vencimento; com 10 dias de atraso, R$ 1.300.<br><br>
      O cobrador precisa estar ativo e o vencimento deve ser posterior à data do empréstimo.
      O campo <i>data</i> é opcional (padrão: data atual).'
    #swagger.requestBody = {
      required: true,
      description: 'Dados do empréstimo',
      content: { "application/json": { schema: { $ref: "#/components/schemas/Emprestimo" } } }
    }
    #swagger.responses[201] = {
      description: 'Empréstimo registrado e saldo devedor do cliente atualizado.',
      schema: {
        id: 1, clienteId: 1, cobradorId: 1, valor: '1000', juros: '20', jurosAtraso: '0',
        valorTotal: '1200', data: '2026-10-21T00:00:00.000Z', vencimento: '2026-11-21T00:00:00.000Z', status: 'ABERTO'
      }
    }
    #swagger.responses[400] = { description: 'Dados inválidos, cobrador inativo ou vencimento anterior à data.' }
    #swagger.responses[404] = { description: 'Cliente ou cobrador não encontrado.' }
  */
  const valida = emprestimoSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }
  const { clienteId, cobradorId, valor, vencimento } = valida.data
  const data = valida.data.data ?? new Date()

  try {
    const emprestimo = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } })
      if (!cliente) throw new ErroNegocio(404, "Cliente não encontrado")

      const cobrador = await tx.cobrador.findUnique({ where: { id: cobradorId } })
      if (!cobrador) throw new ErroNegocio(404, "Cobrador não encontrado")
      if (!cobrador.ativo) throw new ErroNegocio(400, "Cobrador inativo")

      if (vencimento <= data) throw new ErroNegocio(400, "Vencimento deve ser posterior à data do empréstimo")

      const valorTotal = calculaValorTotal(valor)

      const novo = await tx.emprestimo.create({
        data: { clienteId, cobradorId, valor, juros: JUROS_FIXO, valorTotal, data, vencimento }
      })

      await tx.cliente.update({
        where: { id: clienteId },
        data: { saldoDevedor: { increment: valorTotal } }
      })

      // empréstimo lançado com data retroativa já pode estar em atraso
      return atualizaAtraso(tx, novo.id)
    })
    res.status(201).json(emprestimo)
  } catch (error) {
    const { status, corpo } = respostaErro(error)
    res.status(status).json(corpo)
  }
})

router.post("/atualizar-atrasos", async (req, res) => {
  // #swagger.tags = ['Empréstimos']
  // #swagger.summary = 'Recalcula os juros de atraso (1% ao dia) de todos os empréstimos não quitados'
  try {
    const atualizados = await prisma.$transaction(async (tx) => {
      const pendentes = await tx.emprestimo.findMany({ where: { status: { not: "QUITADO" } } })
      const lista = []
      for (const e of pendentes) {
        lista.push(await atualizaAtraso(tx, e.id))
      }
      return lista.filter(e => e.status === "ATRASADO")
    })
    res.status(200).json(atualizados)
  } catch (error) {
    const { status, corpo } = respostaErro(error)
    res.status(status).json(corpo)
  }
})

router.delete("/:id", async (req, res) => {
  // #swagger.tags = ['Empréstimos']
  // #swagger.summary = 'Exclui um empréstimo sem pagamentos (transação: abate o valorTotal do saldo do cliente)'
  const id = Number(req.params.id)
  try {
    const emprestimo = await prisma.$transaction(async (tx) => {
      const emprestimo = await tx.emprestimo.findUnique({ where: { id }, include: { pagamentos: true } })
      if (!emprestimo) throw new ErroNegocio(404, "Empréstimo não encontrado")
      if (emprestimo.pagamentos.length > 0) throw new ErroNegocio(400, "Empréstimo possui pagamentos; exclua-os antes")

      await tx.emprestimo.delete({ where: { id } })
      await tx.cliente.update({
        where: { id: emprestimo.clienteId },
        data: { saldoDevedor: { decrement: emprestimo.valorTotal } }
      })
      return emprestimo
    })
    res.status(200).json(emprestimo)
  } catch (error) {
    const { status, corpo } = respostaErro(error)
    res.status(status).json(corpo)
  }
})

export default router
