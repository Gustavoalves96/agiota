import { Router } from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { randomInt } from "crypto"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { enviaEmail } from "../lib/email"
import { validaSenha } from "./usuarios"

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1)
})

const esqueciSenhaSchema = z.object({
  email: z.string().email({ message: "E-mail inválido" })
})

const redefinirSenhaSchema = z.object({
  email: z.string().email({ message: "E-mail inválido" }),
  codigo: z.string().length(4, { message: "Código deve possuir 4 caracteres" }),
  novaSenha: z.string()
})

// gera o código com crypto.randomInt, pois Math.random é previsível
// o alfabeto não tem 0, O, 1 e I para evitar confusão ao ler o e-mail
function geraCodigo() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let codigo = ""
  for (let i = 0; i < 4; i++) {
    codigo += caracteres[randomInt(caracteres.length)]
  }
  return codigo
}

router.post("/", async (req, res) => {
  /*
    #swagger.tags = ['Login']
    #swagger.summary = 'Faz o login e devolve o token JWT'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Login" } } }
    }
  */
  // mensagem padrão, para não dar "dicas" sobre o processo de login
  const mensaPadrao = "Login ou senha incorretos"

  const valida = loginSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: mensaPadrao })
    return
  }

  const { email, senha } = valida.data

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email }
    })

    if (usuario == null || !bcrypt.compareSync(senha, usuario.senha)) {
      res.status(400).json({ erro: mensaPadrao })
      return
    }

    const payload = { userLogadoId: usuario.id, userLogadoNome: usuario.nome }
    const secret = process.env.JWT_SECRET as string
    const token = jwt.sign(payload, secret, { expiresIn: "15m" })

    res.status(200).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      token
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Não foi possível processar a solicitação" })
  }
})

router.post("/esqueci-senha", async (req, res) => {
  /*
    #swagger.tags = ['Login']
    #swagger.summary = 'Gera um código de recuperação e envia ao e-mail do usuário'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/EsqueciSenha" } } }
    }
  */
  const valida = esqueciSenhaSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }

  const { email } = valida.data

  // mesma resposta exista ou não o e-mail, para não revelar quem é cadastrado
  const mensaPadrao = "Se o e-mail estiver cadastrado, você receberá um código de recuperação"

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email }
    })

    if (usuario != null) {
      const codigo = geraCodigo()

      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { codigoRecuperacao: codigo }
      })

      await enviaEmail(
        usuario.email,
        "Recuperação de Senha",
        `<p>Seu código de recuperação de senha é: <strong>${codigo}</strong></p>`
      )
    }

    res.status(200).json({ mensagem: mensaPadrao })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Não foi possível processar a solicitação" })
  }
})

router.post("/redefinir-senha", async (req, res) => {
  /*
    #swagger.tags = ['Login']
    #swagger.summary = 'Altera a senha a partir do código recebido por e-mail'
    #swagger.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/RedefinirSenha" } } }
    }
  */
  const valida = redefinirSenhaSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error.issues })
    return
  }

  const { email, codigo, novaSenha } = valida.data

  const mensaErros = validaSenha(novaSenha)

  if (mensaErros.length > 0) {
    res.status(400).json({ erro: mensaErros })
    return
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { email }
    })

    if (usuario == null || usuario.codigoRecuperacao !== codigo) {
      res.status(400).json({ erro: "E-mail ou código inválidos" })
      return
    }

    const salt = bcrypt.genSaltSync(12)
    const hash = bcrypt.hashSync(novaSenha, salt)

    // limpa o código para que ele não possa ser reutilizado
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senha: hash, codigoRecuperacao: null }
    })

    res.status(200).json({ mensagem: "Senha alterada com sucesso" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Não foi possível processar a solicitação" })
  }
})

export default router
