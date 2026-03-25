require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const crypto = require("crypto")

const Boleto = require("./src/models/Boleto")
const Sorteo = require("./src/models/Sorteo") 
const app = express()

app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3010
const HMAC_KEY = process.env.HMAC_KEY

// Conexión MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB conectado"))
.catch(err=>console.log("Error MongoDB:",err))


/*
VALIDAR TOKEN GENERADO EN .NET
Formato:
{boletaId}|{sorteoId}|{expira}|{firma}
*/

function validarToken(token){

 try{

  const partes = token.split("|")

  if(partes.length !== 4){
   return {valido:false,mensaje:"Token inválido"}
  }

  const boletaId = partes[0]
  const sorteoId = partes[1]
  const expira = partes[2]
  const firma = partes[3]

  const payload = `${boletaId}|${sorteoId}|${expira}`

  const hmac = crypto.createHmac("sha256", HMAC_KEY)
  const hash = hmac.update(payload).digest()

  const firmaCalculada = hash
   .slice(0,16)
   .toString("base64")
   .replace(/\+/g,"-")
   .replace(/\//g,"_")
   .replace(/=/g,"")

  if(firmaCalculada !== firma){
   return {valido:false,mensaje:"Firma inválida"}
  }

  const ahora = Math.floor(Date.now()/1000)

  if(ahora > expira){
   return {valido:false,mensaje:"Token expirado"}
  }

  return {
   valido:true,
   boletaId,
   sorteoId
  }

 }catch(err){
  return {valido:false,mensaje:"Error validando token"}
 }

}


//////////////////////////////////////////////////////
// VALIDAR BOLETO
//////////////////////////////////////////////////////

app.post("/api/boleto/validar", async (req,res)=>{

 try{

  const token = req.body?.token

  if(!token){
   return res.status(400).json({
    valido:false,
    mensaje:"Token requerido"
   })
  }

  const resultado = validarToken(token)
  if(!resultado.valido){
   return res.json(resultado)
  }

  // validar ObjectId
  if(!mongoose.Types.ObjectId.isValid(resultado.boletaId)){
   return res.json({
    valido:false,
    mensaje:"Id de boleta inválido"
   })
  }

  const boleto = await Boleto.findById(resultado.boletaId)

  if(!boleto){
   return res.json({
    valido:false,
    mensaje:"Boleto no existe"
   })
  }

  if(boleto.Estado !== 1){
   return res.json({
    valido:false,
    mensaje:"Boleto no disponible"
   })
  }

  res.json({
   valido:true,
   mensaje:"Boleto disponible",
   boleto
  })

 }catch(err){

  console.log(err)

  res.status(500).json({
   valido:false,
   mensaje:"Error del servidor"
  })

 }

})


//////////////////////////////////////////////////////
// COMPRAR BOLETO
//////////////////////////////////////////////////////

app.post("/api/boleto/comprar", async (req,res)=>{

 try{

  const {token,nombre,identificacion} = req.body

  if(!token){
   return res.status(400).json({
    valido:false,
    mensaje:"Token requerido"
   })
  }

  const resultado = validarToken(token)

  if(!resultado.valido){
   return res.json(resultado)
  }

  if(!mongoose.Types.ObjectId.isValid(resultado.boletaId)){
   return res.json({
    valido:false,
    mensaje:"Id inválido"
   })
  }

  // actualización atómica
  const boleto = await Boleto.findOneAndUpdate(
   {
    _id:resultado.boletaId,
    Estado:1
   },
   {
    $set:{
     Estado:3,
     Nombre:nombre,
     Identificacion:identificacion,
     FechaVenta:new Date()
    }
   },
   {new:true}
  )

  if(!boleto){
   return res.json({
    valido:false,
    mensaje:"Boleto ya vendido o no disponible"
   })
  }

  res.json({
   valido:true,
   mensaje:"Boleto vendido",
   boleto
  })

 }catch(err){

  console.log(err)

  res.status(500).json({
   valido:false,
   mensaje:"Error del servidor"
  })

 }

})
//////////////////////////////////////////////////////
// SORTEO DEL DÍA DE HOY
//////////////////////////////////////////////////////

app.get("/api/sorteo/hoy", async (req, res) => {

  try {

    // Rango del día actual en UTC (00:00:00 → 23:59:59)
    const hoy = new Date()

    const inicio = new Date(hoy)
    inicio.setUTCHours(0, 0, 0, 0)

    const fin = new Date(hoy)
    fin.setUTCHours(23, 59, 59, 999)

    const sorteo = await Sorteo.findOne({
      FechaEvento:    { $gte: inicio, $lte: fin },
      Activo:         true,
      EstaEliminado:  false
    })

    if (!sorteo) {
      return res.status(404).json({
        ok: false,
        mensaje: "No hay sorteo programado para hoy"
      })
    }

    res.json({
      ok: true,
      sorteo
    })

  } catch (err) {

    console.log(err)

    res.status(500).json({
      ok: false,
      mensaje: "Error del servidor"
    })

  }

})

//////////////////////////////////////////////////////
// TEST API
//////////////////////////////////////////////////////

app.get("/", (req,res)=>{
 res.send("API Boleteria funcionando")
})


//////////////////////////////////////////////////////
// INICIAR SERVIDOR
//////////////////////////////////////////////////////

app.listen(PORT,()=>{
 console.log("Servidor corriendo en puerto " + PORT)
})
