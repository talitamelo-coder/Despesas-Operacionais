# Arquitetura

```
Frontend (React/Vite — compatível com Lovable)
   │  depende só de  ContratosApi  (src/services/api.ts)
   ├── mock (hoje): em memória + localStorage, dados de demonstração
   └── REST (futuro): /api/v1 → Backend Python → MySQL
                                   ├── JIRA        (demandas de compra)
                                   ├── Sistema atual (fornecedor, pedido, saldo, NF, pagamento)
                                   └── Adobe       (assinatura / documentos)
```

## Camadas do frontend

| Pasta | Responsabilidade | Pode importar |
|---|---|---|
| `src/domain/types.ts` | Modelo de domínio e identificadores reservados (`jira_key`, `processo_id`, `contrato_id`, `contrato_anterior_id`, `pedido_id`, `fornecedor_id`, `external_id`) | — |
| `src/domain/rules/` | **Regras e cálculos centralizados** (funções puras e testadas) | `domain` |
| `src/domain/templates/` | Templates de e-mail | `domain` |
| `src/integrations/` | Interfaces dos gateways (JIRA, Adobe, sistema atual) + simulações | `domain` |
| `src/services/` | Contrato da camada de dados, mock e esboço REST | `domain`, `integrations` |
| `src/components/ui/` | Componentes visuais genéricos (botão, badge, tabela, modal…) | — |
| `src/components/dominio/` | Componentes de negócio reutilizáveis (saving, documentos, auditoria) | `ui`, `domain`, `services` |
| `src/pages/` | Telas: compõem componentes e chamam serviços | tudo acima |

Regra principal: **nenhuma fórmula em componente**. Saving, prazos, criticidade, status e conversões são chamados a partir de `domain/rules`.

## Princípio "se o sistema já sabe, não pergunte"

Cada entidade tem um mapa `origens` (campo → `importado | validado | herdado | calculado | manual`), exibido nas telas pela etiqueta `OrigemTag`. Valores calculados aparecem como texto (`Valor`), nunca como campo editável.

## Desempenho

- A Central consulta a camada de dados com filtros, ordenação e paginação (`consultarCentral`). No mock, o índice de linhas fica em cache até a próxima mudança; na API, a paginação acontece no servidor.
- Busca com *debounce* de 250 ms e normalização sem acentos.
- Telas carregadas sob demanda (`React.lazy`): bundle inicial de ~110 kB gzip.

## Incorporação à Akross Atende

- Tokens visuais em `src/styles/index.css` (`@theme`). Substituir pelos tokens oficiais da Akross Atende **sem mexer nos componentes**.
- Layout (`components/layout/Layout.tsx`) isolado: na incorporação, remover a casca (menu/topo) e montar só as rotas sob um prefixo (ex.: `/contratos/*`).
- Usuário/perfil hoje simulado no topo; virá da sessão da plataforma.

## FinOps

- Hoje o front é estático e pode ser hospedado em CDN/bucket, com custo marginal.
- Na fase de backend, prever: paginação obrigatória na Central (sem `SELECT *` de contratos), índices de `docs/modelo-dados.sql`, cálculo de alertas em **job diário agendado** (não em cada request) com log em `alertas_enviados` para não reenviar, documentos em storage frio após encerramento do contrato, e tags de custo por ambiente.
- Integrações (JIRA, sistema atual) com cache e limite de taxa. Sincronização incremental em vez de varredura completa.
