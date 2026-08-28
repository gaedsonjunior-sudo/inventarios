# Painel de Inventários e Ajustes de Estoque

## Publicar no GitHub Pages

### 1. Estrutura do repositório

Coloque **na raiz** do repositório (ou na pasta `/docs` se usar essa opção):

```
index.html
app.js
data.js
```

Não use subpastas para esses três arquivos.

### 2. Configurar o Pages

1. No GitHub: **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main` (ou `master`)
4. **Folder:** `/ (root)`  
   *(ou `/docs` se você colocou os arquivos dentro de `docs/`)*
5. Salve e aguarde 1–2 minutos

### 3. Acessar

A URL será:

```
https://SEU-USUARIO.github.io/NOME-DO-REPO/
```

Exemplo: `https://joao.github.io/painel-estoque/`

### Problemas comuns

| Problema | Solução |
|----------|---------|
| Página em branco | Abra o Console do navegador (F12). Veja se há erro 404 em `data.js` ou `app.js` |
| 404 nos arquivos | Confirme que os 3 arquivos estão na **raiz** do branch publicado |
| Demora para carregar | `data.js` tem ~7,5 MB — na primeira vez pode levar alguns segundos |
| Cache antigo | Ctrl+F5 ou aba anônima |

### Arquivos

| Arquivo | Função |
|---------|--------|
| `index.html` | Interface |
| `app.js` | Lógica do painel |
| `data.js` | Base de dados (41.139 lançamentos) |
