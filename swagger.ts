import swaggerAutogen from "swagger-autogen"

const doc = {
  info: {
    title: "API do Agiota",
    description: "Sistema de Controle de Empréstimos de um Agiota – juros de 20% + 1% ao dia após o vencimento",
    version: "1.0.0"
  },
  servers: [{ url: "http://localhost:3000" }],
  components: {
    schemas: {
      Cliente: { $nome: "João da Silva", apelido: "Joãozinho", $telefone: "53988887777", $email: "joao@email.com", endereco: "Rua A, 100" },
      Cobrador: { $nome: "Zé Martelo", $telefone: "53999990000", $comissao: 10, ativo: true },
      Emprestimo: { $clienteId: 1, $cobradorId: 1, $valor: 1000, $vencimento: "2026-11-21", data: "2026-10-21" },
      Pagamento: { $emprestimoId: 1, $valor: 300, $forma: "PIX", data: "2026-10-25" }
    }
  }
}

const outputFile = "./swagger-output.json"

// Arquivo principal que registra as rotas
const routes = ["./src/server.ts"]

swaggerAutogen({ openapi: "3.0.0" })(outputFile, routes, doc)
