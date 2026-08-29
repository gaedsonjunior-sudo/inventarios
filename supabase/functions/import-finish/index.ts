// supabase/functions/import-finish/index.ts
// Finaliza lote e devolve relatório de auditoria (filtros opcionais + checkpoints)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  const role = (user.app_metadata && user.app_metadata.role) ||
    (user.user_metadata && user.user_metadata.role) || "";
  if (role && role !== "admin") {
    throw Object.assign(new Error("Sem permissão de administrador"), { status: 403 });
  }
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const batchId = body.batch_id as string;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Totais globais do batch
    const { data: batch } = await sb.from("import_batches").select("*").eq("id", batchId).single();

    // Somas globais da base
    const { data: glob } = await sb.rpc("api_auditoria", {});

    // Checkpoint padrão BI (Ourinhos / ago / Açougue) — pode sobrescrever no body
    const checkpoints = body.checkpoints || [
      {
        nome: "Ourinhos · ago · Açougue (Inventário 5201/5601)",
        p_loja: "Ourinhos",
        p_mes: "ago",
        p_depto: "Açougue",
        esperado: {
          "5201_abs": 11240,
          "5601_abs": 19353,
          resultado_inv: -8113,
        },
      },
    ];

    const checkpointResults = [];
    for (const cp of checkpoints) {
      const { data: aud } = await sb.rpc("api_auditoria", {
        p_regional: cp.p_regional || null,
        p_loja: cp.p_loja || null,
        p_depto: cp.p_depto || null,
        p_mes: cp.p_mes || null,
        p_data_ini: cp.p_data_ini || null,
        p_data_fim: cp.p_data_fim || null,
      });

      const porDoc = (aud?.por_documento || []) as Array<Record<string, unknown>>;
      const d5201 = porDoc.find((d) => d.cod_dcto === "5201");
      const d5601 = porDoc.find((d) => d.cod_dcto === "5601");
      const abs5201 = Number(d5201?.soma_abs || 0);
      const abs5601 = Number(d5601?.soma_abs || 0);
      const resInv = Number(d5201?.soma_apresentacao || 0) + Number(d5601?.soma_apresentacao || 0);

      const esp = cp.esperado || {};
      const checks = [];
      if (esp["5201_abs"] != null) {
        checks.push({
          campo: "5201 soma abs",
          esperado: esp["5201_abs"],
          obtido: abs5201,
          ok: Math.abs(abs5201 - Number(esp["5201_abs"])) < 1,
        });
      }
      if (esp["5601_abs"] != null) {
        checks.push({
          campo: "5601 soma abs",
          esperado: esp["5601_abs"],
          obtido: abs5601,
          ok: Math.abs(abs5601 - Number(esp["5601_abs"])) < 1,
        });
      }
      if (esp.resultado_inv != null) {
        checks.push({
          campo: "Resultado inventário",
          esperado: esp.resultado_inv,
          obtido: Math.round(resInv * 100) / 100,
          ok: Math.abs(resInv - Number(esp.resultado_inv)) < 1,
        });
      }

      checkpointResults.push({
        nome: cp.nome,
        auditoria: aud,
        abs_5201: abs5201,
        abs_5601: abs5601,
        resultado_inventario: Math.round(resInv * 100) / 100,
        checks,
        aprovado: checks.length ? checks.every((c) => c.ok) : null,
      });
    }

    // Atualiza somas no batch
    if (batchId && glob) {
      await sb.from("import_batches").update({
        soma_valor_apresentacao: glob.resultado_total,
      }).eq("id", batchId);
    }

    return new Response(
      JSON.stringify({
        batch,
        global: glob,
        checkpoints: checkpointResults,
      }),
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
