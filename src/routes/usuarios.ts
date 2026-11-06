import { Router } from "express"
import bcrypt from "bcrypt"
import { z } from "zod"
import { prisma } from "../lib/prisma"

const router = Router()

const usuarioSchema = z.object({
  nome: z.string().min(3, { message: "Nome deve possuir, no mínimo, 3 caracteres" }).max(30, { message: "Nome deve possuir, no máximo, 30 caracteres" }),
  email: z.string().email({ message: "E-mail inválido" }).max(100, { message: "E-mail deve possuir, no máximo, 100 caracteres" }),
  senha: z.string()
})

// campos que nunca devem ser devolvidos nas respostas da API
const camposSigilosos = { senha: true, codigoRecuperacao: true }

// regras de composição da senha: devolve a lista do que não foi atendido
export function validaSenha(senha: string) {
  const mensagens: string[] = []

  if (senha.length < 8) {
    mensagens.push("A senha deve possuir, no mínimo, 8 caracteres")
  }
  if (!/[a-z]/.test(senha)) {
    mensagens.push("A senha deve possuir letra minúscula")
  }
  if (!/[A-Z]/.test(senha)) {
    mensagens.push("A senha deve possuir letra maiúscula")
  }
  if (!/[0-9]/.test(senha)) {
    mensagens.push("A senha deve possuir número")
  }
  if (!/[^A-Za-z0-9]/.test(senha)) {
    mensagens.push("A senha deve possuir símbolo")
  }

  return mensagens
}

router.get("/", async (req, res) => {
  // #swagger.tags = ['Usuários']
  // #swagger.summary = 'Lista os usuários (sem a senha e o código de recuperação)'
  try {
    const usuarios = await prisma.usuario.findMany({ omit: camposSigilosos, orderBy: { nome: "asc" } })
    res.status(200).json(usuarios)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Não foi possível processar a solicitação" })
  }
})

router.post("/", async (req, res) => {
  /*
    #swagger.tags = ['Usuários']
    #swagger.summary = 'Cadastra um usuário'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Usuario" } } }
    }
  */
  const valida = usuarioSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }

  const { nome, email, senha } = valida.data

  const mensaErros = validaSenha(senha)

  if (mensaErros.length > 0) {
    res.status(400).json({ erro: mensaErros })
    return
  }

  // 12 é o número de voltas na geração do salt, o que deixa o hash mais lento
  // e atrasa ataques de força bruta
  const salt = bcrypt.genSaltSync(12)
  const hash = bcrypt.hashSync(senha, salt)

  try {
    const usuario = await prisma.usuario.create({
      data: { nome, email, senha: hash },
      omit: camposSigilosos
    })
    res.status(201).json(usuario)
  } catch (error) {
    console.error(error)
    res.status(400).json({ erro: "Não foi possível cadastrar o usuário" })
  }
})

export default router
