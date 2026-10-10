const express = require("express")
const { pool, query } = require("../db")
const { requiereSuperAdmin } = require("../auth")

// Mantenimiento de la base: espacio usado y depuración de sorteos antiguos. Exclusivo del SUPERADMIN.
const router = express.Router()
router.use(requiereSuperAdmin)

const MB = 1024 * 1024
const ALERTA_MB = Number(process.env.ESPACIO_ALERTA_MB || 800)
const TOTAL_MB = Number(process.env.ESPACIO_TOTAL_MB || 1024)

// Tablas que se vacían al depurar (los temas no se tocan)
const TABLAS_DEPURABLES = ["sorteos", "boletas", "boleta_numeros"]

async function espacioPorTabla(){
 return await query(
  `SELECT TABLE_NAME AS Tabla, TABLE_ROWS AS Filas, DATA_LENGTH + INDEX_LENGTH AS Bytes
   FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
   ORDER BY Bytes DESC`)
}

function resumenEspacio(tablas){
 const bytes = tablas.reduce((t, x) => t + Number(x.Bytes || 0), 0)
 const usadoMB = Math.round(bytes / MB * 10) / 10
 return {
  UsadoMB: usadoMB,
  AlertaMB: ALERTA_MB,
  TotalMB: TOTAL_MB,
  SuperaAlerta: usadoMB >= ALERTA_MB,
  Tablas: tablas.map(t => ({ Tabla: t.Tabla, Filas: Number(t.Filas || 0), MB: Math.round(Number(t.Bytes || 0) / MB * 100) / 100 }))
 }
}

// "2026-10-09" -> límite exclusivo "2026-10-10 00:00:00" (la fecha elegida entra en la depuración)
function limiteExclusivo(hasta){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(hasta || ""))) return null
 const d = new Date(`${hasta}T00:00:00Z`)
 if(isNaN(d)) return null
 d.setUTCDate(d.getUTCDate() + 1)
 return d.toISOString().substring(0, 10) + " 00:00:00"
}

async function contar(conn, limite){
 const [[s]] = await conn.query("SELECT COUNT(*) AS n FROM sorteos WHERE fecha_evento < ?", [limite])
 const [[b]] = await conn.query(
  "SELECT COUNT(*) AS n FROM boletas b JOIN sorteos s ON s.id = b.sorteo_id WHERE s.fecha_evento < ?", [limite])
 const [[n]] = await conn.query(
  `SELECT COUNT(*) AS n FROM boleta_numeros bn
   JOIN boletas b ON b.id = bn.boleta_id
   JOIN sorteos s ON s.id = b.sorteo_id
   WHERE s.fecha_evento < ?`, [limite])
 return { Sorteos: s.n, Boletas: b.n, Numeros: n.n }
}

// Espacio aproximado que libera cada fila, según el tamaño promedio actual de cada tabla
async function estimarMB(conteo){
 const tablas = await espacioPorTabla()
 const promedio = nombre => {
  const t = tablas.find(x => x.Tabla === nombre)
  return t && Number(t.Filas) > 0 ? Number(t.Bytes) / Number(t.Filas) : 0
 }
 const bytes = conteo.Sorteos * promedio("sorteos") + conteo.Boletas * promedio("boletas") + conteo.Numeros * promedio("boleta_numeros")
 return Math.round(bytes / MB * 10) / 10
}

//////////////////////////////////////////////////////
// ESPACIO USADO
//////////////////////////////////////////////////////

router.get("/espacio", async (req, res) => {
 res.json(resumenEspacio(await espacioPorTabla()))
})

//////////////////////////////////////////////////////
// DEPURACIÓN: sorteos con fecha de evento hasta ?hasta=yyyy-mm-dd (incluida)
//////////////////////////////////////////////////////

// Vista previa: qué se borraría, sin borrar nada
router.get("/depuracion", async (req, res) => {
 const limite = limiteExclusivo(req.query.hasta)
 if(!limite) return res.status(400).json({ mensaje: "Fecha inválida. Use el formato aaaa-mm-dd." })

 const conteo = await contar(pool, limite)
 res.json({ ...conteo, MBAproximados: await estimarMB(conteo) })
})

router.delete("/depuracion", async (req, res) => {
 const limite = limiteExclusivo(req.query.hasta)
 if(!limite) return res.status(400).json({ mensaje: "Fecha inválida. Use el formato aaaa-mm-dd." })

 const conn = await pool.getConnection()
 let conteo
 try{
  await conn.beginTransaction()
  conteo = await contar(conn, limite)
  // Las boletas y sus números se borran en cascada (fk_boletas_sorteos y fk_boleta_numeros_boletas)
  await conn.query("DELETE FROM sorteos WHERE fecha_evento < ?", [limite])
  await conn.commit()
 }catch(err){
  await conn.rollback().catch(() => {})
  throw err
 }finally{
  conn.release()
 }

 // MySQL no devuelve el espacio al disco tras un DELETE: OPTIMIZE reconstruye las tablas
 if(conteo.Sorteos > 0){
  try{ await query(`OPTIMIZE TABLE ${TABLAS_DEPURABLES.join(", ")}`) }
  catch(err){ console.log("OPTIMIZE:", err.message) }
 }

 console.log(`Depuración por ${req.usuario.username} hasta ${req.query.hasta}:`, conteo)
 res.json({ ...conteo, Espacio: resumenEspacio(await espacioPorTabla()) })
})

module.exports = router
