// src/pages/Cotizaciones.tsx
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { extraerTextoDePDF } from '../utils/pdfScanner';
import { analizarCotizacion } from '../services/costosIA';

export const Cotizaciones = () => {
  const [analizando, setAnalizando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);

  const procesarConIA = async () => {
    if (!archivo) return alert("Por favor, selecciona un archivo PDF primero.");
    
    setAnalizando(true);

    try {
      // 1. Extraer texto del PDF
      const textoExtraido = await extraerTextoDePDF(archivo);

      // 2. Analizar con la IA
      const analisis = await analizarCotizacion(textoExtraido, "Torreón");

      // 3. Insertar en la tabla nueva de Supabase
      const { error } = await supabase
        .from('analisis_cotizaciones')
        .insert([{
          folio: analisis.folio,
          proveedor: analisis.proveedor,
          estado_aprobacion: analisis.decision, 
          total_proveedor: analisis.total,
          ahorro_detectado: analisis.ahorro,
          notas_ia: analisis.notas,
          desglose_conceptos: analisis.conceptos,
          colegio_ubicacion: "Torreón"
        }]);

      if (error) throw error;
      
      alert("¡Análisis completado y guardado con éxito!");
      setArchivo(null);
      
    } catch (err: any) {
      console.error("Error en el proceso:", err);
      alert("Error: " + (err.message || "No se pudo procesar el archivo"));
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Analizador Inteligente de Cotizaciones</h1>
      
      <div className="bg-white shadow rounded-lg p-10 border-2 border-dashed border-gray-300 text-center">
        <input 
          type="file" 
          accept=".pdf" 
          className="mb-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)} 
        />

        <button 
          onClick={procesarConIA}
          disabled={analizando || !archivo}
          className={`px-6 py-2 rounded font-bold text-white ${
            analizando ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {analizando ? "La IA está trabajando..." : "Iniciar Análisis Automático"}
        </button>
      </div>
    </div>
  );
};