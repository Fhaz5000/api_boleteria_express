const express = require("express")
const { query, normalizar } = require("../db")
const { requierePermiso } = require("../auth")

const router = express.Router()

const SELECT = `
 SELECT id AS Id, nombre AS Nombre, imagen AS Imagen, celular AS Celular,
        color_texto AS ColorTexto, texto_posterior AS TextoPosterior,
        texto_principal AS TextoPrincipal, color_fondo AS ColorFondo,
        color_letra AS ColorLetra, activo AS Activo
 FROM temas`

const tema = f => normalizar(f, { bools: ["Activo"] })

function valores(t){
 return [t.Nombre, t.Imagen, t.Celular, t.ColorTexto, t.TextoPosterior,
         t.TextoPrincipal, t.ColorFondo, t.ColorLetra, t.Activo ? 1 : 0]
}

router.get("/", async (req, res) => {
 res.json((await query(`${SELECT} ORDER BY id DESC`)).map(tema))
})

router.get("/activos", async (req, res) => {
 res.json((await query(`${SELECT} WHERE activo = 1 ORDER BY id DESC`)).map(tema))
})

// Tema activo más reciente (el que usa el PDF)
router.get("/activo", async (req, res) => {
 const [t] = await query(`${SELECT} WHERE activo = 1 ORDER BY id DESC LIMIT 1`)
 res.json(t ? tema(t) : null)
})

// ?ids=1,2,3
router.get("/por-ids", async (req, res) => {
 const ids = [...new Set(String(req.query.ids || "").split(",").map(Number).filter(n => n > 0))]
 if(ids.length === 0) return res.json([])
 res.json((await query(`${SELECT} WHERE id IN (?)`, [ids])).map(tema))
})

router.get("/:id", async (req, res) => {
 const [t] = await query(`${SELECT} WHERE id = ? LIMIT 1`, [req.params.id])
 res.json(t ? tema(t) : null)
})

router.post("/", requierePermiso("TEMAS_EDITAR"), async (req, res) => {
 const r = await query(
  `INSERT INTO temas (nombre, imagen, celular, color_texto, texto_posterior,
                      texto_principal, color_fondo, color_letra, activo)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, valores(req.body))
 res.status(201).json({ Id: r.insertId })
})

router.put("/:id", requierePermiso("TEMAS_EDITAR"), async (req, res) => {
 await query(
  `UPDATE temas
   SET nombre = ?, imagen = ?, celular = ?, color_texto = ?, texto_posterior = ?,
       texto_principal = ?, color_fondo = ?, color_letra = ?, activo = ?
   WHERE id = ?`, [...valores(req.body), req.params.id])
 res.status(204).end()
})

router.delete("/:id", requierePermiso("TEMAS_ELIMINAR"), async (req, res) => {
 await query("DELETE FROM temas WHERE id = ?", [req.params.id])
 res.status(204).end()
})

module.exports = router
