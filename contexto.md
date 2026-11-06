# Contexto: recuperação de senha em API Express + Prisma

Este documento descreve o que foi implementado no projeto `seguranca1` (API de Controle de Cantina) para que as mesmas mudanças sejam aplicadas em outro projeto.

## Objetivo

Exercício avaliativo da disciplina (PDF "APIs - Seguranca1", pág. 26): criar a recuperação de senha em 2 rotas.

1. **Solicitar:** validar o e-mail, gerar um código de 4 caracteres, salvar em um novo campo da tabela de usuários e enviar ao e-mail do usuário.
2. **Redefinir:** receber e-mail, código e nova senha, validar os dados e as regras de composição da senha, e alterar a senha.

## Stack do projeto original

Express 5, TypeScript (rodando com `tsx`), Prisma 7 com adapter MariaDB, bcrypt, jsonwebtoken, zod, nodemailer (Mailtrap sandbox) e swagger-autogen.

O projeto já tinha antes destas mudanças:

- model `Usuario` com `nome`, `email` (único) e `senha` (hash bcrypt);
- `POST /usuarios` com a função `validaSenha`;
- `POST /login` com JWT;
- envio de e-mail em `src/routes/alunos.ts`.

## Rotas criadas

| Rota | Corpo | Respostas |
|---|---|---|
| `POST /login/esqueci-senha` | `{ email }` | 200 com mensagem genérica; 400 se o formato do e-mail for inválido; 500 em falha |
| `POST /login/redefinir-senha` | `{ email, codigo, novaSenha }` | 200 se alterou; 400 com dados inválidos, senha fraca ou código errado; 500 em falha |

## Passo a passo

### 1. Novo campo no banco

Em `prisma/schema.prisma`, no model `Usuario`:

```prisma
codigoRecuperacao String? @db.VarChar(4)    // código enviado por e-mail para recuperar a senha
```

Depois:

```powershell
npx prisma migrate dev --name add_codigo_recuperacao
npx prisma generate
```

### 2. Transporter de e-mail compartilhado

Criar `lib/mailer.ts`. O `dotenv/config` no topo garante que as variáveis já estejam carregadas quando o transporter for criado.

```ts
import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
});

export { transporter };
```

Se o projeto já tiver um transporter em outro arquivo, remover de lá o `createTransport` e o `import nodemailer`, e importar deste módulo:

```ts
import { transporter } from "../../lib/mailer"
```

### 3. Ajustes em `src/routes/usuarios.ts`

Exportar a validação de senha para reaproveitá-la:

```ts
export function validaSenha(senha: string) {
```

Criar a constante abaixo e usá-la em **todas** as rotas que devolvem usuário:

```ts
// campos que nunca devem ser devolvidos nas respostas da API
const camposSigilosos = { senha: true, codigoRecuperacao: true }

await prisma.usuario.findMany({ omit: camposSigilosos })
await prisma.usuario.create({ data: { nome, email, senha: hash }, omit: camposSigilosos })
await prisma.usuario.delete({ where: { id: Number(id) }, omit: camposSigilosos })
```

**Este ajuste é obrigatório.** No projeto original, `GET /usuarios` não exige token. Sem o `omit`, qualquer pessoa leria o código de recuperação e poderia trocar a senha de outro usuário.

### 4. Rotas em `src/routes/login.ts`

Imports e funções auxiliares, no topo do arquivo:

```ts
import { randomInt } from 'crypto'
import { z } from 'zod'
import { transporter } from "../../lib/mailer"
import { validaSenha } from "./usuarios"

const esqueciSenhaSchema = z.object({
  email: z.string().email()
})

const redefinirSenhaSchema = z.object({
  email: z.string().email(),
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
```

Rotas, antes do `export default router`:

```ts
router.post("/esqueci-senha", async (req, res) => {
  const valida = esqueciSenhaSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error })
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

      await transporter.sendMail({
        from: 'Cantina Escolar <cantina@gmail.com>',
        to: usuario.email,
        subject: "Recuperação de Senha",
        text: `Seu código de recuperação de senha é: ${codigo}`,
        html: `<p>Seu código de recuperação de senha é: <strong>${codigo}</strong></p>`
      })
    }

    res.status(200).json({ mensagem: mensaPadrao })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Não foi possível processar a solicitação" })
  }
})

router.post("/redefinir-senha", async (req, res) => {
  const valida = redefinirSenhaSchema.safeParse(req.body)
  if (!valida.success) {
    res.status(400).json({ erro: valida.error })
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
```

O router já estava montado com `app.use("/login", routesLogin)`, então `server.ts` não mudou.

### 5. Documentação Swagger

Rodar `npm run swagger` e reiniciar o servidor para as rotas aparecerem em `/docs`.

## O que adaptar no outro projeto

- Caminhos dos imports (`../../lib/prisma`, `../../lib/mailer`, `./usuarios`).
- Nomes do model e dos campos, se forem diferentes de `Usuario`, `email` e `senha`.
- Remetente, assunto e texto do e-mail.
- Host do SMTP, caso não use o Mailtrap sandbox.
- Se o projeto não tiver `validaSenha`, copiar a função de `src/routes/usuarios.ts` ou criar as regras equivalentes.
- `omit` depende da versão do Prisma. Em versões antigas, usar `select` listando os campos públicos.
- Procurar qualquer outra rota que devolva o usuário inteiro e aplicar o `omit` nela também.

## Variáveis de ambiente

O `.env` precisa ter `SMTP_USER`, `SMTP_PASS` e `JWT_SECRET`, além das variáveis do banco. Não copiar os valores do projeto original.

Para gerar um `JWT_SECRET` novo:

```powershell
node -p "require('crypto').randomBytes(64).toString('hex')"
```

O valor fica só no `.env`, não no banco, então o limite `VarChar(60)` da coluna `senha` não se aplica. Depois de trocar o segredo, reiniciar o servidor e fazer login de novo, porque os tokens antigos deixam de valer.

## Problemas encontrados

- **Nome do banco divergente:** o Prisma CLI usa `DATABASE_URL`, mas a API usa `DATABASE_NAME`. No projeto original, um erro de digitação em `DATABASE_NAME` deixou a migration funcionando e a API falhando com `pool timeout`. A causa real aparecia no fim do erro: `Unknown database`. Conferir se as duas variáveis apontam para o mesmo banco.
- **Queda do servidor:** a rota `GET /alunos/email/:id` chama `enviaEmail(aluno)` sem `await` e sem tratar aluno inexistente. Um erro nessa chamada pode derrubar a API. Essa rota não foi alterada; as rotas de recuperação usam `await` dentro de `try/catch`.
- **Login no navegador:** `POST /login` não abre pela barra de endereços. Usar Insomnia, Postman, Swagger ou `Invoke-RestMethod`.

## Testes

Todos os cenários abaixo passaram no projeto original, com a API rodando de verdade:

| Cenário | Resultado esperado |
|---|---|
| Pedir código com e-mail cadastrado | 200, código salvo no banco e e-mail enviado |
| Pedir código com e-mail não cadastrado | 200, mesma mensagem e nenhum e-mail |
| E-mail em formato inválido | 400 |
| Redefinir com código errado | 400 |
| Redefinir com senha fraca | 400 com a lista de regras |
| Redefinir com dados corretos | 200 |
| Repetir o mesmo código | 400 |
| Login com a senha nova | 200 com token |
| Login com a senha antiga | 400 |
| `GET /usuarios` | Sem `senha` e sem `codigoRecuperacao` |
| Rota que já enviava e-mail | Continua enviando, depois de mover o transporter |

## Melhorias opcionais

O enunciado não pede, mas são pontos fracos conhecidos:

- Prazo de validade do código (por exemplo, um campo `codigoExpira`).
- Limite de tentativas, porque um código de 4 caracteres é vulnerável a força bruta.
- `await` e `try/catch` em `GET /alunos/email/:id`, com resposta 404 para aluno inexistente.
