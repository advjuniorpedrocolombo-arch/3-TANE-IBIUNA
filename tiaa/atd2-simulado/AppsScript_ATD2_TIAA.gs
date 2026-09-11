// ATD2 - TIAA | Simulado de Prova
// Prof. Dr. Junior P. Colombo
// Recebe arquivo .xlsm, registra no Google Sheets e envia devolutiva por e-mail.

const CONFIG_TIAA = {
  SPREADSHEET_ID: '1a6U_ieofvinaUdqmY63uwMEn_ohAs4zdoJgZOYEcDYA',
  SHEET_NAME: 'Respostas',
  FOLDER_ID: '1N9hKln3BZ9aESAKevQb_pxFp3NVTK2Cd',
  TURMA: 'TIAA',
  ATIVIDADE: 'ATD2 - Simulado de Prova',
  MAX_BYTES: 20 * 1024 * 1024
};

function doGet() {
  return jsonTiaa_({ok:true, atividade:CONFIG_TIAA.ATIVIDADE, status:'ONLINE'});
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Requisição vazia.');
    const d = JSON.parse(e.postData.contents);
    const nome = String(d.nome || '').trim();
    const email = String(d.email || '').trim().toLowerCase();
    const arquivoNome = String(d.fileName || '').trim();
    const mime = String(d.mimeType || '').trim();
    const base64 = String(d.fileBase64 || '');

    if (nome.length < 3) throw new Error('Informe o nome completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    if (!arquivoNome.toLowerCase().endsWith('.xlsm')) throw new Error('Envie somente arquivo Excel habilitado para macro (.xlsm).');
    if (!base64) throw new Error('Arquivo não recebido.');

    const bytes = Utilities.base64Decode(base64.replace(/^data:.*?;base64,/, ''));
    if (bytes.length > CONFIG_TIAA.MAX_BYTES) throw new Error('Arquivo maior que 20 MB.');

    const protocolo = 'TIAA-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Sao_Paulo', 'yyyyMMdd-HHmmss') + '-' + Math.floor(1000 + Math.random()*9000);
    const nomeSeguro = nome.replace(/[\\/:*?"<>|]/g,'_');
    const finalName = nomeSeguro + ' - ' + CONFIG_TIAA.ATIVIDADE + ' - ' + protocolo + '.xlsm';
    const blob = Utilities.newBlob(bytes, mime || 'application/vnd.ms-excel.sheet.macroEnabled.12', finalName);
    const file = DriveApp.getFolderById(CONFIG_TIAA.FOLDER_ID).createFile(blob);

    const ss = SpreadsheetApp.openById(CONFIG_TIAA.SPREADSHEET_ID);
    const sh = ss.getSheetByName(CONFIG_TIAA.SHEET_NAME);
    if (!sh) throw new Error('Aba Respostas não encontrada.');

    const agora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    sh.appendRow(['PENDENTE', protocolo, agora, nome, email, CONFIG_TIAA.TURMA, finalName, file.getUrl(), '', '', false, '', 'AGUARDANDO CORREÇÃO']);

    return jsonTiaa_({ok:true, protocolo:protocolo, horario:agora});
  } catch (err) {
    return jsonTiaa_({ok:false, erro:err.message || String(err)});
  }
}

function criarGatilhoDevolutiva() {
  const ss = SpreadsheetApp.openById(CONFIG_TIAA.SPREADSHEET_ID);
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enviarDevolutivaAoMarcar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarDevolutivaAoMarcar').forSpreadsheet(ss).onEdit().create();
}

function enviarDevolutivaAoMarcar(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== CONFIG_TIAA.SHEET_NAME) return;
    if (e.range.getColumn() !== 11 || e.range.getRow() < 2 || e.value !== 'TRUE') return;

    const r = e.range.getRow();
    const nome = String(sh.getRange(r,4).getValue() || '').trim();
    const email = String(sh.getRange(r,5).getValue() || '').trim();
    const mencao = String(sh.getRange(r,9).getValue() || '').trim();
    const obs = String(sh.getRange(r,10).getValue() || '').trim();
    const status = String(sh.getRange(r,13).getValue() || '').trim();

    if (!email) throw new Error('E-mail do aluno não informado.');
    if (!mencao) throw new Error('Preencha a MENÇÃO antes de enviar.');
    if (status === 'ENVIADO') return;

    const corpo = [
      'Olá, ' + nome + '.',
      '',
      'Sua ATD2 - Simulado de Prova de TIAA foi corrigida.',
      'Menção: ' + mencao,
      '',
      obs ? 'Devolutiva do professor:\n' + obs : 'Sem observações adicionais.',
      '',
      'Prof. Dr. Junior Pedro Colombo'
    ].join('\n');

    MailApp.sendEmail({to:email, subject:'TIAA - ATD2 - Simulado de Prova | Devolutiva', body:corpo, name:'Prof. Dr. Junior Pedro Colombo'});

    sh.getRange(r,1).setValue('CORRIGIDO');
    sh.getRange(r,12).setValue(Utilities.formatDate(new Date(),'America/Sao_Paulo','dd/MM/yyyy HH:mm:ss'));
    sh.getRange(r,13).setValue('ENVIADO');
  } catch (err) {
    try {
      const r = e.range.getRow();
      e.range.getSheet().getRange(r,13).setValue('ERRO: ' + (err.message || err));
      e.range.setValue(false);
    } catch (_) {}
  }
}

function jsonTiaa_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
