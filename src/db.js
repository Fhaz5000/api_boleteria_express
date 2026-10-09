const mysql = require("mysql2/promise")

// Pool de conexiones a la base MySQL de Hostinger
const pool = mysql.createPool({
 host: process.env.DB_HOST,
 port: Number(process.env.DB_PORT || 3306),
 user: process.env.DB_USER,
 password: process.env.DB_PASSWORD,
 database: process.env.DB_NAME,
 charset: "utf8mb4",
 waitForConnections: true,
 connectionLimit: 10,
 // Las fechas se guardan en hora Colombia sin zona: se devuelven tal cual, sin conversiones
 dateStrings: true,
 decimalNumbers: true
})

async function query(sql, params = []){
 const [rows] = await pool.query(sql, params)
 return rows
}

// "2026-12-24 00:00:00" (MySQL) -> "2026-12-24T00:00:00" (JSON que entiende .NET)
function fechaAJson(valor){
 if(valor === null || valor === undefined) return null
 return String(valor).replace(" ", "T")
}

// "2026-12-24T00:00:00.1234567" (.NET) -> "2026-12-24 00:00:00" (MySQL)
function fechaAMysql(valor){
 if(valor === null || valor === undefined || valor === "") return null
 return String(valor).substring(0, 19).replace("T", " ")
}

// Convierte columnas de fecha a ISO y columnas tinyint a true/false
function normalizar(fila, { fechas = [], bools = [] } = {}){
 if(!fila) return fila
 for(const c of fechas) if(c in fila) fila[c] = fechaAJson(fila[c])
 for(const c of bools) if(c in fila) fila[c] = fila[c] === null ? null : Boolean(Number(fila[c]))
 return fila
}

// Fecha y hora actuales en Colombia (UTC-5, sin horario de verano)
function ahoraColombia(){
 const d = new Date(Date.now() - 5 * 60 * 60 * 1000)
 return d.toISOString().substring(0, 19).replace("T", " ")
}

module.exports = { pool, query, fechaAJson, fechaAMysql, normalizar, ahoraColombia }
