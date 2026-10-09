const express = require("express")
const { pool, query, normalizar, fechaAMysql } = require("../db")
const { requierePermiso } = require("../auth")

const router = express.Router()

const COLUMNAS = `
 b.id AS Id, b.sorteo_id AS SorteoId, b.estado AS Estado, b.precio AS Precio,
 b.fecha_creacion AS FechaCreacion, b.fecha_venta AS FechaVenta,
 b.latitud AS Latitud, b.longitud AS Longitud,
 b.identificacion AS Identificacion, b.nombre AS Nombre,
 b.premio_nombre AS PremioNombre, b.premio_descripcion AS PremioDescripcion,
 b.premio_valor_comercial AS PremioValorComercial`

// Fila plana de MySQL -> objeto Boleta de la APP .NET (premio embebido, sin números)
function boleta(f){
 normalizar(f, { fechas: ["FechaCreacion", "FechaVenta"] })
 const premio = String(f.PremioNombre || "").trim() !== ""
  ? { Nombre: f.PremioNombre, Descripcion: f.PremioDescripcion || "", ValorComercial: f.PremioValorComercial || 0 }
  : null
 const { PremioNombre, PremioDescripcion, PremioValorComercial, ...resto } = f
 return { ...resto, Premio: premio, Numeros: [] }
}

// Boletas con sus números (boleta_numeros), en el orden en que se generaron
async function conNumeros(where, params){
 const filas = await query(
  `SELECT ${COLUMNAS},
          bn.id AS num_Id, bn.boleta_id AS num_BoletaId, bn.numero AS num_Numero, bn.es_ganador AS num_EsGanador
   FROM boletas b
   LEFT JOIN boleta_numeros bn ON b.id = bn.boleta_id
   WHERE ${where}
   ORDER BY b.id ASC, bn.id ASC`, params)

 const mapa = new Map()
 for(const f of filas){
  const { num_Id, num_BoletaId, num_Numero, num_EsGanador, ...datos } = f
  if(!mapa.has(datos.Id)) mapa.set(datos.Id, boleta(datos))
  if(num_Numero){
   mapa.get(datos.Id).Numeros.push({ Id: num_Id, BoletaId: num_BoletaId, Numero: num_Numero, EsGanador: Boolean(Number(num_EsGanador)) })
  }
 }
 return [...mapa.values()]
}

function premioDe(b){
 return [b.Premio?.Nombre ?? null, b.Premio?.Descripcion ?? null, b.Premio?.ValorComercial ?? null]
}

router.get("/", async (req, res) => {
 res.json((await query(`SELECT ${COLUMNAS} FROM boletas b ORDER BY b.id DESC`)).map(boleta))
})

router.get("/sorteo/:sorteoId", async (req, res) => {
 res.json(await conNumeros("b.sorteo_id = ?", [req.params.sorteoId]))
})

router.get("/sorteo/:sorteoId/existen", async (req, res) => {
 const [r] = await query("SELECT COUNT(1) AS total FROM boletas WHERE sorteo_id = ?", [req.params.sorteoId])
 res.json(r.total > 0)
})

router.get("/:id", async (req, res) => {
 const [b] = await conNumeros("b.id = ?", [req.params.id])
 res.json(b || null)
})

// Inserta una boleta con sus números
router.post("/", requierePermiso("BOLETAS_GENERAR"), async (req, res) => {
 const b = req.body
 const conn = await pool.getConnection()
 try{
  await conn.beginTransaction()
  const [r] = await conn.query(
   `INSERT INTO boletas (sorteo_id, estado, precio, fecha_creacion, fecha_venta, latitud, longitud,
                         identificacion, nombre, premio_nombre, premio_descripcion, premio_valor_comercial)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
   [b.SorteoId, b.Estado, b.Precio, fechaAMysql(b.FechaCreacion), fechaAMysql(b.FechaVenta),
    b.Latitud, b.Longitud, b.Identificacion, b.Nombre, ...premioDe(b)])

  const numeros = (b.Numeros || []).map(n => [r.insertId, n.Numero, n.EsGanador ? 1 : 0])
  if(numeros.length) await conn.query("INSERT INTO boleta_numeros (boleta_id, numero, es_ganador) VALUES ?", [numeros])

  await conn.commit()
  res.status(201).json({ Id: r.insertId })
 }catch(err){
  await conn.rollback().catch(() => {})
  throw err
 }finally{
  conn.release()
 }
})

// Generación de boletería: inserta todas las boletas de un sorteo en una sola transacción
router.post("/lote", requierePermiso("BOLETAS_GENERAR"), async (req, res) => {
 const lista = Array.isArray(req.body) ? req.body : []
 if(lista.length === 0) return res.status(400).json({ mensaje: "La lista de boletas está vacía." })

 const conn = await pool.getConnection()
 try{
  await conn.beginTransaction()

  const TAMANO_LOTE = 500
  for(let i = 0; i < lista.length; i += TAMANO_LOTE){
   const lote = lista.slice(i, i + TAMANO_LOTE)

   const [r] = await conn.query(
    "INSERT INTO boletas (sorteo_id, estado, precio, fecha_creacion) VALUES ?",
    [lote.map(b => [b.SorteoId, b.Estado, b.Precio, fechaAMysql(b.FechaCreacion)])])

   // En un INSERT de varias filas, MySQL asigna ids consecutivos desde insertId
   const numeros = []
   lote.forEach((b, j) => {
    for(const n of b.Numeros || []) numeros.push([r.insertId + j, n.Numero, n.EsGanador ? 1 : 0])
   })
   if(numeros.length) await conn.query("INSERT INTO boleta_numeros (boleta_id, numero, es_ganador) VALUES ?", [numeros])
  }

  await conn.commit()
  res.status(201).json({ insertadas: lista.length })
 }catch(err){
  await conn.rollback().catch(() => {})
  throw err
 }finally{
  conn.release()
 }
})

router.put("/:id", requierePermiso("BOLETAS_GENERAR", "PREMIOS_ASIGNAR"), async (req, res) => {
 const b = req.body
 await query(
  `UPDATE boletas
   SET estado = ?, fecha_venta = ?, latitud = ?, longitud = ?, identificacion = ?, nombre = ?,
       premio_nombre = ?, premio_descripcion = ?, premio_valor_comercial = ?
   WHERE id = ?`,
  [b.Estado, fechaAMysql(b.FechaVenta), b.Latitud, b.Longitud, b.Identificacion, b.Nombre, ...premioDe(b), req.params.id])
 res.status(204).end()
})

//////////////////////////////////////////////////////
// PREMIOS (embebidos en la boleta)
//////////////////////////////////////////////////////

router.put("/:id/premio", requierePermiso("PREMIOS_ASIGNAR"), async (req, res) => {
 const p = req.body || {}
 await query(
  "UPDATE boletas SET premio_nombre = ?, premio_descripcion = ?, premio_valor_comercial = ? WHERE id = ?",
  [p.Nombre, p.Descripcion, p.ValorComercial, req.params.id])
 res.status(204).end()
})

router.delete("/:id/premio", requierePermiso("PREMIOS_ASIGNAR"), async (req, res) => {
 await query(
  "UPDATE boletas SET premio_nombre = NULL, premio_descripcion = NULL, premio_valor_comercial = NULL WHERE id = ?",
  [req.params.id])
 res.status(204).end()
})

module.exports = router
