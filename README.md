# API do Agiota

Trabalho #2 – Desenvolvimento de Serviços e APIs (Prof. Edécio Fernando Iepsen).

API (fictícia, para fins didáticos) para um agiota controlar clientes, cobradores, empréstimos e pagamentos. Juros de 20% sobre o valor emprestado + 1% ao dia após o vencimento, até a quitação.

## Tecnologias

Express, TypeScript, Prisma (MySQL), Zod, Nodemailer (Mailtrap), swagger-autogen e swagger-ui-express.

## Como rodar

```
npm install
cp .env.example .env        # preencha a senha do MySQL e as credenciais do Mailtrap
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
