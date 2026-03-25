const mongoose = require("mongoose")

const SorteoSchema = new mongoose.Schema({
  Nombre:               String,
  FechaEvento:          Date,
  Valor:                Number,
  OportunidadesPorBoleta: Number,
  CantidadCifras:       Number,
  TemaId:               mongoose.Schema.Types.ObjectId,
  Activo:               Boolean,
  EstaEliminado:        Boolean
}, { collection: "sorteos" })   // ajusta el nombre de la colección si es diferente

module.exports = mongoose.model("sorteos", SorteoSchema)
