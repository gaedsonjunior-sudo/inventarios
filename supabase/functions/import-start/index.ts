// supabase/functions/import-start/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw Object.assign(new Error("Não autenticado"), { status: 401 });

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    throw Object.assign(new Error("Sessão inválida"), { status: 401 });
  }

  // Opcional: só usuários com app_metadata.role = 'admin'
  const role = (user.app_metadata && user.app_metadata.role) ||
    (user.user_metadata && user.user_metadata.role) ||
    "";
  // Se existir role definido em algum usuário do projeto, exigir admin.
  // Se ninguém tiver role, qualquer usuário autenticado pode importar (primeiro setup).
  // Recomendado: no Dashboard → Authentication → Users → user → App Metadata:
  //   { "role": "admin" }
  if (role && role !== "admin") {
    throw Object.assign(new Error("Sem permissão de administrador"), { status: 403 });
  }

  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const user = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const filename = body.filename || "upload.xlsx";
    const replaceAll = !!body.replace_all;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (replaceAll) {
      await sb.from("lancamentos").delete().neq("id", 0);
    }

    const { data, error } = await sb
      .from("import_batches")
      .insert({
        filename,
        total_linhas: 0,
        inseridos: 0,
        duplicados: 0,
        erros: 0,
        erros_detalhe: [],
        created_by: user.email || user.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ batch_id: data.id, replace_all: replaceAll, user: user.email }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const status = e?.status || 500;
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
