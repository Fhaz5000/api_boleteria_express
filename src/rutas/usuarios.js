const express = require("express")
const { query } = require("../db")
const { requiereSuperAdmin } = require("../auth")

// Administración de usuarios: exclusiva del SUPERADMIN.
// Las reglas de negocio (último SUPERADMIN, duplicados, etc.) las aplica UsuarioService en la APP .NET.
// Nunca se devuelve el hash de la contraseña.
const router = express.Router()
router.use(requiereSuperAdmin)

const SELECT = "SELECT id AS Id, username AS Username, rol AS Rol FROM usuarios"

router.get("/", async (req, res) => {
 res.json(await query(`${SELECT} ORDER BY username`))
})

router.get("/por-username/:username", async (req, res) => {
 const [u] = await query(`${SELECT} WHERE username = ? LIMIT 1`, [req.params.username])
 res.json(u || null)
})

router.get("/contar-rol/:rol", async (req, res) => {
 const [r] = await query("SELECT COUNT(*) AS total FROM usuarios WHERE rol = ?", [req.params.rol])
 res.json(r.total)
})

router.get("/:id", async (req, res) => {
 const [u] = await query(`${SELECT} WHERE id = ? LIMIT 1`, [req.params.id])
 res.json(u || null)
})

// Recibe PasswordHash ya cifrado con BCrypt por la APP .NET
router.post("/", async (req, res) => {
 const u = req.body
 const r = await query("INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)",
  [u.Username, u.PasswordHash, u.Rol])
 res.status(201).json({ Id: r.insertId })
})

router.put("/:id", async (req, res) => {
 await query("UPDATE usuarios SET username = ?, rol = ? WHERE id = ?",
  [req.body.Username, req.body.Rol, req.params.id])
 res.status(204).end()
})

router.put("/:id/password", async (req, res) => {
 await query("UPDATE usuarios SET password_hash = ? WHERE id = ?", [req.body.PasswordHash, req.params.id])
 res.status(204).end()
})

router.delete("/:id", async (req, res) => {
 await query("DELETE FROM usuarios WHERE id = ?", [req.params.id])
 res.status(204).end()
})

module.exports = router
