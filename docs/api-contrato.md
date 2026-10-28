# Contrato da API REST (fase de integração)

A UI depende apenas da interface `ContratosApi` (`src/services/api.ts`). Hoje ela é atendida pelo mock em memória (`src/services/mock/mockApi.ts`); com `VITE_DATA_SOURCE=api` passa a usar `src/services/rest/restApi.ts`, que chama os endpoints abaixo. O backend Python deve reproduzir o mesmo comportamento: o mock é a especificação executável, coberta por `src/services/mock/mockApi.test.ts`.

Base: `/api/v1`. JSON em UTF-8. Datas `YYYY-MM-DD`, data-hora ISO 8601. Valores monetários como número decimal.

## Autenticação e permissões

- A identidade vem da sessão/SSO da Akross Atende (**a definir**). O cabeçalho `X-Usuario-Id` do esboço REST serve **só para desenvolvimento** e não pode ser usado em produção.
- Permissões são verificadas **no backend**, com a matriz de `src/domain/rules/permissoes.ts`. Um usuário pode ter perfil principal e perfis adicionais; as permissões se somam (`usuarioPode`). Saving e baseline só podem ser alterados por Suprimentos ou Administrador. Licenças e telefonia: Suprimentos e Administrador gerem tudo; Gestor vê só a própria área; perfil `Leitura` vê só totais (pessoas chegam sem nome nem e-mail). Custo por pessoa é dado pessoal (LGPD).
- Erros: `403` para permissão (`ErroPermissao`), `422` para regra de negócio (`ErroNegocio`), com `{ "mensagem": "..." }`.

## Endpoints

| Método | Caminho | Método da interface | Observações |
|---|---|---|---|
| GET | `/usuarios` | `listarUsuarios` | |
| PUT | `/usuarios/{id\|novo}` | `salvarUsuario` | Admin. Corpo pode trazer `senha` (só no cadastro/redefinição); a resposta nunca devolve senha nem hash |
| POST | `/usuarios/lote` | `adicionarUsuariosEmLote` | Admin. `{ nomes, perfil }`: cria só com o nome (e-mail, área e senha a completar; sem senha não há acesso). Ignora nome já cadastrado. Retorna `{ criados, ignorados }` |
| GET | `/empresas` · PUT `/empresas/{id\|novo}` | `listarEmpresas` · `salvarEmpresa` | |
| GET | `/fornecedores` | `listarFornecedores` | Espelho do sistema atual |
| POST | `/fornecedores/potenciais` | `criarFornecedorPotencial` | Pré-cadastro durante cotação |
| PUT | `/fornecedores/{id\|novo}` | `salvarFornecedor` | Enquanto não houver integração com o sistema atual |
| GET | `/tipos-contrato` · PUT `/tipos-contrato/{id\|novo}` | | |
| GET / PUT | `/configuracao` | `obterConfiguracao` · `salvarConfiguracao` | Listas, regras de alerta |
| GET | `/central?aba=&busca=&empresaId=&...&ordenarPor=&direcao=&pagina=&tamanhoPagina=` | `consultarCentral` | **Paginação e filtros no servidor**; retorna `{ linhas, total, contagemPorAba }`. Filtro `porDemanda=sim\|nao` separa contratos por demanda (valor anual estimado) |
| GET | `/contratos` · `/contratos/{id}` | `listarContratos` · `obterContrato` | |
| PATCH | `/contratos/{id}` | `atualizarContrato` | Gera auditoria campo a campo |
| POST | `/contratos/{id}/avaliacao-renovacao` | `registrarAvaliacaoRenovacao` | Interrompe lembretes; pode criar processo |
| POST | `/contratos/{id}/status` | `encerrarContrato` | `{ status, motivo }` |
| POST | `/importacoes/contratos` | `importarContratos` | Registros já validados no front |
| POST | `/importacoes/fornecedores` | `importarFornecedores` | Aba Fornecedores da carga. Cria os novos; nos já cadastrados (CNPJ ou razão social) só preenche campos vazios. Dados bancários auditados mascarados. `{ criados, completados, semMudanca }` |
| GET | `/processos` · `/processos/{id}` | | |
| POST | `/processos` | `criarProcesso` | Sempre nasce em Rascunho |
| PATCH | `/processos/{id}` | `atualizarProcesso` | Autosave do rascunho |
| DELETE | `/processos/{id}` | `excluirRascunho` | Só rascunho |
| POST | `/processos/{id}/validacao` | `validarDemanda` | Validação de Suprimentos (JIRA). Fora do fluxo atual; mantido para histórico |
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
| GET | `/contratos/{id}/saldo` | `obterSaldoContrato` | `{ saldo, pedidos, aportes }`. Saldo calculado (rules/saldo.ts), na moeda do contrato |
| GET | `/contratos/saldos?natureza=Receita` | `listarSaldos` | `{ [contrato_id]: saldo }` de todos os contratos da natureza (painel de clientes) — uma chamada só |
| POST | `/contratos/{id}/pedidos` | `registrarPedido` | **Ponto de integração do módulo de pedidos.** `422` quando o valor passa do disponível: é preciso adicionar saldo antes |
| POST | `/pedidos/{id}/status` | `atualizarStatusPedido` | Aprovado → Pago (realizado) ou Cancelado (devolve o saldo) |
| POST | `/contratos/{id}/aditivos` · GET | `registrarAditivo` · `listarAditivos` | **Única forma de mudar valor ou prazo** depois da contratação. Guarda antes/depois; variação de valor total vira saldo. A edição direta (`PATCH /contratos/{id}`) recusa mudança de valor/vigência em contrato com cadastro completo |
| GET | `/clientes` · PUT `/clientes/{id\|novo}` | `listarClientes` · `salvarCliente` | Cadastro **separado** do de fornecedores. CNPJ obrigatório só para cliente nacional |
| POST | `/contratos-clientes` | `registrarContratoCliente` | Contrato de receita: cliente, vigência, tipo de receita (fixa, variável, fixa + variável), valores e valores previstos (escalonamento). Renovação/substituição de um ou mais contratos (N → 1), sem alterar os anteriores |
| POST | `/contratos/{id}/emissoes` | `registrarEmissao` | **Ponto de integração do Contas a receber.** Nota emitida consome o saldo a faturar; `422` acima do saldo (é preciso aditivo). Idempotente pelo número do documento |
| POST | `/emissoes/{id}/cancelar` | `cancelarEmissao` | Cancelamento vindo do Contas a receber; devolve o saldo |
| GET | `/licencas` | `listarLicencas` | **Licenças e telefonia (rotas `/licencas` e `/telefonia`) migram para o módulo de gestão: sem tela neste módulo e fora do saldo do contrato.** Licenças, movimentações, atribuições, colaboradores, cotações, parâmetros, orçamentos, linhas e usos. Filtrado por perfil (`visao`: completa, area, agregada) |
| PUT | `/licencas/{id\|novo}` | `salvarLicenca` | Corpo pode trazer `compraInicial`. `contrato_id` só vincula: **nunca altera o contrato**. Bloqueia anual com vencimento mensal |
| POST | `/licencas/{id}/movimentacoes` | `registrarMovimentacao` | Compra, Redução, Renegociação, Cancelamento. Grava `valorAnualAntes/Depois` (registro de economia). Cancelamento encerra atribuições |
| PUT | `/colaboradores/{id\|novo}` | `salvarColaborador` | E-mail corporativo em minúsculas é a identidade; domínios do grupo contam como o mesmo e-mail |
| POST | `/licencas/{id}/atribuicoes` | `atribuirLicenca` | `{ colaboradorId, dataInicio }`. **Recusa sem assento livre**, e-mail repetido na licença ou pessoa desligada |
| POST | `/licencas/atribuicoes/{id}/encerrar` | `encerrarAtribuicao` | `{ dataFim }`; histórico mantido |
| POST | `/licencas/pendencias/{id}/resolver` | `resolverPendenciaAtribuicao` | `{ email? }`. Usuário da fila (importação sem e-mail ou sem assento) vira atribuição; cria a pessoa se o e-mail for novo. Recusa sem assento livre |
| POST | `/licencas/pendencias/{id}/descartar` | `descartarPendenciaAtribuicao` | `{ observacao }`. Sai da fila sem atribuir; registro mantido |
| POST | `/colaboradores/{id}/desligar` | `desligarColaborador` | Encerra licenças e linhas da pessoa |
| PUT | `/cotacoes/{data}` | `salvarCotacao` | PTAX de venda. Backend carrega 1x/dia do Banco Central (API Olinda/PTAX) e guarda em cache |
| POST | `/parametros/{chave}` | `salvarParametro` | `{ valor, vigenteDesde }`. Histórico: o valor vale a partir da data; meses anteriores não mudam |
| PUT | `/orcamentos-fornecedor/{id\|novo}` | `salvarOrcamento` | Alerta aos 90% do contratado no ano |
| POST | `/importacoes/csv/{tipo}/previa` | `previsualizarCsv` | `tipo`: licencas, atribuicoes, movimentacoes, linhas (permissão gerir_licencas) ou contratosClientes (editar_processo). Não grava |
| POST | `/importacoes/csv/{tipo}` | `importarCsv` | Só linhas válidas; idempotente (reimportar não altera totais) |
| POST | `/auditoria/exportacoes` | `registrarExportacao` | Toda exportação CSV entra na auditoria |
| PUT | `/telefonia/linhas/{id\|nova}` | `salvarLinha` | Número único (só dígitos, com DDD). Cancelada/portada encerra o uso |
| POST | `/telefonia/linhas/{id}/usos` | `atribuirLinha` | Uma pessoa por linha por vez |
| POST | `/telefonia/usos/{id}/encerrar` | `encerrarUsoLinha` | Devolução; histórico mantido |

Métodos só do modo local (sem servidor): `obterModoDados`, `iniciarBaseVazia`, `exportarBackup`, `importarBackup` e `restaurarDadosDemonstracao`. Com a API real, a base é única, e cópia de segurança e recuperação são feitas no banco de dados.

## Regras que o backend precisa reproduzir

As fórmulas estão centralizadas em `src/domain/rules/` e cobertas por testes. Para não duplicar lógica, a recomendação é portar esses arquivos para um pacote Python `dominio/` com os **mesmos casos de teste**. Outra opção é manter o cálculo só no backend e fazer o front consumir os campos calculados.

- `prazos.ts`: data limite, abertura da avaliação, fase, renovação automática em risco.
- `fluxo.ts`: etapas do processo (aprovação e jurídico opcionais por configuração), campos obrigatórios por etapa, aprovações, migração de status antigos.
- `saving.ts`, `cambio.ts`, `reajuste.ts`: saving, baseline ajustado, decomposição preço × volume × câmbio.
- `alertas.ts`, `acoes.ts`: alertas programados, interrupção, priorização.
- `heranca.ts`: campos herdados na renovação e na substituição.
- `licencas.ts`: posição de assentos pelas movimentações, câmbio (PTAX × (1 + spread) + IOF só em USD), cobrança por competência, rateio por pessoa, ranking de ofensores (fecha com o total), ganhos e perdas, vencimentos e alertas. Impostos simulados nunca entram nos totais.
- `importacaoCsv.ts`, `csv.ts`: modelos, leitura no padrão pt-BR, validação linha a linha e plano idempotente.
- `telefonia.ts`: linhas, uso por pessoa, custos por operadora/pessoa/área e alertas.
- `receita.ts`, `clientes.ts`: valores contratados de receita (fixo vigente com escalonamento, variável estimado, contrato principal), validação do registro e aplicação de aditivo. O módulo de contratos **não fatura nem mede**: só registra o contratado e o saldo.
- `saldo.ts`: contratado (valor anual × anos da vigência + aportes; ciclo anual no indeterminado) − pedidos aprovados e pagos − licenças e linhas vinculadas. Bloqueio de pedido acima do saldo e de compra de licença/linha que estoure o saldo; alertas de 80% e 100%. O backend deve validar o saldo na mesma transação que grava o pedido (`SELECT ... FOR UPDATE` no contrato).
- `avaliacao.ts`, `prazos.ts`: desfecho da avaliação (não renovar nem substituir = **Cancelado**) e revisão anual do prazo indeterminado.
- **Pré-agregação (FinOps):** o backend mantém `custo_licenca_mensal` (competência × licença × colaborador × tipo) recalculada a cada movimentação/atribuição; o dashboard lê dela. Cotação em cache, 1 carga por dia.
