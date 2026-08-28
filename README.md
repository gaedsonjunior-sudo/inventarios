# Painel de Inventários e Ajustes de Estoque

## Arquivos para o GitHub Pages (raiz do repositório)

```
index.html    → Painel principal
app.js        → Lógica
data.js       → Base de dados
admin.html    → Atualização da base (protegido por senha)
```

## GitHub Pages

1. Settings → Pages
2. Branch: main · Folder: / (root)
3. URL: `https://SEU-USUARIO.github.io/NOME-DO-REPO/`

## Atualizar a base

Acesse: `https://SEU-USUARIO.github.io/NOME-DO-REPO/admin.html`

- Senha padrão: `admin2026` (altere em `admin.html`, variável `ADMIN_PASSWORD`)
- Envie o Excel → processa no navegador → salva no IndexedDB
- O painel usa a base atualizada **neste navegador**
- Para publicar para todos: clique em **Baixar data.js** e substitua no repositório GitHub

## Regras de negócio

| Cod Dcto | Tipo | Natureza | Sinal na tela |
|----------|------|----------|---------------|
| 6416 | Ajuste Normal | Sobra | + |
| 6417 | Ajuste Normal | Falta | − |
| 5200 | Ajuste TOP20 | Sobra | + |
| 5600 | Ajuste TOP20 | Falta | − |
| 5201 | Inventário Departamental | Sobra | + |
| 5601 | Inventário Departamental | Falta | − |

Resultado = soma dos valores com sinal (sobras positivas + faltas negativas).
