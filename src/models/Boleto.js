const mongoose = require("mongoose")

const NumeroSchema = new mongoose.Schema({
 Numero:Number
},{_id:false})

const BoletoSchema = new mongoose.Schema({

 SorteoId:String,

 Estado:Number,

 Precio:Number,

 Nombre:String,

 Identificacion:String,

 FechaCreacion:Date,

 FechaVenta:Date,

 FechaValidacion:Date,

 Latitud:Number,

 Longitud:Number,

 Numeros:[NumeroSchema]

},{collection:"boletas"})

module.exports = mongoose.model("boletas",BoletoSchema)