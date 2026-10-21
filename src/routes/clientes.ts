import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { enviaEmail } from "../lib/email"
import { atualizaAtraso, diasDeAtraso, JUROS_FIXO } from "../lib/juros"

const router = Router()

const clienteSchema = z.object({
  nome: z.string().min(3, { message: "Nome deve possuir, no mínimo, 3 caracteres" }),
  apelido: z.string().optional(),
  telefone: z.string().min(8, { message: "Telefone inválido" }),
  email: z.string().email({ message: "E-mail inválido" }),
  endereco: z.string().optional()
})

router.get("/", async (req, res) => {
  // #swagger.tags = ['Clientes']
  // #swagger.summary = 'Lista os clientes e seus saldos devedores'
  try {
    const clientes = await prisma.cliente.findMany({ orderBy: { nome: "asc" } })
    res.status(200).json(clientes)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.get("/:id", async (req, res) => {
  // #swagger.tags = ['Clientes']
  // #swagger.summary = 'Exibe um cliente com seus empréstimos e pagamentos'
  const id = Number(req.params.id)
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: { emprestimos: { include: { pagamentos: true, cobrador: true } } }
    })
    if (!cliente) {
      res.status(404).json({ erro: "Cliente não encontrado" })
      return
    }
    res.status(200).json(cliente)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.post("/", async (req, res) => {
  /*
    #swagger.tags = ['Clientes']
    #swagger.summary = 'Cadastra um cliente'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Cliente" } } }
    }
  */
  const valida = clienteSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }
  try {
    const cliente = await prisma.cliente.create({ data: valida.data })
    res.status(201).json(cliente)
  } catch (error) {
    res.status(400).json({ erro: error })
  }
})

router.put("/:id", async (req, res) => {
  // #swagger.tags = ['Clientes']
  /* #swagger.summary = 'Altera os dados de um cliente (o saldo devedor só muda pelas transações)'
     #swagger.requestBody = { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Cliente" } } } } */
  const id = Number(req.params.id)
  const valida = clienteSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }
  try {
    const cliente = await prisma.cliente.update({ where: { id }, data: valida.data })
    res.status(200).json(cliente)
  } catch (error) {
    res.status(400).json({ erro: error })
  }
})

router.delete("/:id", async (req, res) => {
  // #swagger.tags = ['Clientes']
  // #swagger.summary = 'Exclui um cliente (sem empréstimos vinculados)'
  const id = Number(req.params.id)
  try {
    const cliente = await prisma.cliente.delete({ where: { id } })
    res.status(200).json(cliente)
  } catch (error) {
    res.status(400).json({ erro: "Cliente não encontrado ou possui empréstimos vinculados" })
  }
})

function formataData(data: Date) {
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
}

function formataValor(valor: number) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type Linha = { data: Date, descricao: string, valor: number, debito: number, credito: number }

router.get("/:id/extrato", async (req, res) => {
  /*
    #swagger.tags = ['Clientes']
    #swagger.summary = 'Envia por e-mail o extrato do cliente'
    #swagger.description = 'Atualiza os juros de atraso e envia ao cliente a lista de empréstimos (débito) e pagamentos (crédito), com totais e o saldo devedor atual.'
  */
  const id = Number(req.params.id)
  try {
    const existe = await prisma.cliente.findUnique({ where: { id }, include: { emprestimos: true } })
    if (!existe) {
      res.status(404).json({ erro: "Cliente não encontrado" })
      return
    }

    // atualiza os juros de atraso antes de montar o extrato
    await prisma.$transaction(async (tx) => {
      for (const emprestimo of existe.emprestimos) {
        await atualizaAtraso(tx, emprestimo.id)
      }
    })

    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id },
      include: { emprestimos: { include: { pagamentos: true } } }
    })

    const linhas: Linha[] = []
    for (const e of cliente.emprestimos) {
      const valor = Number(e.valor)
      const comJuros = Number(e.valorTotal) - Number(e.jurosAtraso)
      linhas.push({ data: e.data, descricao: `Empréstimo #${e.id} (+${JUROS_FIXO}% de juros)`, valor, debito: comJuros, credito: 0 })
      if (Number(e.jurosAtraso) > 0) {
        const dias = diasDeAtraso(e.vencimento, new Date())
        linhas.push({ data: e.vencimento, descricao: `Juros de atraso #${e.id} (${dias} dias × 1%)`, valor: Number(e.jurosAtraso), debito: Number(e.jurosAtraso), credito: 0 })
      }
      for (const p of e.pagamentos) {
        linhas.push({ data: p.data, descricao: `Pagamento ${p.forma} – empréstimo #${e.id}`, valor: Number(p.valor), debito: 0, credito: Number(p.valor) })
      }
    }
    linhas.sort((a, b) => a.data.getTime() - b.data.getTime())

    const totalDebito = linhas.reduce((soma, l) => soma + l.debito, 0)
    const totalCredito = linhas.reduce((soma, l) => soma + l.credito, 0)

    const td = "style='border:1px solid #999;padding:4px 8px'"
    const tdNum = "style='border:1px solid #999;padding:4px 8px;text-align:right'"

    let html = `
      <h2>Agiota do Bairro: Extrato de Empréstimos e Pagamentos</h2>
      <h3>Cliente: ${cliente.nome}${cliente.apelido ? ` (${cliente.apelido})` : ""}</h3>
      <p>Juros: ${JUROS_FIXO}% sobre o valor emprestado + 1% ao dia após o vencimento, até a quitação.</p>
      <table style='border-collapse:collapse'>
        <tr style='background:#ddd'>
          <th ${td}>Data e Hora</th><th ${td}>Descrição</th><th ${td}>Valor R$</th><th ${td}>Débito R$</th><th ${td}>Crédito R$</th>
        </tr>`
    for (const l of linhas) {
      html += `
        <tr>
          <td ${td}>${formataData(l.data)}</td>
          <td ${td}>${l.descricao}</td>
          <td ${tdNum}>${formataValor(l.valor)}</td>
          <td ${tdNum}>${l.debito ? formataValor(l.debito) : ""}</td>
          <td ${tdNum}>${l.credito ? formataValor(l.credito) : ""}</td>
        </tr>`
    }
    html += `
        <tr style='background:#eee;font-weight:bold'>
          <td ${td} colspan='3' align='right'>Total Geral:</td>
          <td ${tdNum}>R$ ${formataValor(totalDebito)}</td>
          <td ${tdNum}>R$ ${formataValor(totalCredito)}</td>
        </tr>
      </table>
      <h3>Saldo Devedor Atual R$: ${formataValor(Number(cliente.saldoDevedor))}</h3>`

    const atrasados = cliente.emprestimos.filter(e => e.status === "ATRASADO")
    if (atrasados.length > 0) {
      const totalAtraso = atrasados.reduce((soma, e) => soma + Number(e.jurosAtraso), 0)
      html += `
      <div style='border:2px solid #c00;background:#fee;color:#c00;padding:12px;margin-top:12px'>
        <h2 style='margin:0'>SE NÃO PAGAR VAMO TE PEGAR MAGRÃO</h2>
        <p style='margin:6px 0 0'>Você tem ${atrasados.length} empréstimo(s) em atraso, que já somam R$ ${formataValor(totalAtraso)} de juros de atraso, e o valor sobe 1% a cada dia.</p>
      </div>`
    }

    await enviaEmail(cliente.email, "Extrato de Empréstimos e Pagamentos", html)
    res.status(200).json({ mensagem: `Extrato enviado para ${cliente.email}` })
  } catch (error) {
    res.status(500).json({ erro: String(error) })
  }
})

export default router
