// src/services/costosIA.ts

// ─── Mapeo: clave de colegio → ciudad real para el prompt de IA ───────────────
const COLEGIO_A_CIUDAD: Record<string, string> = {
  'MA AGS':   'Aguascalientes, Aguascalientes',
  'MA GDL':   'Guadalajara, Jalisco',
  'MA CIM':   'Ciudad de México (CDMX)',
  'MA LEO':   'León, Guanajuato',
  'MA MTY':   'Monterrey, Nuevo León',
  'MA PIE':   'Piedras Negras, Coahuila',
  'MA SCA':   'Saltillo, Coahuila',
  'MA TIJ':   'Tijuana, Baja California',
  'MA TOR':   'Torreón, Coahuila / La Laguna',
  'MA VSJ':   'Villahermosa, Tabasco',
  'MA ACA':   'Acapulco, Guerrero',
  'MA CAN':   'Cancún, Quintana Roo',
  'MA CHA':   'Chalco, Estado de México',
  'MA CON':   'Conkal, Yucatán (área Mérida)',
  'MA LER':   'Lerdo, Durango / Comarca Lagunera',
  'MA MOR':   'Morelia, Michoacán',
  'MA PUE':   'Puebla, Puebla',
  'MA QRO':   'Querétaro, Querétaro',
  'MA TAP':   'Tapachula, Chiapas',
  'MA ZOM':   'Zona Metropolitana CDMX',
  'CLIN COT': 'Coyoacán, Ciudad de México',
  'CLIN LER': 'Lerdo, Durango',
  'OF. MTY':  'Monterrey, Nuevo León',
  'OF. CDMX': 'Ciudad de México (CDMX)',
  'GENERAL':  'México (precios nacionales de referencia)',
};

export const getCiudadDeColegio = (colegio: string): string =>
  COLEGIO_A_CIUDAD[colegio] ?? colegio;

export interface ConceptoCotizacion {
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  estado_mercado: 'Precio normal' | 'Sobrecosto' | 'Precio bajo' | 'No verificado';
  porcentaje_variacion: number;
}

export interface ResultadoAnalisis {
  folio: string;
  proveedor: string;
  total: number;
  decision: 'Aprobada' | 'Revisión' | 'Rechazada';
  notas: string;
  ahorro: number;
  porcentaje_sobrecosto: number;
  conceptos: ConceptoCotizacion[];
  resumen_ejecutivo: string;
}

export const analizarCotizacion = async (
  texto: string,
  colegio: string = 'GENERAL'
): Promise<ResultadoAnalisis> => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

  if (!API_KEY) {
    throw new Error('No se encontró VITE_GEMINI_API_KEY en las variables de entorno.');
  }

  const ciudad = getCiudadDeColegio(colegio);
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

  const prompt = `Eres un Ingeniero de Costos y Presupuestos experto en construcción, instalaciones y servicios en México, especializado en el mercado de ${ciudad}.

Esta cotización es para el colegio/plantel: ${colegio} ubicado en ${ciudad}.
Los precios deben evaluarse contra el mercado LOCAL de esa ciudad y región, considerando:
- Costos de fletes y logística regionales
- Disponibilidad local de materiales
- Tarifas de mano de obra de la plaza
- Proveedores regionales típicos

CRITERIOS DE EVALUACIÓN (mercado ${ciudad}, 2024-2025):
- Mano de obra: oficial $350-550/día (varía por región: CDMX/GDL/MTY más alto, ciudades medianas más bajo)
- Materiales: compara contra precios de distribuidores locales de la plaza
- Un precio 10-15% arriba del mercado local → "Revisión"
- Un precio más del 15% arriba del mercado local → "Rechazada"
- Precios dentro del ±10% del mercado local → "Aprobada"

TEXTO DE LA COTIZACIÓN:
"""
${texto.substring(0, 3500)}
"""

INSTRUCCIONES:
1. Extrae TODOS los conceptos con sus cantidades y precios
2. Evalúa cada concepto contra precios de mercado en ${ciudad}
3. Calcula el porcentaje de variación de cada concepto vs mercado local
4. Da una decisión global basada en el análisis
5. Calcula el ahorro potencial si los precios estuvieran en precio de mercado local

Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto adicional):
{
  "folio": "número o código de la cotización, o 'Sin folio' si no aparece",
  "proveedor": "nombre del proveedor o empresa cotizante",
  "total": número total de la cotización,
  "decision": "Aprobada" | "Revisión" | "Rechazada",
  "notas": "explicación clara de la decisión considerando el mercado de ${ciudad}",
  "ahorro": número (ahorro potencial en MXN si se negocian precios al mercado local, 0 si está aprobada),
  "porcentaje_sobrecosto": número (% promedio de sobrecosto vs mercado local, 0 si es normal),
  "resumen_ejecutivo": "resumen de 1-2 oraciones para el coordinador/director",
  "conceptos": [
    {
      "descripcion": "descripción del concepto",
      "unidad": "m2, ml, pza, hr, etc.",
      "cantidad": número,
      "precio_unitario": número,
      "total": número,
      "estado_mercado": "Precio normal" | "Sobrecosto" | "Precio bajo" | "No verificado",
      "porcentaje_variacion": número (ej: 25 = 25% arriba del mercado local, -10 = 10% abajo)
    }
  ]
}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',  // fuerza respuesta JSON puro
      }
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Error de API Gemini (${response.status}): ${errBody}`);
  }

  const res = await response.json();

  if (!res.candidates || res.candidates.length === 0) {
    const blockReason = res.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `La IA bloqueó la solicitud: ${blockReason}`
        : 'La IA no devolvió resultados. Verifica tu API Key de Gemini.'
    );
  }

  // Extraemos todo el texto de la respuesta (filtrando partes "thought" del thinking mode)
  const parts = res.candidates[0].content?.parts ?? [];
  const rawText: string = parts
    .filter((p: any) => !p.thought && p.text)
    .map((p: any) => p.text)
    .join('');

  if (!rawText) {
    throw new Error('La IA no devolvió texto. Intenta de nuevo.');
  }

  // Con responseMimeType=application/json el texto ya es JSON puro
  // pero hacemos limpieza por si acaso
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned) as ResultadoAnalisis;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as ResultadoAnalisis;
      } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          return JSON.parse(cleaned.slice(start, end + 1)) as ResultadoAnalisis;
        }
      }
    }
    throw new Error('La IA devolvió una respuesta en formato incorrecto. Intenta de nuevo.');
  }
};