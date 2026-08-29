// supabase/functions/import-chunk/index.ts
// Recebe lote de linhas já parseadas no browser e grava no banco.
// Body: { batch_id, rows: [{ regional, loja, mes, data, cod_depto, depto, cod_produto, produto, cod_dcto, especie, qtde, valor }] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCS: Record<string, { tipo: string; nat: string }> = {
  "6416": { tipo: "N", nat: "S" },
  "6417": { tipo: "N", nat: "F" },
  "5200": { tipo: "T", nat: "S" },
  "5600": { tipo: "T", nat: "F" },
  "5201": { tipo: "I", nat: "S" },
  "5601": { tipo: "I", nat: "F" },
};

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  let s = String(v).trim();
  // 1.234,56 → 1234.56 | 1234.56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  s = s.replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 20000 && serial < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
      return epoch.toISOString().slice(0, 10);
    }
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function normalizeMes(v: unknown, dataStr: string | null): string {
  let m = String(v || "").toLowerCase().replace(".", "").trim();
  const map: Record<string, string> = {
    janeiro: "jan", fevereiro: "fev", marco: "mar", março: "mar",
    abril: "abr", maio: "mai", junho: "jun", julho: "jul",
    agosto: "ago", setembro: "set", outubro: "out", novembro: "nov", dezembro: "dez",
  };
  if (map[m]) return map[m];
  m = m.slice(0, 3);
  if (["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"].includes(m)) return m;
  if (dataStr) {
    const mm = parseInt(dataStr.slice(5, 7), 10);
    return ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][mm - 1] || "";
  }
  return m;
}

async function shaKey(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
    const body = await req.json();
    const batchId = body.batch_id as string;
    const rows = (body.rows || []) as Record<string, unknown>[];
    if (!batchId || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: "batch_id e rows obrigatórios" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let inseridos = 0;
    let duplicados = 0;
    let erros = 0;
    const errosDetalhe: string[] = [];

    // cache dimensão na request
    const cacheReg = new Map<string, number>();
    const cacheLoja = new Map<string, number>();
    const cacheDepto = new Map<string, number>();
    const cacheProd = new Map<string, number>();

    async function getRegional(nome: string) {
      if (cacheReg.has(nome)) return cacheReg.get(nome)!;
      const { data, error } = await sb.rpc("upsert_regional", { p_nome: nome });
      if (error) throw error;
      cacheReg.set(nome, data);
      return data as number;
    }
    async function getLoja(nome: string, regId: number) {
      const k = `${nome}|${regId}`;
      if (cacheLoja.has(k)) return cacheLoja.get(k)!;
      const { data, error } = await sb.rpc("upsert_loja", { p_nome: nome, p_regional_id: regId });
      if (error) throw error;
      cacheLoja.set(k, data);
      return data as number;
    }
    async function getDepto(cod: string, nome: string) {
      if (cacheDepto.has(nome)) return cacheDepto.get(nome)!;
      const { data, error } = await sb.rpc("upsert_depto", { p_codigo: cod || null, p_nome: nome });
      if (error) throw error;
      cacheDepto.set(nome, data);
      return data as number;
    }
    async function getProd(cod: string, nome: string, deptoId: number) {
      if (cacheProd.has(cod)) return cacheProd.get(cod)!;
      const { data, error } = await sb.rpc("upsert_produto", {
        p_codigo: cod,
        p_nome: nome,
        p_depto_id: deptoId,
      });
      if (error) throw error;
      cacheProd.set(cod, data);
      return data as number;
    }

    const toInsert: Record<string, unknown>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = body.offset ? body.offset + i + 1 : i + 1;
      try {
        const codDcto = String(row.cod_dcto ?? "").trim();
        const doc = DOCS[codDcto];
        if (!doc) {
          erros++;
          if (errosDetalhe.length < 50) errosDetalhe.push(`L${lineNum}: Cod Dcto ${codDcto} não reconhecido`);
          continue;
        }
        const valorOrig = parseNum(row.valor);
        const qtdeOrig = parseNum(row.qtde);
        if (valorOrig === null || qtdeOrig === null) {
          erros++;
          if (errosDetalhe.length < 50) errosDetalhe.push(`L${lineNum}: valor/qtde inválidos`);
          continue;
        }
        const dataStr = parseDate(row.data);
        if (!dataStr) {
          erros++;
          if (errosDetalhe.length < 50) errosDetalhe.push(`L${lineNum}: data inválida`);
          continue;
        }
        const regional = String(row.regional || "").trim();
        const loja = String(row.loja || "").trim();
        const depto = String(row.depto || "").trim();
        const codProd = String(row.cod_produto ?? "").trim();
        const produto = String(row.produto || "").trim();
        if (!regional || !loja || !depto || !codProd) {
          erros++;
          if (errosDetalhe.length < 50) errosDetalhe.push(`L${lineNum}: campos obrigatórios vazios`);
          continue;
        }

        const mes = normalizeMes(row.mes, dataStr);
        const absV = Math.abs(valorOrig);
        const absQ = Math.abs(qtdeOrig);
        const valorAp = doc.nat === "F" ? -absV : absV;
        const qtdeAp = doc.nat === "F" ? -absQ : absQ;

        // chave estável: inclui originais para não colidir ajustes legítimos diferentes
        const chave = await shaKey([
          regional, loja, dataStr, codProd, codDcto,
          String(qtdeOrig), String(valorOrig),
        ]);

        const regId = await getRegional(regional);
        const lojaId = await getLoja(loja, regId);
        const deptoId = await getDepto(String(row.cod_depto || ""), depto);
        const prodId = await getProd(codProd, produto || codProd, deptoId);

        toInsert.push({
          chave_unica: chave,
          regional_id: regId,
          loja_id: lojaId,
          departamento_id: deptoId,
          produto_id: prodId,
          mes,
          data: dataStr,
          cod_dcto: codDcto,
          tipo_codigo: doc.tipo,
          natureza_codigo: doc.nat,
          especie: row.especie ? String(row.especie) : null,
          quantidade_original: qtdeOrig,
          valor_original: valorOrig,
          quantidade_apresentacao: Math.round(qtdeAp * 10000) / 10000,
          valor_apresentacao: Math.round(valorAp * 100) / 100,
          import_batch_id: batchId,
        });
      } catch (e) {
        erros++;
        if (errosDetalhe.length < 50) errosDetalhe.push(`L${lineNum}: ${String(e)}`);
      }
    }

    if (toInsert.length) {
      const { data, error } = await sb
        .from("lancamentos")
        .upsert(toInsert, { onConflict: "chave_unica", ignoreDuplicates: true })
        .select("id");

      if (error) {
        // fallback: insert one-by-one counting dups
        for (const row of toInsert) {
          const { error: e2 } = await sb.from("lancamentos").insert(row);
          if (e2) {
            if (String(e2.message || "").includes("duplicate") || e2.code === "23505") {
              duplicados++;
            } else {
              erros++;
              if (errosDetalhe.length < 50) errosDetalhe.push(String(e2.message || e2));
            }
          } else {
            inseridos++;
          }
        }
      } else {
        inseridos = data?.length ?? toInsert.length;
        duplicados = toInsert.length - inseridos;
      }
    }

    // atualiza contadores do batch (incremento)
    const { data: batch } = await sb.from("import_batches").select("*").eq("id", batchId).single();
    if (batch) {
      await sb.from("import_batches").update({
        total_linhas: (batch.total_linhas || 0) + rows.length,
        inseridos: (batch.inseridos || 0) + inseridos,
        duplicados: (batch.duplicados || 0) + duplicados,
        erros: (batch.erros || 0) + erros,
        erros_detalhe: [...(batch.erros_detalhe || []), ...errosDetalhe].slice(0, 100),
      }).eq("id", batchId);
    }

    return new Response(
      JSON.stringify({ inseridos, duplicados, erros, erros_detalhe: errosDetalhe }),
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
