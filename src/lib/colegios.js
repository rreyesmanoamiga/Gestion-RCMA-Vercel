export const COLEGIOS = [
  { colegio: "MA AGS",    territorio: "NORTE",  eco: "Arq. Adrian Rodriguez López" },
  { colegio: "MA GDL",    territorio: "NORTE",  eco: "Arq. Armando B. Naranjo Rincón" },
  { colegio: "MA CIM",    territorio: "NORTE",  eco: "Arq. Juan Antonio Montoya Martinez" },
  { colegio: "MA LEO",    territorio: "NORTE",  eco: "Arq. Armando B. Naranjo Rincón" },
  { colegio: "MA MTY",    territorio: "NORTE",  eco: "Arq. Juan Antonio Montoya Martinez" },
  { colegio: "MA PIE",    territorio: "NORTE",  eco: "Arq. Juan Antonio Montoya Martinez" },
  { colegio: "MA SCA",    territorio: "NORTE",  eco: "Arq. Juan Antonio Montoya Martinez" },
  { colegio: "MA TIJ",    territorio: "NORTE",  eco: "Arq. Harold Fabricio Especiano Roa" },
  { colegio: "MA TOR",    territorio: "NORTE",  eco: "Arq. Juan Antonio Montoya Martinez" },
  { colegio: "MA VSJ",    territorio: "NORTE",  eco: "Arq. Armando B. Naranjo Rincón" },
  { colegio: "MA ACA",    territorio: "MEXICO", eco: "Ing. Enrique Antonio Gutierrez Herrera" },
  { colegio: "MA CAN",    territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "MA CHA",    territorio: "MEXICO", eco: "Ing. Enrique Antonio Gutierrez Herrera" },
  { colegio: "MA CON",    territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "MA LER",    territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "MA MOR",    territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "MA PUE",    territorio: "MEXICO", eco: "Ing. Enrique Antonio Gutierrez Herrera" },
  { colegio: "MA QRO",    territorio: "MEXICO", eco: "Ing. Enrique Antonio Gutierrez Herrera" },
  { colegio: "MA TAP",    territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "MA ZOM",    territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "CLIN COT",  territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "CLIN LER",  territorio: "MEXICO", eco: "Arq. Jaime Alejandro Tirado Oscoy" },
  { colegio: "OF. MTY",   territorio: "FMA",    eco: "-" },
  { colegio: "OF. CDMX",  territorio: "FMA",    eco: "-" },
  { colegio: "GENERAL",   territorio: "FMA",    eco: "-" },
];

export const TERRITORIOS = ["NORTE", "MEXICO", "FMA"];

export const getColegiosByTerritorio = (territorio) =>
  COLEGIOS.filter(c => c.territorio === territorio).map(c => c.colegio);

export const getColegioInfo = (colegio) =>
  COLEGIOS.find(c => c.colegio === colegio) || null;