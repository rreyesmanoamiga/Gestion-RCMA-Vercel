export interface Colegio {
  colegio: string;
  territorio: string;
  eco: string;
}

export const COLEGIOS: Colegio[] = [
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

export const TERRITORIOS: string[] = ["NORTE", "MEXICO", "FMA"];

export const getColegiosByTerritorio = (territorio: string): string[] =>
  COLEGIOS.filter(c => c.territorio === territorio).map(c => c.colegio);

export const getColegioInfo = (colegio: string): Colegio | null =>
  COLEGIOS.find(c => c.colegio === colegio) ?? null;
// ─── Nombre completo ↔ código ────────────────────────────────────────────────
// Ticket MAS y Solicitudes guardan el colegio con su nombre completo
// ("Mano Amiga Monterrey"); el resto de las tablas y Accesos usan el código
// ("MA MTY"). Estas funciones permiten comparar ambos (igual que Directorio).
export const NOMBRE_COMPLETO: Record<string, string> = {
  'MA ACA': 'Mano Amiga Acapulco',      'MA AGS': 'Mano Amiga Aguascalientes', 'MA CAN': 'Mano Amiga Cancún',
  'MA CHA': 'Mano Amiga Chalco',        'MA CIM': 'Mano Amiga La Cima',        'MA CON': 'Mano Amiga Conkal',
  'MA GDL': 'Mano Amiga Guadalajara',   'MA LEO': 'Mano Amiga León',           'MA LER': 'Mano Amiga Lerma',
  'MA MOR': 'Mano Amiga Morelia',       'MA MTY': 'Mano Amiga Monterrey',      'MA PIE': 'Mano Amiga Piedras Negras',
  'MA PUE': 'Mano Amiga Puebla',        'MA QRO': 'Mano Amiga Querétaro',      'MA SCA': 'Mano Amiga Santa Catarina',
  'MA TAP': 'Mano Amiga Tapachula',     'MA TIJ': 'Mano Amiga Tijuana',        'MA TOR': 'Mano Amiga Torreón',
  'MA VSJ': 'Mano Amiga Villas de San Juan', 'MA ZOM': 'Mano Amiga Zomeyucan',
  'CLIN COT': 'Clínica Cotija',         'CLIN LER': 'Clínica Lerma',
};
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CODIGO_POR_NOMBRE: Record<string, string> = Object.fromEntries(
  Object.entries(NOMBRE_COMPLETO).map(([cod, nom]) => [sinAcentos(nom), cod]),
);
/** Regresa el código ("MA MTY") tanto si recibe el código como el nombre completo. */
export const normalizarColegio = (v?: string | null): string =>
  !v ? '' : (CODIGO_POR_NOMBRE[sinAcentos(v)] ?? v.trim());
/** Las dos formas en que puede venir guardado un colegio (para filtros en la consulta). */
export const variantesColegio = (codigo: string): string[] =>
  NOMBRE_COMPLETO[codigo] ? [codigo, NOMBRE_COMPLETO[codigo]] : [codigo];
