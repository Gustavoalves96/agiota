import "dotenv/config"
import express from "express"
import swaggerUi from "swagger-ui-express"
import swaggerDocument from "../swagger-output.json"

import clientesRoutes from "./routes/clientes"
import cobradoresRoutes from "./routes/cobradores"
import emprestimosRoutes from "./routes/emprestimos"
import pagamentosRoutes from "./routes/pagamentos"
import usuariosRoutes from "./routes/usuarios"
import loginRoutes from "./routes/login"

const app = express()
const port = 3000

app.use(express.json())

// Documentação Swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use("/clientes", clientesRoutes)
app.use("/cobradores", cobradoresRoutes)
app.use("/emprestimos", emprestimosRoutes)
app.use("/pagamentos", pagamentosRoutes)
app.use("/usuarios", usuariosRoutes)
app.use("/login", loginRoutes)

app.get("/", (req, res) => {
  // #swagger.ignore = true
  res.redirect("/docs")
})

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`)
})
