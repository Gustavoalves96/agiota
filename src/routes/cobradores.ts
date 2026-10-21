import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"

const router = Router()

const cobradorSchema = z.object({
  nome: z.string().min(3, { message: "Nome deve possuir, no mínimo, 3 caracteres" }),
  telefone: z.string().min(8, { message: "Telefone inválido" }),
  comissao: z.number().min(0).max(100, { message: "Comissão deve ser entre 0 e 100%" }),
  ativo: z.boolean().optional()
})

router.get("/", async (req, res) => {
  // #swagger.tags = ['Cobradores']
  // #swagger.summary = 'Lista os cobradores'
  try {
    const cobradores = await prisma.cobrador.findMany({ orderBy: { nome: "asc" } })
    res.status(200).json(cobradores)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.get("/:id", async (req, res) => {
  // #swagger.tags = ['Cobradores']
  // #swagger.summary = 'Exibe um cobrador e os empréstimos sob sua responsabilidade'
  const id = Number(req.params.id)
  try {
    const cobrador = await prisma.cobrador.findUnique({
      where: { id },
      include: { emprestimos: { include: { cliente: true } } }
    })
    if (!cobrador) {
      res.status(404).json({ erro: "Cobrador não encontrado" })
      return
    }
    res.status(200).json(cobrador)
  } catch (error) {
    res.status(500).json({ erro: error })
  }
})

router.post("/", async (req, res) => {
  /*
    #swagger.tags = ['Cobradores']
    #swagger.summary = 'Cadastra um cobrador'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Cobrador" } } }
    }
  */
  const valida = cobradorSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }
  try {
    const cobrador = await prisma.cobrador.create({ data: valida.data })
    res.status(201).json(cobrador)
  } catch (error) {
    res.status(400).json({ erro: error })
  }
})

router.put("/:id", async (req, res) => {
  // #swagger.tags = ['Cobradores']
  /* #swagger.summary = 'Altera os dados de um cobrador'
     #swagger.requestBody = { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Cobrador" } } } } */
  const id = Number(req.params.id)
  const valida = cobradorSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }
  try {
    const cobrador = await prisma.cobrador.update({ where: { id }, data: valida.data })
    res.status(200).json(cobrador)
  } catch (error) {
    res.status(400).json({ erro: error })
  }
})

router.delete("/:id", async (req, res) => {
  // #swagger.tags = ['Cobradores']
  // #swagger.summary = 'Exclui um cobrador (sem empréstimos vinculados)'
  const id = Number(req.params.id)
  try {
    const cobrador = await prisma.cobrador.delete({ where: { id } })
    res.status(200).json(cobrador)
  } catch (error) {
    res.status(400).json({ erro: "Cobrador não encontrado ou possui empréstimos vinculados" })
  }
})

export default router
