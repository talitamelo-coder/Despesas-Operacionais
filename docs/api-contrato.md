# Contrato da API REST (fase de integração)

A UI depende apenas da interface `ContratosApi` (`src/services/api.ts`). Hoje ela é atendida pelo mock em memória (`src/services/mock/mockApi.ts`); com `VITE_DATA_SOURCE=api` passa a usar `src/services/rest/restApi.ts`, que chama os endpoints abaixo. O backend Python deve reproduzir o mesmo comportamento: o mock é a especificação executável, coberta por `src/services/mock/mockApi.test.ts`.

Base: `/api/v1`. JSON em UTF-8. Datas `YYYY-MM-DD`, data-hora ISO 8601. Valores monetários como número decimal.

## Autenticação e permissões

- A identidade vem da sessão/SSO da Akross Atende (**a definir**). O cabeçalho `X-Usuario-Id` do esboço REST serve **só para desenvolvimento** e não pode ser usado em produção.
- Permissões são verificadas **no backend**, com a matriz de `src/domain/rules/permissoes.ts`. Saving e baseline só podem ser alterados por Suprimentos ou Administrador.
- Erros: `403` para permissão (`ErroPermissao`), `422` para regra de negócio (`ErroNegocio`), com `{ "mensagem": "..." }`.

## Endpoints

| Método | Caminho | Método da interface | Observações |
|---|---|---|---|
| GET | `/usuarios` | `listarUsuarios` | |
| PUT | `/usuarios/{id\|novo}` | `salvarUsuario` | Admin |
| GET | `/empresas` · PUT `/empresas/{id\|novo}` | `listarEmpresas` · `salvarEmpresa` | |
| GET | `/fornecedores` | `listarFornecedores` | Espelho do sistema atual |
| POST | `/fornecedores/potenciais` | `criarFornecedorPotencial` | Pré-cadastro durante cotação |
| GET | `/tipos-contrato` · PUT `/tipos-contrato/{id\|novo}` | | |
| GET / PUT | `/configuracao` | `obterConfiguracao` · `salvarConfiguracao` | Listas, regras de alerta |
| GET | `/central?aba=&busca=&empresaId=&...&ordenarPor=&direcao=&pagina=&tamanhoPagina=` | `consultarCentral` | **Paginação e filtros no servidor**; retorna `{ linhas, total, contagemPorAba }` |
| GET | `/contratos` · `/contratos/{id}` | `listarContratos` · `obterContrato` | |
| PATCH | `/contratos/{id}` | `atualizarContrato` | Gera auditoria campo a campo |
| POST | `/contratos/{id}/avaliacao-renovacao` | `registrarAvaliacaoRenovacao` | Interrompe lembretes; pode criar processo |
| POST | `/contratos/{id}/status` | `encerrarContrato` | `{ status, motivo }` |
| POST | `/importacoes/contratos` | `importarContratos` | Registros já validados no front |
| GET | `/processos` · `/processos/{id}` | | |
| POST | `/processos` | `criarProcesso` | Sempre nasce em Rascunho |
| PATCH | `/processos/{id}` | `atualizarProcesso` | Autosave do rascunho |
| DELETE | `/processos/{id}` | `excluirRascunho` | Só rascunho |
| POST | `/processos/{id}/validacao` | `validarDemanda` | Validação de Suprimentos (JIRA) |
| POST | `/processos/{id}/avancar` | `avancarProcesso` | Valida campos da etapa; em `Concluído` gera o contrato |
| POST | `/processos/{id}/aprovacoes` | `registrarAprovacao` | `{ papel, status, comentario }` |
| POST | `/processos/{id}/parecer` | `registrarParecer` | Jurídico |
| POST | `/processos/{id}/suspender` · `/retomar` · `/cancelar` | | |
| GET | `/documentos?contrato_id=&processo_id=` · POST `/documentos` | | Upload real via URL pré-assinada (a definir) |
| GET | `/acoes` | `listarAcoes` | Derivado (`domain/rules/acoes.ts`) |
| GET | `/alertas?contrato_id=` | `listarAlertas` | Derivado (`domain/rules/alertas.ts`) |
| GET | `/dashboard/indicadores` | `obterIndicadores` | Derivado (`domain/rules/indicadores.ts`) |
| GET | `/auditoria?entidadeId=` | `listarAuditoria` | |
| GET | `/integracoes/jira/demandas/{jira_key}` | `buscarDemandaJira` | Backend consulta o JIRA |

## Regras que o backend precisa reproduzir

As fórmulas estão centralizadas em `src/domain/rules/` e cobertas por testes. Para não duplicar lógica, a recomendação é portar esses arquivos para um pacote Python `dominio/` com os **mesmos casos de teste**. Outra opção é manter o cálculo só no backend e fazer o front consumir os campos calculados.

- `prazos.ts`: data limite, abertura da avaliação, fase, renovação automática em risco.
- `fluxo.ts`: etapas por tipo, campos obrigatórios por etapa, aprovações.
- `saving.ts`, `cambio.ts`, `reajuste.ts`: saving, baseline ajustado, decomposição preço × volume × câmbio.
- `alertas.ts`, `acoes.ts`: alertas programados, interrupção, priorização.
- `heranca.ts`: campos herdados na renovação e na substituição.
