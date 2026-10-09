const jwt = require("jsonwebtoken")

const SUPERADMIN = "SUPERADMIN"

// Mismo catálogo que Core/Models/Permisos.cs de la APP .NET
const PERMISOS = [
 "TEMAS_VER", "TEMAS_EDITAR", "TEMAS_ELIMINAR",
 "SORTEOS_VER", "SORTEOS_EDITAR", "SORTEOS_ELIMINAR",
 "BOLETAS_VER", "BOLETAS_GENERAR", "BOLETAS_PDF", "PREMIOS_ASIGNAR"
]

function esSuperAdmin(rol){
 return String(rol || "").toUpperCase() === SUPERADMIN
}

function firmarToken(usuario, permisos){
 return jwt.sign(
  { id: usuario.Id, username: usuario.Username, rol: usuario.Rol, permisos },
  process.env.JWT_SECRET,
  { expiresIn: "12h" }
 )
}

// Exige el token que entrega /api/auth/login (cabecera Authorization: Bearer ...)
function requiereSesion(req, res, next){
 const cabecera = req.headers.authorization || ""
 const token = cabecera.startsWith("Bearer ") ? cabecera.substring(7) : ""

 try{
  req.usuario = jwt.verify(token, process.env.JWT_SECRET)
  next()
 }catch{
  res.status(401).json({ mensaje: "La sesión venció o no es válida. Vuelva a iniciar sesión." })
 }
}

// Exige uno de los permisos indicados (el SUPERADMIN los tiene todos)
function requierePermiso(...codigos){
 return (req, res, next) => {
  const u = req.usuario
  if(esSuperAdmin(u.rol) || codigos.some(c => (u.permisos || []).includes(c))) return next()
  res.status(403).json({ mensaje: "Tu rol no tiene permiso para esta acción." })
 }
}

function requiereSuperAdmin(req, res, next){
 if(esSuperAdmin(req.usuario.rol)) return next()
 res.status(403).json({ mensaje: "Solo el SUPERADMIN puede administrar usuarios y roles." })
}

module.exports = { PERMISOS, esSuperAdmin, firmarToken, requiereSesion, requierePermiso, requiereSuperAdmin }
