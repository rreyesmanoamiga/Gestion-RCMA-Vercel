// src/services/costosIA.ts
export const analizarCotizacion = async (texto: string, estado: string) => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  // Usamos el modelo 1.5-flash que es ideal para extraer datos de texto largo
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

  const prompt = {
    contents: [{
      parts: [{
        text: `Eres un Ingeniero de Costos experto en México. 
        Analiza el siguiente texto extraído de una cotización para el estado de ${estado}: "${texto}". 
        
        Extrae y responde ÚNICAMENTE en formato JSON con esta estructura: 
        { 
          "folio": "string", 
          "proveedor": "string", 
          "total": number, 
          "decision": "Aprobada" o "Revisión", 
          "notas": "string", 
          "ahorro": number, 
          "conceptos": [] 
        }`
      }]
    }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prompt)
  });

  const res = await response.json();
  
  if (!res.candidates || res.candidates.length === 0) {
    throw new Error("La IA no devolvió resultados. Revisa tu API Key.");
  }

  // Limpiamos el posible formato markdown que a veces agrega la IA
  const rawText = res.candidates[0].content.parts[0].text;
  const cleanJson = rawText.replace(/```json|```/g, "").trim();
  
  return JSON.parse(cleanJson);
};