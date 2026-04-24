import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, permissions } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'El campo email es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cliente admin con service_role — bypasea RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

    // 1. Enviar invitación
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });

    // Si el usuario ya existe no es error crítico, continuamos
    if (inviteError) {
      const msg = inviteError.message?.toLowerCase() ?? '';
      const isExisting = msg.includes('already') || msg.includes('exists') ||
        msg.includes('registered') || inviteError.status === 422 || inviteError.status === 400;
      if (!isExisting) {
        return new Response(
          JSON.stringify({ error: inviteError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Insertar/actualizar permisos con service_role (bypasea RLS)
    if (permissions) {
      const { error: permsError } = await supabaseAdmin
        .from('user_permissions')
        .upsert({ user_email: email, ...permissions }, { onConflict: 'user_email' });

      if (permsError) {
        return new Response(
          JSON.stringify({ error: 'Error al guardar permisos: ' + permsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
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