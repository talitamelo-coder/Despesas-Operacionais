# Convenções do projeto (para mudanças incrementais)

- Idioma do código e da UI: português do Brasil.
- **Preserve o que já funciona.** Mudanças devem ser locais: uma tela, um bloco, uma regra.
- Regras e cálculos (saving, prazos, criticidade, status, câmbio, campos por etapa) ficam **somente** em `src/domain/rules/`, com teste ao lado (`*.test.ts`). Componentes nunca reimplementam fórmulas.
- A UI acessa dados apenas por `api` (`src/services`). Nova operação = método em `ContratosApi` + implementação no mock + linha em `docs/api-contrato.md` + método no `restApi`.
- Cores e tokens visuais só em `src/styles/index.css`. Status → cor só em `components/ui/status.tsx`.
- Dados calculados ou herdados são exibidos com `Valor` + `OrigemTag`. Não crie campo para o que o sistema já sabe.
- Nunca sobrescreva contrato anterior em renovação ou substituição. Nunca apague auditoria.
- Antes de concluir: `npx tsc --noEmit -p . && npm test && npm run build`.
