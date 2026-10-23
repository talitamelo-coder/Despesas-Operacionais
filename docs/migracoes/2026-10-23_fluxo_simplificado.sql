-- Fluxo do processo simplificado: Rascunho → Com Suprimentos → Aguardando assinatura → Concluído.
-- Aprovação comercial (feita no JIRA) e análise jurídica viram etapas opcionais, desligadas.
-- Nada é apagado: a mudança de status fica na linha do tempo e na auditoria.

ALTER TABLE processos MODIFY status ENUM(
  'Rascunho','Validação de Suprimentos','Em cotação','Em negociação','Com Suprimentos',
  'Aguardando aprovação comercial','Em análise jurídica','Aguardando assinatura','Concluído','Suspenso','Cancelado'
) NOT NULL;

UPDATE processos SET status = 'Com Suprimentos'
 WHERE status IN ('Validação de Suprimentos','Em cotação','Em negociação');
UPDATE processos SET status_antes_suspensao = 'Com Suprimentos'
 WHERE status_antes_suspensao IN ('Validação de Suprimentos','Em cotação','Em negociação');
-- Etapas desligadas: processos parados nelas seguem para a próxima etapa ligada.
UPDATE processos SET status = 'Aguardando assinatura'
 WHERE status IN ('Aguardando aprovação comercial','Em análise jurídica');

ALTER TABLE processos MODIFY status ENUM(
  'Rascunho','Com Suprimentos','Aguardando aprovação comercial','Em análise jurídica',
  'Aguardando assinatura','Concluído','Suspenso','Cancelado'
) NOT NULL;

INSERT INTO configuracoes (chave, valor) VALUES ('fluxo_processo', JSON_OBJECT('exigirAprovacao', false, 'exigirJuridico', false))
  ON DUPLICATE KEY UPDATE chave = chave;
-- Registre cada processo migrado na linha do tempo e na auditoria (no mock: migrarProcessos em src/mocks/seed.ts).
