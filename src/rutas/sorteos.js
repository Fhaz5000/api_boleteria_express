const express = require("express")
const { query, normalizar, fechaAMysql } = require("../db")
const { requierePermiso } = require("../auth")

const router = express.Router()

const SELECT = `
 SELECT id AS Id, nombre AS Nombre, fecha_evento AS FechaEvento, valor AS Valor,
        oportunidades_por_boleta AS OportunidadesPorBoleta, cantidad_cifras AS CantidadCifras,
        numero_ganador AS NumeroGanador, tema_id AS TemaId, activo AS Activo,
        premio AS Premio, esta_eliminado AS EstaEliminado
 FROM sorteos`

const sorteo = f => normalizar(f, { fechas: ["FechaEvento"], bools: ["Activo", "EstaEliminado"] })

function valores(s){
 return [s.Nombre, fechaAMysql(s.FechaEvento), s.Valor, s.OportunidadesPorBoleta,
         s.CantidadCifras, s.NumeroGanador, s.TemaId, s.Activo ? 1 : 0, s.Premio, s.EstaEliminado ? 1 : 0]
}

router.get("/", async (req, res) => {
 res.json((await query(`${SELECT} ORDER BY id DESC`)).map(sorteo))
})

// Candidatos vigentes: no eliminados con fecha de evento desde ?desde=yyyy-mm-dd
// (la APP .NET aplica después el corte de las 3:00 PM del día siguiente)
router.get("/activos", async (req, res) => {
 const desde = fechaAMysql(req.query.desde) || "1900-01-01"
 res.json((await query(
  `${SELECT} WHERE esta_eliminado = 0 AND fecha_evento >= ? ORDER BY fecha_evento ASC`, [desde])).map(sorteo))
})

router.get("/existe-tema/:temaId", async (req, res) => {
 const [r] = await query("SELECT COUNT(1) AS total FROM sorteos WHERE tema_id = ? AND esta_eliminado = 0", [req.params.temaId])
 res.json(r.total > 0)
})

router.get("/:id", async (req, res) => {
 const [s] = await query(`${SELECT} WHERE id = ? AND esta_eliminado = 0 LIMIT 1`, [req.params.id])
 res.json(s ? sorteo(s) : null)
})

router.post("/", requierePermiso("SORTEOS_EDITAR"), async (req, res) => {
 const r = await query(
  `INSERT INTO sorteos (nombre, fecha_evento, valor, oportunidades_por_boleta,
                        cantidad_cifras, numero_ganador, tema_id, activo, premio, esta_eliminado)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, valores(req.body))
 res.status(201).json({ Id: r.insertId })
})

router.put("/:id", requierePermiso("SORTEOS_EDITAR"), async (req, res) => {
 await query(
  `UPDATE sorteos
   SET nombre = ?, fecha_evento = ?, valor = ?, oportunidades_por_boleta = ?, cantidad_cifras = ?,
       numero_ganador = ?, tema_id = ?, activo = ?, premio = ?, esta_eliminado = ?
   WHERE id = ?`, [...valores(req.body), req.params.id])
 res.status(204).end()
})

// Borrado lógico
router.delete("/:id", requierePermiso("SORTEOS_ELIMINAR"), async (req, res) => {
 await query("UPDATE sorteos SET esta_eliminado = 1 WHERE id = ?", [req.params.id])
 res.status(204).end()
})

module.exports = router
