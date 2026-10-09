require("dotenv").config()

const express = require("express")
const cors = require("cors")

const { pool } = require("./src/db")
const { requiereSesion } = require("./src/auth")

for(const variable of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "HMAC_KEY", "JWT_SECRET"]){
 if(!process.env[variable]) console.log(`⚠ Falta la variable de entorno ${variable}`)
}

const app = express()

app.use(cors())
// La generación de boletería envía hasta 10.000 números en una sola petición
app.use(express.json({ limit: "20mb" }))

const PORT = process.env.PORT || 3010

//////////////////////////////////////////////////////
// RUTAS PÚBLICAS (web de validación QR)
//////////////////////////////////////////////////////

app.use("/api", require("./src/rutas/publico"))
app.use("/api/auth", require("./src/rutas/sesion"))

//////////////////////////////////////////////////////
// RUTAS DE LA APP .NET (requieren iniciar sesión)
//////////////////////////////////////////////////////

app.use("/api/temas", requiereSesion, require("./src/rutas/temas"))
app.use("/api/sorteos", requiereSesion, require("./src/rutas/sorteos"))
app.use("/api/boletas", requiereSesion, require("./src/rutas/boletas"))
app.use("/api/usuarios", requiereSesion, require("./src/rutas/usuarios"))
app.use("/api/roles", requiereSesion, require("./src/rutas/roles"))

//////////////////////////////////////////////////////
// TEST API
//////////////////////////////////////////////////////

app.get("/", (req, res) => {
 res.send("API Boleteria funcionando")
})

// Verifica también la conexión con MySQL
app.get("/api/salud", async (req, res) => {
 try{
  await pool.query("SELECT 1")
  res.json({ ok: true, mysql: "conectado" })
 }catch(err){
  res.status(503).json({ ok: false, mysql: "sin conexión", mensaje: err.message })
 }
})

//////////////////////////////////////////////////////
// ERRORES
//////////////////////////////////////////////////////

app.use((req, res) => {
 res.status(404).json({ mensaje: "Ruta no encontrada" })
})

app.use((err, req, res, next) => {
 console.log(err)
 res.status(500).json({ mensaje: "Error del servidor" })
})

//////////////////////////////////////////////////////
// INICIAR SERVIDOR
//////////////////////////////////////////////////////

app.listen(PORT, () => {
 console.log("Servidor corriendo en puerto " + PORT)
})
