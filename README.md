# Painel Inventários — Supabase + Importação Web

## Importação SEM CLI / SEM Edge Function (recomendado neste ambiente)

O `admin.html` grava **direto** no Postgres via sessão autenticada (PostgREST).

1. Rode `schema.sql` (ou, se já rodou, só `schema_import_direto.sql`)
2. Crie usuário em Authentication → Users
3. Publique o front (`admin.html`, `config.js`, …)
4. Login no admin → enviar Excel

**Não precisa** instalar Supabase CLI nem deploy de functions.

As pastas `supabase/functions/*` ficam opcionais (caso no futuro tenha CLI).


## Arquitetura

```
admin.html  →  parseia Excel no browser (arquivos 100MB+)
            →  envia lotes de ~400 linhas
            →  Edge Functions gravam no Postgres
            →  relatório de auditoria vs BI

index.html  →  só consome RPCs agregadas (leve)
```

**Não** hospede `data.js` / `data.js.gz` no GitHub.

---

## 1. Schema

No SQL Editor do Supabase, rode o arquivo `schema.sql` completo.

---

## 2. Auth do admin (Supabase Auth)

1. No Supabase: **Authentication → Users → Add user**
   - E-mail + senha do administrador
2. (Recomendado) No usuário → **App Metadata**:
   ```json
   { "role": "admin" }
   ```
   Se **nenhum** usuário tiver `role`, qualquer autenticado pode importar (útil no setup inicial).  
   Quando existir `role` em algum user, só quem tiver `"admin"` importa.

3. Em **Authentication → Providers**, deixe **Email** habilitado.

4. Secrets das functions (CLI injeta automaticamente no deploy):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

Não use mais `IMPORT_SECRET`.

---

## 3. Deploy das functions

```bash
# Na pasta do projeto (com supabase CLI logado)
supabase functions deploy import-start
supabase functions deploy import-chunk
supabase functions deploy import-finish
```

Arquivos em:

```
supabase/functions/import-start/index.ts
supabase/functions/import-chunk/index.ts
supabase/functions/import-finish/index.ts
```

---

## 4. Front (`config.js`)

```js
window.SUPABASE_URL = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbG...';
```

Publique: `index.html`, `app.js`, `config.js`, `admin.html`

---

## 5. Importar a base real (100MB+)

1. Abra `admin.html`
2. Faça login com e-mail/senha do Supabase Auth
3. Selecione o Excel
4. Marque **Substituir base inteira** na primeira carga
5. Confira/ajuste o checkpoint BI (padrão Ourinhos/ago/Açougue)
6. **Processar e importar**

O browser lê o arquivo localmente (nada de 100MB passando pela Edge Function de uma vez).  
Depois envia lotes de 400 linhas.

No final o relatório mostra:

| Check | Esperado (BI) | Obtido |
|-------|---------------|--------|
| 5201 soma abs | 11.240 | … |
| 5601 soma abs | 19.353 | … |
| Resultado inventário | −8.113 | … |

✅ **APROVADO** só se bater (tolerância R$ 1,00).

---

## Regra de valor

```
valor_original     = valor da planilha (inalterado)
natureza           = Cod Dcto (5201=Sobra, 5601=Falta, …)
valor_apresentacao = +ABS(original) se Sobra
                   = -ABS(original) se Falta
resultado          = SUM(valor_apresentacao)
```

---

## Requisitos do PC do admin

- Planilha 100MB+ precisa de **memória RAM** no browser (ideal 8GB+ livres)
- Chrome/Edge recomendados
- Não feche a aba durante o processo (pode levar 10–40 min conforme máquina e rede)

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| 401 Unauthorized | Sessão expirada ou usuário inválido — faça login de novo |
| 403 Sem permissão | App Metadata sem `role: admin` |
| Timeout no lote | Reduza `CHUNK` em admin.html (ex.: 200) |
| Checkpoint reprovado | Conferir se a planilha é a mesma do BI; ver Σ original por Cod Dcto no relatório |
| CORS | Redeploy das functions após ajustar headers |
