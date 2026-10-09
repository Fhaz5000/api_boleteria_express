const express = require("express")
const { pool, query, normalizar } = require("../db")
const { requiereSuperAdmin } = require("../auth")

// Administración de roles: exclusiva del SUPERADMIN.
// Las validaciones (nombre, permisos válidos, roles del sistema) las aplica RolService en la APP .NET.
const router = express.Router()
router.use(requiereSuperAdmin)

const SELECT = `
 SELECT r.id AS Id, r.nombre AS Nombre, r.descripcion AS Descripcion,
        r.permisos AS Permisos, r.es_sistema AS EsSistema,
        (SELECT COUNT(*) FROM usuarios u WHERE u.rol = r.nombre) AS CantidadUsuarios
 FROM roles r`

const rol = f => normalizar(f, { bools: ["EsSistema"] })

router.get("/", async (req, res) => {
 res.json((await query(`${SELECT} ORDER BY r.es_sistema DESC, r.nombre`)).map(rol))
})

router.get("/por-nombre/:nombre", async (req, res) => {
 const [r] = await query(`${SELECT} WHERE r.nombre = ? LIMIT 1`, [req.params.nombre])
 res.json(r ? rol(r) : null)
})

router.get("/:id", async (req, res) => {
 const [r] = await query(`${SELECT} WHERE r.id = ? LIMIT 1`, [req.params.id])
 res.json(r ? rol(r) : null)
})

router.post("/", async (req, res) => {
 const r = await query("INSERT INTO roles (nombre, descripcion, permisos, es_sistema) VALUES (?, ?, ?, 0)",
  [req.body.Nombre, req.body.Descripcion, req.body.Permisos])
 res.status(201).json({ Id: r.insertId })
})

// Body: { rol: {...}, nombreAnterior: "..." } — si cambia el nombre, se actualiza en los usuarios
router.put("/:id", async (req, res) => {
 const { rol: r, nombreAnterior } = req.body
 const conn = await pool.getConnection()
 try{
  await conn.beginTransaction()
  await conn.query(
   "UPDATE roles SET nombre = ?, descripcion = ?, permisos = ? WHERE id = ? AND es_sistema = 0",
   [r.Nombre, r.Descripcion, r.Permisos, req.params.id])
  if(nombreAnterior && r.Nombre !== nombreAnterior){
   await conn.query("UPDATE usuarios SET rol = ? WHERE rol = ?", [r.Nombre, nombreAnterior])
  }
  await conn.commit()
  res.status(204).end()
 }catch(err){
  await conn.rollback().catch(() => {})
  throw err
 }finally{
  conn.release()
 }
})

router.delete("/:id", async (req, res) => {
 await query("DELETE FROM roles WHERE id = ? AND es_sistema = 0", [req.params.id])
 res.status(204).end()
})

module.exports = router
