/* DIAGNÓSTICO DE GRAVAÇÃO — PROVA ADMINISTRAÇÃO PÚBLICA
 * Cole este arquivo como um segundo arquivo .gs no MESMO projeto do Apps Script.
 * Não substitui o backend V3.
 */

function testeGravacaoControle() {
  const ID_CONTROLE = '1Co3MS-zqENPzcT5XpedtZPLAzeqyXoyIH2B6nKETebw';
  const ABA = 'RESPOSTAS_ALUNOS';

  const ss = SpreadsheetApp.openById(ID_CONTROLE);
  const sh = ss.getSheetByName(ABA);
  if (!sh) throw new Error('Aba RESPOSTAS_ALUNOS não encontrada.');

  const agora = new Date();
  const id = 'TESTE-' + Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyyMMdd-HHmmss');
  const row = [
    id,
    agora,
    'TESTE DE GRAVAÇÃO',
    'teste@diagnostico.local',
    '3º TANE - Extensão Ibiúna',
    'DIAGNOSTICO',
    '', '', 30, '', '', '', '',
    'TESTE BACKEND',
    false, '', '', '', false, '', false, '', '',
    JSON.stringify({diagnostico:true,quando:agora.toISOString()}),
    'Linha criada manualmente pela função testeGravacaoControle()'
  ];

  sh.appendRow(row);
  const r = sh.getLastRow();
  [15,19,21].forEach(c => sh.getRange(r,c).insertCheckboxes().setValue(false));
  SpreadsheetApp.flush();

  Logger.log('OK - gravado em: ' + ss.getName() + ' / ' + sh.getName() + ' / linha ' + r);
  return 'OK - linha ' + r;
}

function testeLeituraBanco() {
  const ID_BANCO = '1IhZ7u5eSWVTf2Hv8g5eMBycUlz5bhYcbMvkMHQFizAQ';
  const ss = SpreadsheetApp.openById(ID_BANCO);
  const q = ss.getSheetByName('BANCO_QUESTOES');
  const c = ss.getSheetByName('CONFIGURACAO');
  if (!q) throw new Error('BANCO_QUESTOES não encontrado.');
  if (!c) throw new Error('CONFIGURACAO não encontrada.');
  Logger.log('OK - Banco: ' + ss.getName() + ' | questões: ' + (q.getLastRow()-1));
  return 'OK - banco acessível';
}
