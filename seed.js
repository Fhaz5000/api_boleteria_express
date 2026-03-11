const mongoose = require("mongoose")
const Boleto = require("./src/models/Boleto")

mongoose.connect("mongodb://localhost:27017/boleteriaDB")

async function seed(){

 await Boleto.create({

  SorteoId:"1",
  Estado:1,
  Precio:1000,
  FechaCreacion:new Date(),

  Numeros:[
   {Numero:1},
   {Numero:2},
   {Numero:3}
  ]

 })

 console.log("Boleto creado")

 process.exit()

}

seed()