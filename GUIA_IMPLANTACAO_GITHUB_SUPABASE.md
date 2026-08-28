# Guia de implantação — Painel de Inventários

## 1. Convenção de sinais implementada

A classificação continua sendo determinada prioritariamente pelo campo `Cod Dcto`, conforme a tabela abaixo. O campo `valor` preserva o valor original da planilha; os campos internos `falta` e `sobra` permanecem positivos para permitir agregações sem ambiguidade. A apresentação, exportação CSV e evolução temporal aplicam a convenção solicitada para este sistema: **faltas aparecem com sinal negativo, enquanto sobras aparecem sem sinal negativo**.

| Cod Dcto | Tipo de ajuste | Natureza | Apresentação da falta | Apresentação da sobra |
|---|---|---|---:|---:|
| 6416 | Ajuste Normal | Sobra | — | positiva |
| 6417 | Ajuste Normal | Falta | negativa | — |
| 5200 | Ajuste TOP20 | Sobra | — | positiva |
| 5600 | Ajuste TOP20 | Falta | negativa | — |
| 5201 | Inventário Departamental | Sobra | — | positiva |
| 5601 | Inventário Departamental | Falta | negativa | — |

A regra aplicada é:

```text
Se natureza = Falta:
    valor_falta_interno = ABS(valor_original)
    valor_falta_apresentado = -ABS(valor_falta_interno)
    valor_sobra = 0

Se natureza = Sobra:
    valor_falta = 0
    valor_sobra = ABS(valor_original)
    valor_sobra_apresentado = ABS(valor_sobra)

Resultado Líquido = soma(valor_original)
```

Assim, um lançamento de falta de R$ 150,00 será exibido como `-R$ 150,00`, uma sobra de R$ 200,00 como `R$ 200,00` e o resultado líquido continuará preservando o sinal matemático original. A fonte da classificação continua centralizada em `DOCUMENT_TYPES`, no arquivo `client/src/data.ts`.

## 2. Estado atual do projeto

A leitura principal do painel é o **resultado líquido**, calculado como a soma do valor original das faltas e sobras. Os indicadores de faltas e sobras permanecem disponíveis como composição do saldo, mas as análises prioritárias são o resultado líquido por tipo de ajuste, departamento, loja e regional. A comparação por tipo destaca `Ajuste Normal`, `Ajuste TOP20` e `Inventário Departamental`.

A nova base `base_regionais.xlsx` foi incorporada ao modelo dimensional. Ela possui 75 lojas únicas, com as colunas `Regional`, `Cod Loja` e `Loja`; os códigos são apresentados nos filtros, rankings e detalhes de loja. A base de lançamentos continua relacionada pelo par `Regional + Loja`, preservando o código numérico fornecido pela base regional.

A versão entregue é um frontend React/Vite estático. Ela já contém a base analisada e agregada, os filtros, indicadores, rankings, gráfico mensal, detalhamento de produto, exportação CSV e área visual de atualização da base. A área de upload atualmente valida a seleção no frontend e informa que a persistência será executada na camada Supabase; ela ainda não envia arquivos para um banco remoto.

A base analisada contém **41.140 lançamentos**, uma regional operacional (`Regional 7 - Lins`), nove lojas, dois departamentos e os seis códigos de documento previstos. Não foram identificados códigos desconhecidos nem valores financeiros zerados durante o diagnóstico.

> Antes de publicar dados reais, substitua o módulo estático `client/src/data.ts` por consultas ao Supabase e mantenha a mesma camada de cálculo/presentation-sign para evitar divergência entre dashboard e banco.

## 3. Pré-requisitos

Será necessário ter uma conta no GitHub, um projeto no Supabase, Node.js em versão LTS, pnpm ou npm e o Supabase CLI instalado. O deploy do Vite deve publicar o diretório de saída `dist`; a documentação do Vite orienta configurar o `base`, habilitar GitHub Actions em **Settings → Pages** e publicar o artefato gerado pelo build [1].

No terminal, confira as versões:

```bash
node --version
pnpm --version
supabase --version
```

## 4. Criar o repositório GitHub

Crie um repositório, por exemplo `painel-inventarios`, e envie o projeto:

```bash
git init
git add .
git commit -m "feat: painel de inventarios"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/painel-inventarios.git
git push -u origin main
```

Não envie chaves secretas, arquivos `.env`, tokens pessoais ou a `service_role` do Supabase. A chave `service_role` ignora RLS e deve permanecer exclusivamente em backend seguro; nunca deve ser embutida no bundle do GitHub Pages [3].

## 5. Configurar o `base` do Vite

Abra `vite.config.ts`. Para um repositório de projeto publicado em `https://SEU_USUARIO.github.io/painel-inventarios/`, configure:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/painel-inventarios/",
  plugins: [react()],
});
```

Se a publicação for em `https://SEU_USUARIO.github.io/` ou em um domínio próprio, use `base: "/"`. O valor precisa corresponder ao caminho real; caso contrário, o HTML pode abrir sem carregar os arquivos JavaScript e CSS [1].

## 6. Criar o workflow do GitHub Pages

Crie `.github/workflows/deploy.yml`:

```yaml
name: Deploy Vite to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist/public

      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

No GitHub, abra **Settings → Pages**, selecione **GitHub Actions** como origem e aguarde a execução do workflow. O Vite recomenda publicar o diretório `dist`; neste scaffold, o build gera os arquivos finais em `dist/public`, por isso esse é o caminho do artefato no workflow [1].

## 7. Criar o projeto Supabase

No [Dashboard do Supabase](https://supabase.com/dashboard), crie um projeto e copie a URL do projeto e a chave pública/publicável. Para o browser, use apenas a URL e a chave pública. O cliente JavaScript é inicializado com `createClient(url, key)` e pode ser usado para consultas ao Postgres, autenticação e demais recursos [4].

No ambiente local, inicialize a estrutura:

```bash
supabase init
supabase login
supabase link --project-ref SEU_PROJECT_REF
```

O Supabase recomenda manter alterações de schema em arquivos de migration, testar localmente e enviar as migrations para o projeto remoto com `supabase db push` [2].

## 8. Schema inicial recomendado

Crie uma migration:

```bash
supabase migration new create_inventory_schema
```

No arquivo criado em `supabase/migrations/`, use o schema abaixo como ponto de partida:

```sql
create table if not exists public.regionais (
  id bigint generated always as identity primary key,
  codigo text unique,
  nome text not null unique
);

create table if not exists public.lojas (
  id bigint generated always as identity primary key,
  codigo text,
  nome text not null,
  regional_id bigint not null references public.regionais(id),
  unique (regional_id, nome)
);

create table if not exists public.departamentos (
  id bigint generated always as identity primary key,
  codigo text,
  nome text not null,
  unique (codigo, nome)
);

create table if not exists public.produtos (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  nome text not null,
  departamento_id bigint references public.departamentos(id)
);

create table if not exists public.tipos_documento (
  cod_dcto text primary key,
  tipo_ajuste text not null,
  natureza text not null check (natureza in ('Falta', 'Sobra')),
  ativo boolean not null default true
);

insert into public.tipos_documento (cod_dcto, tipo_ajuste, natureza) values
  ('6416', 'Ajuste Normal', 'Sobra'),
  ('6417', 'Ajuste Normal', 'Falta'),
  ('5200', 'Ajuste TOP20', 'Sobra'),
  ('5600', 'Ajuste TOP20', 'Falta'),
  ('5201', 'Inventário Departamental', 'Sobra'),
  ('5601', 'Inventário Departamental', 'Falta')
on conflict (cod_dcto) do update set
  tipo_ajuste = excluded.tipo_ajuste,
  natureza = excluded.natureza,
  ativo = excluded.ativo;

create table if not exists public.lancamentos (
  id bigint generated always as identity primary key,
  regional_id bigint not null references public.regionais(id),
  loja_id bigint not null references public.lojas(id),
  mes text not null,
  data date not null,
  departamento_id bigint not null references public.departamentos(id),
  produto_id bigint not null references public.produtos(id),
  cod_dcto text not null references public.tipos_documento(cod_dcto),
  especie text,
  quantidade_original numeric not null,
  valor_original numeric(14,2) not null,
  natureza text not null check (natureza in ('Falta', 'Sobra')),
  tipo_ajuste text not null,
  valor_falta numeric(14,2) generated always as
    (case when valor_original < 0 then abs(valor_original) else 0 end) stored,
  valor_sobra numeric(14,2) generated always as
    (case when valor_original > 0 then valor_original else 0 end) stored,
  resultado_liquido numeric(14,2) generated always as (valor_original) stored,
  quantidade_falta numeric(14,3) generated always as
    (case when quantidade_original < 0 then abs(quantidade_original) else 0 end) stored,
  quantidade_sobra numeric(14,3) generated always as
    (case when quantidade_original > 0 then quantidade_original else 0 end) stored,
  chave_deduplicacao text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists lancamentos_data_idx on public.lancamentos (data);
create index if not exists lancamentos_loja_idx on public.lancamentos (loja_id);
create index if not exists lancamentos_produto_idx on public.lancamentos (produto_id);
create index if not exists lancamentos_documento_idx on public.lancamentos (cod_dcto);
```

A coluna `chave_deduplicacao` deve ser calculada no importador com SHA-256 ou outra função determinística baseada nos campos da origem: regional, loja, data, departamento, produto, código do documento, quantidade e valor original. O importador deve usar `upsert` ou inserção com tratamento de conflito; nunca deve duplicar o lançamento para “corrigir” uma tentativa repetida.

## 9. RLS e perfis de acesso

Ative RLS em todas as tabelas expostas pelo Data API. RLS deve ser combinado com grants mínimos: políticas sozinhas não removem permissões já concedidas. A documentação do Supabase recomenda ativar RLS, revogar grants desnecessários, conceder apenas as operações necessárias e testar as políticas [3].

Uma política inicial para visualizadores autenticados pode ser:

```sql
alter table public.regionais enable row level security;
alter table public.lojas enable row level security;
alter table public.departamentos enable row level security;
alter table public.produtos enable row level security;
alter table public.tipos_documento enable row level security;
alter table public.lancamentos enable row level security;

revoke all on all tables in schema public from anon;
grant select on public.regionais, public.lojas, public.departamentos,
  public.produtos, public.tipos_documento, public.lancamentos to authenticated;

create policy "authenticated can read inventory catalog"
on public.regionais for select to authenticated using (true);
create policy "authenticated can read stores"
on public.lojas for select to authenticated using (true);
create policy "authenticated can read departments"
on public.departamentos for select to authenticated using (true);
create policy "authenticated can read products"
on public.produtos for select to authenticated using (true);
create policy "authenticated can read document types"
on public.tipos_documento for select to authenticated using (ativo = true);
create policy "authenticated can read launches"
on public.lancamentos for select to authenticated using (true);
```

Para administradores, recomenda-se uma tabela `profiles` associada a `auth.users`, com um campo `role` limitado a `admin` e `viewer`. A importação deve ocorrer via Edge Function ou backend seguro, validando o perfil antes de inserir. Não conceda `insert`, `update` ou `delete` diretamente ao browser sem revisar cuidadosamente as políticas.

## 10. Aplicar a migration

Teste localmente e depois envie ao projeto remoto:

```bash
supabase start
supabase db reset
supabase db push
supabase gen types typescript --project-id SEU_PROJECT_REF > client/src/database.types.ts
```

A geração dos tipos a partir do schema reduz divergências entre as tabelas e o código TypeScript [4]. A partir do momento em que as migrations estiverem em uso, evite alterar o schema remoto diretamente pelo SQL Editor; mantenha mudanças em migration files para não quebrar o histórico de deploy [2].

## 11. Conectar o frontend ao Supabase

Instale o cliente:

```bash
pnpm add @supabase/supabase-js
```

Crie `client/src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  throw new Error("Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY não configuradas.");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

Depois substitua a importação de `INVENTORY_ROWS` por consultas paginadas, views agregadas ou RPCs. Para crescimento de volume, não carregue toda a tabela para o browser; faça as agregações de faltas, sobras, resultado, lojas e departamentos no Postgres e envie apenas o recorte necessário ao dashboard.

## 12. Configurar secrets no GitHub

Em **Settings → Secrets and variables → Actions**, adicione:

| Secret | Conteúdo |
|---|---|
| `VITE_SUPABASE_URL` | URL pública do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública/publicável do Supabase |

Nunca adicione `SUPABASE_SERVICE_ROLE_KEY` ao workflow de frontend. Se uma Edge Function precisar dessa chave, configure-a nos secrets do próprio Supabase, não no bundle público.

## 13. Validar antes de publicar

Execute localmente:

```bash
pnpm exec tsc --noEmit
pnpm run build
pnpm run preview
```

Verifique manualmente que:

| Verificação | Resultado esperado |
|---|---|
| Card Total de faltas | Valor com sinal negativo, por exemplo `-R$ 3.216.398` |
| Card Total de sobras | Valor positivo, sem sinal negativo |
| Resultado líquido | Mantém sinal matemático original e é a métrica principal |
| Ranking de faltas | Valores negativos |
| Ranking de sobras | Valores positivos |
| Gráfico de faltas | Série negativa, abaixo do eixo quando aplicável |
| Filtro por documento | 6416/5200/5201 em Sobras; 6417/5600/5601 em Faltas |
| Exportação CSV | Coluna `Falta` com sinal negativo e `Sobra` positiva |
| RLS | Usuário viewer lê; somente admin importa |
| Duplicidade | Reimportação da mesma chave não cria nova linha |

## 14. Publicar

Após o build local e a revisão dos logs do GitHub Actions, faça push para `main`:

```bash
git add .
git commit -m "fix: exibir faltas com sinal negativo"
git push origin main
```

Abra a aba **Actions** para acompanhar o workflow. Depois, em **Settings → Pages**, confirme a URL publicada. O comando `vite preview` serve apenas para testar o build localmente e não é um servidor de produção [1].

## Referências

[1]: https://vite.dev/guide/static-deploy "Vite — Deploying a Static Site"

[2]: https://supabase.com/docs/guides/deployment/database-migrations "Supabase — Database Migrations"

[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase — Row Level Security"

[4]: https://supabase.com/docs/reference/javascript/initializing "Supabase — JavaScript Client Library"
