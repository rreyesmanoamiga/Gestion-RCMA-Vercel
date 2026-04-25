import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Actividades base del cronograma
const ACTIVIDADES_BASE = [
  { id: 1,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes interiores',       tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 2,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar banquinas y cornisas',     tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 3,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes exteriores',       tipo: 'Limpiar', frecuenciaDias: 730  },
  { id: 4,  categoria: 'Paredes y Acabados',    actividad: 'Renovar láminas deterioradas',     tipo: 'Renovar', frecuenciaDias: 1825 },
  { id: 5,  categoria: 'Pisos',                 actividad: 'Limpiar piso vinílico',            tipo: 'Limpiar', frecuenciaDias: 7    },
  { id: 6,  categoria: 'Pisos',                 actividad: 'Encerar pisos cerámicos',          tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 7,  categoria: 'Pisos',                 actividad: 'Limpiar rodapié',                  tipo: 'Limpiar', frecuenciaDias: 7    },
  { id: 8,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar láminas de cubierta',     tipo: 'Limpiar', frecuenciaDias: 90   },
  { id: 9,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar canoas',                  tipo: 'Limpiar', frecuenciaDias: 90   },
  { id: 10, categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar cubierta de techo',       tipo: 'Limpiar', frecuenciaDias: 120  },
  { id: 11, categoria: 'Techo y Red Pluvial',   actividad: 'Revisar anclajes de láminas',     tipo: 'Revisar', frecuenciaDias: 365  },
  { id: 12, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar puertas y ventanas',      tipo: 'Limpiar', frecuenciaDias: 30   },
  { id: 13, categoria: 'Puertas y Ventanas',    actividad: 'Lubricar bisagras y pivotes',     tipo: 'Limpiar', frecuenciaDias: 90   },
  { id: 14, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar canales de desagüe',      tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 15, categoria: 'Red de Agua Potable',   actividad: 'Limpiar llaves de paso',          tipo: 'Limpiar', frecuenciaDias: 365  },
  { id: 16, categoria: 'Red de Agua Potable',   actividad: 'Limpiar cajas de registro',       tipo: 'Limpiar', frecuenciaDias: 365  },
  { id: 17, categoria: 'Sanitarios',            actividad: 'Limpiar sanitarios',              tipo: 'Limpiar', frecuenciaDias: 1    },
  { id: 18, categoria: 'Sanitarios',            actividad: 'Revisar llaves y tuberías',       tipo: 'Revisar', frecuenciaDias: 1825 },
  { id: 19, categoria: 'Red Sanitaria',         actividad: 'Limpiar arquetas y trampas',      tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 20, categoria: 'Red Sanitaria',         actividad: 'Limpiar tanque séptico',          tipo: 'Limpiar', frecuenciaDias: 365  },
  { id: 21, categoria: 'Instalación Eléctrica', actividad: 'Limpiar apagadores y lámparas',  tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 22, categoria: 'Instalación Eléctrica', actividad: 'Limpiar difusores lámparas',     tipo: 'Limpiar', frecuenciaDias: 365  },
  { id: 23, categoria: 'Barandillas y Rejas',   actividad: 'Limpiar rejas y barandillas',    tipo: 'Limpiar', frecuenciaDias: 180  },
  { id: 24, categoria: 'Barandillas y Rejas',   actividad: 'Engrasar persianas enrollables', tipo: 'Renovar', frecuenciaDias: 1095 },
];

const FECHA_BASE = new Date('2025-01-01');

function caeEnFecha(frecuenciaDias: number, fecha: Date): boolean {
  const diffMs = fecha.getTime() - FECHA_BASE.getTime();
  const diffDias = Math.floor(diffMs / 86400000);
  return diffDias >= 0 && diffDias % frecuenciaDias === 0;
}

async function enviarCorreo(
  destinatario: string,
  actividades: { categoria: string; actividad: string; tipo: string }[],
  fechaStr: string
) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  // Construir HTML del correo
  const filasActividades = actividades.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">${a.actividad}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;">${a.categoria}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;">
        <span style="background:${a.tipo==='Limpiar'?'#dbeafe':a.tipo==='Renovar'?'#fef3c7':'#d1fae5'};color:${a.tipo==='Limpiar'?'#1d4ed8':a.tipo==='Renovar'?'#92400e':'#065f46'};padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;">
          ${a.tipo}
        </span>
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:600px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
        <div style="background:#0f172a;padding:28px 32px;">
          <h1 style="margin:0;color:white;font-size:18px;font-weight:900;letter-spacing:0.05em;text-transform:uppercase;">
            🔧 Sistema RCMA
          </h1>
          <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Recordatorio de Mantenimiento</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#334155;font-weight:600;">
            Tienes <strong>${actividades.length}</strong> actividad${actividades.length !== 1 ? 'es' : ''} de mantenimiento programada${actividades.length !== 1 ? 's' : ''} para mañana:
          </p>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${fechaStr}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Actividad</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Categoría</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Tipo</th>
              </tr>
            </thead>
            <tbody>${filasActividades}</tbody>
          </table>
          <div style="margin-top:24px;padding:16px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0ea5e9;">
            <p style="margin:0;font-size:13px;color:#0369a1;">
              💡 Ingresa al <strong>Calendario de Mantenimiento</strong> en el sistema para ver el cronograma completo.
            </p>
          </div>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
            Sistema RCMA — Coordinación de Obras © 2026
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Enviar via fetch a un relay SMTP o usar nodemailer-like approach
  // Usamos la API de correo de Supabase Auth que ya tiene el SMTP configurado
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Enviar usando fetch directo al SMTP via smtp2go o similar
  // Como tenemos Gmail configurado en Supabase, usamos el mismo endpoint
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ to: destinatario, subject: `🔧 Mantenimiento mañana: ${actividades.length} actividad${actividades.length!==1?'es':''}`, html }),
  }).catch(() => null);

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fecha de mañana
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    manana.setHours(0, 0, 0, 0);

    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const fechaStr = `${dias[manana.getDay()]} ${manana.getDate()} de ${meses[manana.getMonth()]} de ${manana.getFullYear()}`;

    // Calcular actividades base que caen mañana
    const actsManana = ACTIVIDADES_BASE.filter(a => caeEnFecha(a.frecuenciaDias, manana));

    // Cargar actividades personalizadas de Supabase
    const { data: customActs = [] } = await supabaseAdmin
      .from('custom_maintenance')
      .select('*');

    const customManana = (customActs as any[]).filter(a => caeEnFecha(a.frecuencia_dias, manana))
      .map(a => ({ categoria: a.categoria, actividad: a.actividad, tipo: a.tipo }));

    const todasManana = [
      ...actsManana.map(a => ({ categoria: a.categoria, actividad: a.actividad, tipo: a.tipo })),
      ...customManana,
    ];

    if (todasManana.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No hay actividades para mañana', fecha: fechaStr }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obtener todos los usuarios admin para notificar
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const admins = users.filter(u => u.user_metadata?.role === 'admin' || u.email);

    // Obtener emails de user_permissions
    const { data: perms = [] } = await supabaseAdmin
      .from('user_permissions')
      .select('user_email')
      .eq('role', 'admin');

    const adminEmails = [
      ...new Set([
        ...admins.slice(0, 1).map(u => u.email).filter(Boolean), // primer usuario (el tuyo)
        ...(perms as any[]).map(p => p.user_email),
      ])
    ];

    // Enviar correo a cada admin
    const resultados = await Promise.allSettled(
      adminEmails.map(email => enviarCorreo(email as string, todasManana, fechaStr))
    );

    return new Response(
      JSON.stringify({
        success: true,
        fecha: fechaStr,
        actividades: todasManana.length,
        correos_enviados: adminEmails.length,
        resultados: resultados.map(r => r.status),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});