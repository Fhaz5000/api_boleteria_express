const express = require("express")
const bcrypt = require("bcryptjs")
const { query } = require("../db")
const { PERMISOS, esSuperAdmin, firmarToken } = require("../auth")

const router = express.Router()

//////////////////////////////////////////////////////
// LOGIN DE LA APP .NET
//////////////////////////////////////////////////////

router.post("/login", async (req, res) => {
 const username = String(req.body?.username || "").trim()
 const password = String(req.body?.password || "")

 if(!username || !password){
  return res.status(400).json({ mensaje: "Ingrese usuario y contraseña" })
 }

 const [usuario] = await query(
  `SELECT id AS Id, username AS Username, password_hash AS PasswordHash, rol AS Rol
   FROM usuarios WHERE username = ? LIMIT 1`, [username])

 if(!usuario){
  return res.status(401).json({ mensaje: "Usuario o contraseña incorrectos" })
 }

 let valida = false
 try{ valida = await bcrypt.compare(password, usuario.PasswordHash) }catch{ valida = false }

 // Contraseñas antiguas en texto plano: se aceptan una vez y se migran a BCrypt
 if(!valida && usuario.PasswordHash === password){
  valida = true
  try{
   await query("UPDATE usuarios SET password_hash = ? WHERE id = ?", [await bcrypt.hash(password, 11), usuario.Id])
  }catch(err){
   console.log("No se pudo migrar la contraseña:", err.message)
  }
 }

 if(!valida){
  return res.status(401).json({ mensaje: "Usuario o contraseña incorrectos" })
 }

 let permisos = PERMISOS
 if(!esSuperAdmin(usuario.Rol)){
  const [rol] = await query("SELECT permisos FROM roles WHERE nombre = ? LIMIT 1", [usuario.Rol])
  permisos = String(rol?.permisos || "").split(",").map(p => p.trim()).filter(Boolean)
 }

 res.json({
  token: firmarToken(usuario, permisos),
  usuario: { Id: usuario.Id, Username: usuario.Username, Rol: usuario.Rol },
  permisos
 })
})

module.exports = router
