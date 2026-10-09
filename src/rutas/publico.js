const express = require("express")
const crypto = require("crypto")
const { pool, query, fechaAJson, normalizar, ahoraColombia } = require("../db")

const router = express.Router()

// Estados de la tabla boletas (enum BoletaEstado de la APP .NET)
const ESTADO_DISPONIBLE = 1
const ESTADO_ANULADA = 4
const ESTADO_VALIDADA = 5
const ESTADO_GANADORA = 6

// La validación de QR se habilita desde las 3:00 PM hora Colombia
function horaHabilitada(){
 return Number(ahoraColombia().substring(11, 13)) >= 15
}

function horaActualTexto(){
 const [h, m] = ahoraColombia().substring(11, 16).split(":").map(Number)
 const h12 = h % 12 === 0 ? 12 : h % 12
 return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

/*
VALIDAR TOKEN GENERADO EN .NET (BoletaPdfGenerator.GenerarTokenCompacto)
Formato: {boletaId}|{sorteoId}|{expira}|{firma}
firma = HMAC-SHA256(payload, HMAC_KEY), primeros 16 bytes en base64url sin '='
*/
function validarToken(token){
 const partes = String(token).split("|")
 if(partes.length !== 4) return { valido: false, mensaje: "Token inválido" }

 const [boletaId, sorteoId, expira, firma] = partes
 if(![boletaId, sorteoId, expira].every(p => /^\d+$/.test(p))){
  return { valido: false, mensaje: "Token inválido" }
 }

 const firmaCalculada = crypto
  .createHmac("sha256", process.env.HMAC_KEY)
  .update(`${boletaId}|${sorteoId}|${expira}`)
  .digest()
  .subarray(0, 16)
  .toString("base64url")

 const a = Buffer.from(firmaCalculada)
 const b = Buffer.from(firma)
 if(a.length !== b.length || !crypto.timingSafeEqual(a, b)){
  return { valido: false, mensaje: "Firma inválida" }
 }

 if(Math.floor(Date.now() / 1000) > Number(expira)){
  return { valido: false, mensaje: "Token expirado" }
 }

 return { valido: true, boletaId: Number(boletaId), sorteoId: Number(sorteoId) }
}

/**
 * Busca la boleta del QR. Devuelve una fila normalizada:
 *   Id, Usado, PremioNombre, PremioDescripcion, TienePremio, Origen
 * Origen 'boletas' = boletas reales de la APP .NET (token firmado);
 * Origen 'boletos' = tabla de prueba (GANADOR123 / NORMAL123).
 */
async function buscarBoleto(conn, token, bloquear = false){
 const lock = bloquear ? " FOR UPDATE" : ""

 if(token.includes("|")){
  const t = validarToken(token)
  if(!t.valido) return null

  const [filas] = await conn.query(
   `SELECT b.id AS Id, b.estado AS Estado,
           b.premio_nombre AS PremioNombre, b.premio_descripcion AS PremioDescripcion
    FROM boletas b
    INNER JOIN sorteos s ON s.id = b.sorteo_id
    WHERE b.id = ? AND b.sorteo_id = ? AND s.esta_eliminado = 0
    LIMIT 1${lock}`, [t.boletaId, t.sorteoId])

  const r = filas[0]
  if(!r || Number(r.Estado) === ESTADO_ANULADA) return null

  const estado = Number(r.Estado)
  return {
   Id: r.Id,
   Usado: (estado === ESTADO_VALIDADA || estado === ESTADO_GANADORA) ? 1 : 0,
   PremioNombre: r.PremioNombre,
   PremioDescripcion: r.PremioDescripcion,
   TienePremio: String(r.PremioNombre || "").trim() !== "",
   Origen: "boletas"
  }
 }

 const [filas] = await conn.query(
  `SELECT b.id AS Id, b.usado AS Usado,
          p.nombre AS PremioNombre, p.descripcion AS PremioDescripcion
   FROM boletos b
   LEFT JOIN premios p ON p.id = b.premio_id
   WHERE b.token = ?
   LIMIT 1${lock}`, [token])

 const r = filas[0]
 if(!r) return null

 return {
  Id: r.Id,
  Usado: Number(r.Usado),
  PremioNombre: r.PremioNombre,
  PremioDescripcion: r.PremioDescripcion,
  TienePremio: r.PremioNombre !== null,
  Origen: "boletos"
 }
}

// Registra al comprador y marca la boleta como validada (o ganadora si tiene premio)
async function marcarUsado(conn, b, nombre, ident){
 if(b.Origen === "boletas"){
  await conn.query(
   `UPDATE boletas
    SET estado = ?, nombre = ?, identificacion = ?, fecha_venta = COALESCE(fecha_venta, ?)
    WHERE id = ?`,
   [b.TienePremio ? ESTADO_GANADORA : ESTADO_VALIDADA, nombre, ident, ahoraColombia(), b.Id])
  return
 }

 await conn.query(
  "UPDATE boletos SET usado = 1, nombre = ?, identificacion = ?, fecha_uso = ? WHERE id = ?",
  [nombre, ident, ahoraColombia(), b.Id])
}

// Forma que espera la web: boleto.Premio.{Nombre,Descripcion} o null
function formatearBoleto(r){
 return {
  Id: r.Id,
  Usado: r.Usado,
  Premio: r.TienePremio ? { Nombre: r.PremioNombre, Descripcion: r.PremioDescripcion } : null
 }
}

//////////////////////////////////////////////////////
// CONSULTAR BOLETO (lo usa la web al abrir el QR)
//////////////////////////////////////////////////////

router.get("/boleto/check", async (req, res) => {
 if(!horaHabilitada()){
  return res.json({
   ok: false,
   motivo: "hora",
   mensaje: "Aún no se activa la validación de QR. Se activará desde las 3:00 PM (hora Colombia).",
   hora_actual: horaActualTexto()
  })
 }

 const token = String(req.query.token || "").trim()
 if(!token){
  return res.json({ ok: false, motivo: "token", mensaje: "Token inválido" })
 }

 let boleto
 try{
  boleto = await buscarBoleto(pool, token)
 }catch(err){
  console.log("check BD:", err.message)
  return res.json({ ok: false, motivo: "conexion", mensaje: "No se pudo conectar con la base de datos. Intenta de nuevo." })
 }

 if(!boleto) return res.json({ ok: false, motivo: "no_valido", mensaje: "Boleto no válido" })
 if(boleto.Usado === 1) return res.json({ ok: false, motivo: "no_valido", mensaje: "Este boleto ya fue validado" })

 res.json({ ok: true, boleto: formatearBoleto(boleto) })
})

//////////////////////////////////////////////////////
// COMPRAR / VALIDAR BOLETO (formulario de la web)
//////////////////////////////////////////////////////

router.post("/boleto/comprar", async (req, res) => {
 if(!horaHabilitada()){
  return res.json({ ganadora: false, mensaje: "Aún no se activa la validación de QR (desde las 3:00 PM hora Colombia)." })
 }

 const token = String(req.body?.token || "").trim()
 const nombre = String(req.body?.nombre || "").trim()
 const ident = String(req.body?.identificacion || "").trim()

 if(!token || !nombre || !ident){
  return res.status(400).json({ ganadora: false, mensaje: "Datos incompletos" })
 }

 const conn = await pool.getConnection()
 try{
  await conn.beginTransaction()

  // FOR UPDATE: evita que dos personas reclamen el mismo boleto a la vez
  const b = await buscarBoleto(conn, token, true)

  if(!b){
   await conn.rollback()
   return res.json({ ganadora: false, mensaje: "Boleto no válido" })
  }
  if(b.Usado === 1){
   await conn.rollback()
   return res.json({ ganadora: false, mensaje: "Este boleto ya fue validado" })
  }

  await marcarUsado(conn, b, nombre, ident)
  await conn.commit()

  res.json({
   ganadora: b.TienePremio,
   mensaje: b.TienePremio ? "¡Felicitaciones, tu boleta es ganadora!" : "Gracias por participar, esta boleta no tiene premio.",
   boleto: formatearBoleto(b)
  })
 }catch(err){
  await conn.rollback().catch(() => {})
  console.log("comprar BD:", err.message)
  res.status(500).json({ ganadora: false, mensaje: "Error del servidor. Intenta de nuevo." })
 }finally{
  conn.release()
 }
})

//////////////////////////////////////////////////////
// VALIDAR BOLETO SIN MARCARLO (ruta de la API anterior)
//////////////////////////////////////////////////////

router.post("/boleto/validar", async (req, res) => {
 const token = req.body?.token
 if(!token) return res.status(400).json({ valido: false, mensaje: "Token requerido" })

 const resultado = validarToken(token)
 if(!resultado.valido) return res.json(resultado)

 const [boleto] = await query(
  `SELECT id AS Id, sorteo_id AS SorteoId, estado AS Estado, precio AS Precio,
          nombre AS Nombre, identificacion AS Identificacion,
          fecha_creacion AS FechaCreacion, fecha_venta AS FechaVenta
   FROM boletas WHERE id = ? AND sorteo_id = ? LIMIT 1`,
  [resultado.boletaId, resultado.sorteoId])

 if(!boleto) return res.json({ valido: false, mensaje: "Boleto no existe" })
 if(Number(boleto.Estado) !== ESTADO_DISPONIBLE) return res.json({ valido: false, mensaje: "Boleto no disponible" })

 res.json({ valido: true, mensaje: "Boleto disponible", boleto: normalizar(boleto, { fechas: ["FechaCreacion", "FechaVenta"] }) })
})

//////////////////////////////////////////////////////
// SORTEO DEL DÍA DE HOY (hora Colombia)
//////////////////////////////////////////////////////

router.get("/sorteo/hoy", async (req, res) => {
 const hoy = ahoraColombia().substring(0, 10)

 const [sorteo] = await query(
  `SELECT id AS Id, nombre AS Nombre, fecha_evento AS FechaEvento, valor AS Valor,
          oportunidades_por_boleta AS OportunidadesPorBoleta, cantidad_cifras AS CantidadCifras,
          numero_ganador AS NumeroGanador, tema_id AS TemaId, activo AS Activo, premio AS Premio
   FROM sorteos
   WHERE DATE(fecha_evento) = ? AND esta_eliminado = 0
   ORDER BY fecha_evento ASC
   LIMIT 1`, [hoy])

 if(!sorteo) return res.status(404).json({ ok: false, mensaje: "No hay sorteo programado para hoy" })

 sorteo.FechaEvento = fechaAJson(sorteo.FechaEvento)
 sorteo.Activo = Boolean(Number(sorteo.Activo))
 res.json({ ok: true, sorteo })
})

module.exports = router
