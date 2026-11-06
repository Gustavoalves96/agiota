# API do Agiota

Trabalho #2 – Desenvolvimento de Serviços e APIs (Prof. Edécio Fernando Iepsen).

API (fictícia, para fins didáticos) para um agiota controlar clientes, cobradores, empréstimos e pagamentos. Juros de 20% sobre o valor emprestado + 1% ao dia após o vencimento, até a quitação.

## Tecnologias

Express, TypeScript, Prisma (MySQL), Zod, bcrypt, jsonwebtoken, Nodemailer (Mailtrap), swagger-autogen e swagger-ui-express.

## Como rodar

```
npm install
cp .env.example .env        # preencha a senha do MySQL, as credenciais do Mailtrap e o JWT_SECRET
npx prisma migrate dev
npm run dev
```

Documentação: http://localhost:3000/docs (para regerar: `npm run swagger`).

Coleção de testes do Bruno: pasta `bruno/` (Open Collection).

## Transações

| Rota | O que faz numa única transação |
|---|---|
| `POST /emprestimos` | Cria o empréstimo (`valorTotal = valor × 1,20`) e soma ao saldo devedor do cliente |
| `POST /pagamentos` | Aplica os juros de atraso, cria o pagamento, abate do saldo e marca QUITADO se pagou tudo |
| `DELETE /pagamentos/:id` | Exclui o pagamento, devolve o valor ao saldo e reabre o empréstimo |
| `DELETE /emprestimos/:id` | Exclui empréstimo sem pagamentos e abate o valorTotal do saldo |

## E-mail

`GET /clientes/:id/extrato` envia ao cliente a lista de empréstimos (débito) e pagamentos (crédito), com totais e saldo devedor atual.

## Usuários e recuperação de senha

As senhas são salvas com hash bcrypt, e o login devolve um token JWT válido por 15 minutos.

| Rota | Corpo | O que faz |
|---|---|---|
| `POST /usuarios` | `{ nome, email, senha }` | Cadastra o usuário, validando as regras de composição da senha |
| `GET /usuarios` | | Lista os usuários, sem `senha` e sem `codigoRecuperacao` |
| `POST /login` | `{ email, senha }` | Devolve os dados do usuário e o token |
| `POST /login/esqueci-senha` | `{ email }` | Gera um código de 4 caracteres, salva em `codigoRecuperacao` e envia ao e-mail do usuário |
| `POST /login/redefinir-senha` | `{ email, codigo, novaSenha }` | Valida os dados e as regras da senha, altera a senha e apaga o código |

`POST /login/esqueci-senha` responde com a mesma mensagem exista ou não o e-mail, para não revelar quem é cadastrado.
