# Notas da repaginação visual

## O que mudou

- Criada a folha compartilhada `theme.css` com identidade visual em azul-marinho e azul pastel, mais acentos discretos em vermelho e amarelo.
- `index.html` e `admin.html` carregam a mesma folha de estilos.
- Ajustados aparência e espaçamento de cartões, cabeçalho, tabelas, filtros, botões, modais e formulários, com regras responsivas para celular.

## O que foi preservado

Esta entrega é somente visual. `app.js`, configuração Supabase, SQL, RPCs, funções de importação, IDs e eventos existentes não foram modificados. Nenhuma regra de negócio ou política do banco foi alterada.

## Publicação no GitHub Pages

Publique `theme.css` junto com `index.html`, `admin.html`, `app.js` e os demais arquivos que já fazem parte do site. Como os HTMLs agora referenciam `theme.css`, o arquivo precisa ficar no mesmo diretório. Se o navegador ainda mostrar o tema anterior, faça uma atualização forçada/limpe o cache.

## Segurança do backend

Não é possível ocultar do F12/DevTools a URL de um backend usado diretamente pelo navegador; o endereço também aparece nas requisições de rede. Isso independe da aparência da página. A chave `anon`/public é feita para estar no cliente e não deve ser confundida com a chave `service_role`, que nunca deve ir para o frontend.

A inspeção do `schema.sql` encontrou políticas abertas de leitura (`using (true)`) para tabelas incluindo `lancamentos`, permissões de escrita para usuários autenticados e funções `upsert_*` concedidas a usuários autenticados. Isso não foi alterado para respeitar o escopo solicitado. Antes de considerar a implantação segura para dados confidenciais, revise essas políticas no Supabase: use RLS com privilégio mínimo, restrinja ações administrativas a usuários realmente autorizados e mantenha qualquer segredo/chave de serviço exclusivamente no servidor. Ocultar ou ofuscar a URL/chave no HTML não substitui essas proteções.
