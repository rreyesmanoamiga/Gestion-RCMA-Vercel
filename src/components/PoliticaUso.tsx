import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { ShieldCheck, FileText, Eye, Lock, AlertTriangle } from 'lucide-react';

const VERSION_POLITICA = '1.0';

export default function PoliticaUso() {
  const { user } = useAuth();
  const [mostrar, setMostrar] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const [leido, setLeido] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Solo aplica a usuarios externos (no @manoamiga.edu.mx)
    const esExterno = !user.email?.endsWith('@manoamiga.edu.mx');
    if (!esExterno) return;

    // Verificar si ya aceptó
    supabase
      .from('user_permissions')
      .select('politica_aceptada, politica_version')
      .eq('user_email', user.email)
      .single()
      .then(({ data }) => {
        const yaAcepto = data?.politica_aceptada === true &&
                         data?.politica_version === VERSION_POLITICA;
        if (!yaAcepto) setMostrar(true);
      });
  }, [user]);

  const handleAceptar = async () => {
    if (!user?.email) return;
    setAceptando(true);
    await supabase.from('user_permissions').update({
      politica_aceptada: true,
      politica_version:  VERSION_POLITICA,
      politica_fecha:    new Date().toISOString(),
    }).eq('user_email', user.email);
    setAceptando(false);
    setMostrar(false);
  };

  if (!mostrar) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Política de Uso del Sistema</h2>
              <p className="text-xs text-slate-500">Red de Colegios Mano Amiga — Sistema RCMA v{VERSION_POLITICA}</p>
            </div>
          </div>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4"
          onScroll={e => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) setLeido(true);
          }}>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Debes leer y aceptar estas condiciones antes de acceder al sistema.
              Tu aceptación queda registrada con fecha y hora.
            </p>
          </div>

          <Section icon={<Eye className="w-4 h-4" />} title="1. Acceso y uso autorizado">
            El acceso a este sistema ha sido otorgado exclusivamente para el desempeño de
            funciones específicas en el marco de la relación de servicios entre
            <strong> OR-SER / ECO </strong> y la <strong>Red de Colegios Mano Amiga</strong>.
            Queda prohibido el uso del sistema para cualquier fin distinto al autorizado.
          </Section>

          <Section icon={<Lock className="w-4 h-4" />} title="2. Confidencialidad de la información">
            Toda la información a la que tengas acceso —incluyendo estados de infraestructura,
            evaluaciones, documentos y datos de los colegios— es estrictamente confidencial y
            propiedad de la Red de Colegios Mano Amiga. Queda prohibido compartir, reproducir,
            transmitir o divulgar esta información a terceros sin autorización expresa y por
            escrito de Mano Amiga.
          </Section>

          <Section icon={<FileText className="w-4 h-4" />} title="3. Alcance del acceso">
            Tu acceso está limitado únicamente a los módulos y registros que te han sido
            asignados, correspondientes a tu territorio de operación. Cualquier intento de
            acceder a información fuera de tu alcance autorizado será considerado una
            violación a esta política.
          </Section>

          <Section icon={<ShieldCheck className="w-4 h-4" />} title="4. Seguridad de credenciales">
            Eres responsable de mantener la confidencialidad de tus credenciales de acceso.
            No debes compartir tu usuario ni contraseña con ninguna otra persona. Ante cualquier
            sospecha de uso no autorizado, debes notificar de inmediato a Mano Amiga.
          </Section>

          <Section icon={<AlertTriangle className="w-4 h-4" />} title="5. Consecuencias del incumplimiento">
            El incumplimiento de esta política puede derivar en la revocación inmediata del
            acceso al sistema, así como en las responsabilidades legales que correspondan
            conforme a la Ley Federal de Protección de Datos Personales en Posesión de los
            Particulares (LFPDPPP) y demás legislación aplicable.
          </Section>

          <div className="text-[11px] text-slate-400 text-center pt-2">
            Versión {VERSION_POLITICA} · Red de Colegios Mano Amiga · {new Date().getFullYear()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          {!leido && (
            <p className="text-xs text-slate-500 text-center mb-3">
              ↓ Desplázate hasta el final para habilitar el botón de aceptación
            </p>
          )}
          <label className="flex items-start gap-2 mb-3 cursor-pointer">
            <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)}
              className="mt-0.5 rounded" />
            <span className="text-xs text-slate-700">
              He leído y entendido la Política de Uso del Sistema RCMA y acepto cumplirla.
            </span>
          </label>
          <button
            disabled={!leido || aceptando}
            onClick={handleAceptar}
            className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition">
            {aceptando ? 'Registrando aceptación...' : 'Acepto las condiciones de uso'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-slate-500">{icon}</span>
        <p className="text-sm font-bold text-slate-800">{title}</p>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed pl-6">{children}</p>
    </div>
  );
}
