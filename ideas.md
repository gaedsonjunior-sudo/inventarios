# Direção visual — Painel de Inventários

## Abordagens consideradas

### Theme Name: Control Room Claro
Very Brief Intro: Um painel operacional claro, preciso e arejado, com acentos de coral para evidenciar desvios e verde para sobras. A linguagem comunica decisão rápida sem parecer uma planilha.
Probability: 0.06

### Theme Name: Arquivo Industrial
Very Brief Intro: Uma estética editorial inspirada em relatórios de auditoria, com papel quente, azul-petróleo e tipografia monoespaçada para dar rastreabilidade aos números. O foco é confiança e leitura cuidadosa.
Probability: 0.03

### Theme Name: Noite Operacional
Very Brief Intro: Uma sala de controle escura, com ciano e âmbar para estados críticos e leituras em camadas. A direção favorece contexto contínuo em monitores, mas exige contraste cuidadoso no mobile.
Probability: 0.08

## Abordagem escolhida: Control Room Claro

### Design Movement
Swiss International Style aplicado a um produto SaaS operacional: hierarquia tipográfica rigorosa, composição assimétrica, ritmo de informação e cor usada como sinal, não como decoração.

### Core Principles
1. Clareza antes de ornamentação: todo número deve explicar seu significado em menos de um segundo.
2. Hierarquia por contraste: títulos editoriais, labels compactos e números grandes convivem com função clara.
3. Cor sem ambiguidade: coral representa falta, verde-jade representa sobra e azul-petróleo representa contexto/resultado.
4. Densidade progressiva: o mobile começa pelos sinais essenciais e o desktop revela tabelas e comparações profundas.

### Color Philosophy
O fundo marfim reduz a sensação de software genérico e deixa os valores críticos respirarem. O azul-petróleo é a assinatura de confiança e navegação; coral queimado sinaliza atenção sem alarmismo; jade acalma e marca o que compensa o impacto.

### Layout Paradigm
Sidebar de controle fixa no desktop e barra superior compacta no mobile. O conteúdo usa uma coluna de decisão com cards assimétricos: o resultado líquido domina o topo, rankings e evolução formam uma sequência alternada e os filtros ficam em uma faixa operacional discreta.

### Signature Elements
1. Faixas verticais de cor nos cards financeiros, como indicadores de status.
2. Micro-rótulos em caixa alta com espaçamento de letras para orientar a leitura.
3. Linhas de tendência e barras com terminais arredondados, sem excesso de molduras.

### Interaction Philosophy
Clique em regional, loja, departamento ou produto reduz o universo da análise e sempre deixa um chip visível para desfazer. Ordenação e filtros são instantâneos, com estados ativos claros e feedback textual quando a base está filtrada.

### Animation
Entradas suaves em cascata de 40ms entre cards, apenas com opacidade e translateY. Hover eleva sutilmente os cards e colore a faixa lateral; modais entram em 220ms com escala de 0.97. Respeitar prefers-reduced-motion.

### Typography System
Display: Fraunces, 600/700, para títulos e números principais com personalidade editorial. Interface: Manrope, 400/500/600/700, para labels, filtros, tabelas e navegação. Números tabulares com font-variant-numeric: tabular-nums.

### Brand Essence
Uma central de decisão para gestores de estoque que precisam transformar milhões de células em prioridades acionáveis; precisa, humana, direta.

### Brand Voice
Headlines são objetivas e orientadas a impacto. CTAs usam verbos operacionais. Microcopy explica a regra sem jargão.
Exemplos: “Veja onde o estoque está escapando.” e “Filtrar para decidir”.

### Wordmark & Logo
Marca gráfica formada por três barras verticais desalinhadas que convergem para uma linha-base, sugerindo inventário, variação e resultado líquido. O wordmark usa Fraunces em caixa baixa, com a barra central como detalhe coral.

### Signature Brand Color
Azul petróleo profundo `#123C46`, usado em navegação, títulos de contexto e elementos de confiança.

## Dados e regras de implementação

A base principal contém 41.140 lançamentos, uma única regional operacional (`Regional 7 - Lins`), nove lojas e dois departamentos (`Açougue` e `Flv`). Foram encontrados os seis códigos de documento previstos, sem códigos desconhecidos. Há 23.406 lançamentos com valor positivo e 17.734 negativos; não há valores financeiros zerados. A base regional possui 75 lojas de nove regionais, enquanto os lançamentos estão concentrados em uma única regional; essa diferença deve ser tratada como catálogo de referência, não como dado de movimento.

A aplicação usa dados derivados da planilha para uma experiência frontend demonstrável, mantendo a arquitetura preparada para futura migração de agregações e persistência para Supabase. Faltas são sempre exibidas como ABS(valor negativo), sobras como valor positivo e resultado líquido preserva o sinal. A classificação de `Cod Dcto` é centralizada em `DOCUMENT_TYPES`.
