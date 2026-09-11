/* PROVA ADMINISTRAÇÃO PÚBLICA — BACKEND V4
 * Sem IA na correção objetiva.
 * Banco de questões/configuração: planilha principal.
 * Respostas/controle/correção: planilha separada.
 * Comunicação com GitHub Pages via JSONP/GET.
 * Fluxo administrativo:
 *   GERAR CORREÇÃO -> gera relatório PDF
 *   REVISADO PELO PROFESSOR -> libera aprovação
 *   APROVAR E ENVIAR -> envia PDF por e-mail ao aluno
 */

const APP = {
  SPREADSHEET_BANCO_ID: '1IhZ7u5eSWVTf2Hv8g5eMBycUlz5bhYcbMvkMHQFizAQ',
  SPREADSHEET_CONTROLE_ID: '1Co3MS-zqENPzcT5XpedtZPLAzeqyXoyIH2B6nKETebw',
  SHEET_QUESTOES: 'BANCO_QUESTOES',
  SHEET_RESPOSTAS: 'RESPOSTAS_ALUNOS',
  SHEET_CONFIG: 'CONFIGURACAO',
  PASTA_CORRECOES_ID: '1AA00TSqjyepE_NySsS0zwIa6UyNkA-80',
  TIMEZONE: 'America/Sao_Paulo',
  VERSAO: 'ADM-PUBLICA-2026-09-v4'
};

const COL = {
  ID:1, INICIO:2, NOME:3, EMAIL:4, TURMA:5, VERSAO:6,
  ENVIO:7, TEMPO_UTILIZADO:8, TEMPO_REFERENCIA:9, EXCEDENTE:10,
  ACERTOS:11, NOTA:12, MENCAO_AUTO:13, STATUS:14,
  GERAR_CORRECAO:15, DATA_CORRECAO:16, MENCAO_CORRECAO:17, ARQUIVO_CORRECAO:18,
  REVISADO:19, MENCAO_FINAL:20, APROVAR_ENVIAR:21,
  DATA_ENVIO:22, STATUS_ENVIO:23, ESTADO_JSON:24, OBSERVACOES:25
};

/* =========================
 * WEB APP / API
 * ========================= */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || 'ping').trim();
    let out;

    if (action === 'ping') {
      out = { ok:true, sistema:'Prova Administração Pública', versao:APP.VERSAO, agora:new Date().toISOString() };
    } else if (action === 'iniciarOuRetomar') {
      out = iniciarOuRetomar_({ nome:p.nome, email:p.email, turma:p.turma });
    } else if (action === 'consultar') {
      out = consultarTentativa_(p.email || '');
    } else if (action === 'salvarResposta' || action === 'salvarRespostas') {
      out = salvarRespostasLote_({ email:p.email, respostas:parseJson_(p.respostas, []) });
    } else if (action === 'finalizar') {
      out = finalizarPorAluno_({ email:p.email, respostas:parseJson_(p.respostas, []) });
    } else {
      out = { ok:false, erro:'Ação inválida.' };
    }

    return responder_(out, p.callback);
  } catch (err) {
    return responder_({ ok:false, erro:erroTexto_(err) }, e && e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents || '{}';
    const p = parseJson_(raw, {});
    let out;

    if (p.action === 'iniciarOuRetomar') out = iniciarOuRetomar_(p);
    else if (p.action === 'consultar') out = consultarTentativa_(p.email || '');
    else if (p.action === 'salvarResposta' || p.action === 'salvarRespostas') out = salvarRespostasLote_(p);
    else if (p.action === 'finalizar') out = finalizarPorAluno_(p);
    else out = { ok:false, erro:'Ação inválida.' };

    return responder_(out, '');
  } catch (err) {
    return responder_({ ok:false, erro:erroTexto_(err) }, '');
  }
}

function responder_(obj, callback) {
  const txt = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(String(callback) + '(' + txt + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

function parseJson_(s, padrao) {
  try { return JSON.parse(String(s || '')); } catch (_) { return padrao; }
}

/* =========================
 * TENTATIVA DO ALUNO
 * ========================= */

function iniciarOuRetomar_(p) {
  const email = normEmail_(p.email);
  const nome = String(p.nome || '').trim();
  const turma = String(p.turma || '').trim();

  if (!emailOk_(email)) return { ok:false, erro:'Informe um e-mail válido.' };
  if (!nome) return { ok:false, erro:'Informe o nome do aluno.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const ex = localizar_(email);
    if (ex) return montarRetorno_(ex.row);

    const janela = validarJanelaProva_();
    if (!janela.ok) return janela;

    const qs = lerQuestoes_();
    const cfg = lerConfig_();
    const total = Math.min(Number(cfg.TOTAL_QUESTOES || 20), qs.length);
    if (!total) return { ok:false, erro:'Banco de questões vazio.' };

    const sel = shuffle_(qs).slice(0, total);
    const ord = sel.map(q => q.id);
    const opt = {};
    sel.forEach(q => opt[q.id] = shuffle_(q.alternativas.map(a => a.id)));

    const estado = {
      schema: 1,
      questionOrder: ord,
      optionOrder: opt,
      answers: {},
      lastSavedAt: new Date().toISOString()
    };

    const inicio = new Date();
    const row = [
      criarId_(), inicio, nome, email, turma, Utilities.getUuid(),
      '', '', Number(cfg.TEMPO_MINUTOS || 30), '', '', '', '',
      String(cfg.STATUS_PADRAO || 'EM ANDAMENTO'),
      false, '', '', '', false, '', false, '', '',
      JSON.stringify(estado),
      'Tentativa iniciada em ' + formatarData_(inicio)
    ];

    const sh = respostasSheet_();
    sh.appendRow(row);
    const r = sh.getLastRow();
    prepararLinha_(sh, r);
    SpreadsheetApp.flush();

    return montarRetorno_(r);
  } finally {
    lock.releaseLock();
  }
}

function consultarTentativa_(emailRaw) {
  const email = normEmail_(emailRaw);
  if (!emailOk_(email)) return { ok:false, erro:'E-mail inválido.' };
  const t = localizar_(email);
  return t ? montarRetorno_(t.row) : { ok:false, existe:false, erro:'Tentativa não encontrada.' };
}

function salvarRespostasLote_(p) {
  const email = normEmail_(p.email);
  const respostas = Array.isArray(p.respostas) ? p.respostas : [];
  if (!emailOk_(email)) return { ok:false, erro:'E-mail inválido.' };
  if (!respostas.length) return { ok:true, salvo:false, mensagem:'Nenhuma resposta recebida.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const t = localizar_(email);
    if (!t) return { ok:false, erro:'Tentativa não encontrada.' };

    const sh = respostasSheet_();
    const status = String(sh.getRange(t.row, COL.STATUS).getDisplayValue() || '');
    if (statusFinal_(status)) return { ok:false, finalizada:true, erro:'Prova já finalizada.' };

    const tempo = calcularTempo_(t.row);
    if (tempo.restanteSegundos <= 0) {
      finalizarLinha_(t.row, 'FINALIZADA POR TEMPO');
      return montarRetorno_(t.row);
    }

    const estado = lerEstado_(t.row);
    validarRespostas_(estado, respostas).forEach(r => {
      if (!r.optionId) delete estado.answers[r.questionId];
      else estado.answers[r.questionId] = r.optionId;
    });
    estado.lastSavedAt = new Date().toISOString();

    sh.getRange(t.row, COL.ESTADO_JSON).setValue(JSON.stringify(estado));
    SpreadsheetApp.flush();

    return {
      ok:true,
      salvo:true,
      respostasSalvas:Object.keys(estado.answers).length,
      tempoRestanteSegundos:calcularTempo_(t.row).restanteSegundos,
      servidorAgora:new Date().toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function finalizarPorAluno_(p) {
  const email = normEmail_(p.email);
  if (!emailOk_(email)) return { ok:false, erro:'E-mail inválido.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const t = localizar_(email);
    if (!t) return { ok:false, erro:'Tentativa não encontrada.' };

    const estado = lerEstado_(t.row);
    const respostas = Array.isArray(p.respostas) ? p.respostas : [];
    validarRespostas_(estado, respostas).forEach(r => {
      if (!r.optionId) delete estado.answers[r.questionId];
      else estado.answers[r.questionId] = r.optionId;
    });
    estado.lastSavedAt = new Date().toISOString();
    respostasSheet_().getRange(t.row, COL.ESTADO_JSON).setValue(JSON.stringify(estado));

    const st = String(respostasSheet_().getRange(t.row, COL.STATUS).getDisplayValue() || '');
    if (!statusFinal_(st)) {
      finalizarLinha_(t.row, calcularTempo_(t.row).restanteSegundos <= 0 ? 'FINALIZADA POR TEMPO' : 'FINALIZADA PELO ALUNO');
    }

    SpreadsheetApp.flush();
    return montarRetorno_(t.row);
  } finally {
    lock.releaseLock();
  }
}

function montarRetorno_(row) {
  const sh = respostasSheet_();
  let vals = sh.getRange(row, 1, 1, COL.OBSERVACOES).getValues()[0];
  let estado = parseJson_(vals[COL.ESTADO_JSON - 1], { questionOrder:[], optionOrder:{}, answers:{} });
  const tempo = calcularTempo_(row);

  if (!statusFinal_(vals[COL.STATUS - 1])) {
    const janela = validarJanelaProva_();
    if (!janela.ok || tempo.restanteSegundos <= 0) {
      finalizarLinha_(row, tempo.restanteSegundos <= 0 ? 'FINALIZADA POR TEMPO' : 'FINALIZADA - JANELA ENCERRADA');
      vals = sh.getRange(row, 1, 1, COL.OBSERVACOES).getValues()[0];
      estado = parseJson_(vals[COL.ESTADO_JSON - 1], { questionOrder:[], optionOrder:{}, answers:{} });
    }
  }

  const map = mapQuestoes_();
  const finalizada = statusFinal_(vals[COL.STATUS - 1]);

  const questoes = (estado.questionOrder || []).map((qid, i) => {
    const q = map[qid];
    if (!q) return null;
    const ordemAlt = (estado.optionOrder && estado.optionOrder[qid]) || q.alternativas.map(a => a.id);
    const altMap = {};
    q.alternativas.forEach(a => altMap[a.id] = a.texto);

    return {
      numero:i + 1,
      id:q.id,
      enunciado:q.enunciado,
      alternativas:ordemAlt.map((aid, j) => ({
        id:aid,
        letra:['A','B','C','D'][j] || String(j + 1),
        texto:altMap[aid] || ''
      })),
      respostaMarcada:(estado.answers && estado.answers[qid]) || null
    };
  }).filter(Boolean);

  const out = {
    ok:true,
    existe:true,
    id:vals[COL.ID - 1],
    nome:vals[COL.NOME - 1],
    email:vals[COL.EMAIL - 1],
    turma:vals[COL.TURMA - 1],
    status:vals[COL.STATUS - 1],
    finalizada,
    inicio:iso_(vals[COL.INICIO - 1]),
    servidorAgora:new Date().toISOString(),
    tempoTotalSegundos:tempo.totalSegundos,
    tempoRestanteSegundos:finalizada ? 0 : tempo.restanteSegundos,
    questoes,
    respostasSalvas:Object.keys(estado.answers || {}).length
  };

  // Não enviamos gabarito/nota ao aluno pela API da prova.
  if (finalizada) out.envio = iso_(vals[COL.ENVIO - 1]);
  return out;
}

/* =========================
 * CORREÇÃO OBJETIVA
 * ========================= */

function finalizarLinha_(row, status) {
  const sh = respostasSheet_();
  const atual = String(sh.getRange(row, COL.STATUS).getDisplayValue() || '');
  if (statusFinal_(atual)) return;

  const agora = new Date();
  const corr = corrigir_(row);
  const t = calcularTempo_(row);
  const cfg = lerConfig_();

  sh.getRange(row, COL.ENVIO).setValue(agora);
  sh.getRange(row, COL.TEMPO_UTILIZADO).setValue(segRelogio_(Math.min(t.decorridoSegundos, t.totalSegundos)));
  sh.getRange(row, COL.TEMPO_REFERENCIA).setValue(Number(cfg.TEMPO_MINUTOS || 30));
  sh.getRange(row, COL.EXCEDENTE).setValue(segRelogio_(Math.max(0, t.decorridoSegundos - t.totalSegundos)));
  sh.getRange(row, COL.ACERTOS).setValue(corr.acertos);
  sh.getRange(row, COL.NOTA).setValue(corr.nota);
  sh.getRange(row, COL.MENCAO_AUTO).setValue(corr.mencao);
  sh.getRange(row, COL.STATUS).setValue(status || 'FINALIZADA');
  if (!sh.getRange(row, COL.MENCAO_FINAL).getValue()) sh.getRange(row, COL.MENCAO_FINAL).setValue(corr.mencao);

  acrescentarObservacao_(row, 'Prova finalizada: ' + (status || 'FINALIZADA') + ' em ' + formatarData_(agora));
}

function corrigir_(row) {
  const e = lerEstado_(row);
  const m = mapQuestoes_();
  let acertos = 0;
  const detalhes = [];

  (e.questionOrder || []).forEach((id, index) => {
    const q = m[id];
    if (!q) return;
    const marcada = (e.answers && e.answers[id]) || null;
    const acertou = marcada === q.corretaId;
    if (acertou) acertos++;
    detalhes.push({ numero:index + 1, questionId:id, marcada, correta:q.corretaId, acertou });
  });

  const total = (e.questionOrder || []).length || 20;
  const nota = Number((acertos / total * 10).toFixed(2));
  return { acertos, total, nota, mencao:calcularMencao_(nota), detalhes };
}

function calcularMencao_(nota) {
  if (nota >= 9) return 'MB';
  if (nota >= 7) return 'B';
  if (nota >= 5) return 'R';
  return 'I';
}

/* =========================
 * GATILHOS ADMINISTRATIVOS
 * ========================= */

function instalarSistemaV4() {
  // Remove somente gatilhos antigos deste projeto relacionados a edição da prova.
  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (h === 'gatilhoEdicaoV4' || h === 'gatilhoEdicaoInstalavel') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('gatilhoEdicaoV4')
    .forSpreadsheet(controleSs_())
    .onEdit()
    .create();

  atualizarCabecalhosV4_();
  SpreadsheetApp.flush();
  return 'Sistema V4 instalado. Gatilho de edição criado.';
}

function gatilhoEdicaoV4(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getParent().getId() !== APP.SPREADSHEET_CONTROLE_ID) return;
    if (sh.getName() !== APP.SHEET_RESPOSTAS) return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row < 2 || String(e.value) !== 'TRUE') return;

    if (col === COL.GERAR_CORRECAO) gerarCorrecao_(row);
    else if (col === COL.REVISADO) marcarRevisado_(row);
    else if (col === COL.APROVAR_ENVIAR) aprovarEEnviar_(row);
  } catch (err) {
    try {
      const row = e && e.range ? e.range.getRow() : 0;
      if (row >= 2) acrescentarObservacao_(row, 'ERRO NO GATILHO: ' + erroTexto_(err));
    } catch (_) {}
    throw err;
  }
}

function gerarCorrecao_(row) {
  const sh = respostasSheet_();
  const status = String(sh.getRange(row, COL.STATUS).getDisplayValue() || '');

  if (!statusFinal_(status)) {
    sh.getRange(row, COL.GERAR_CORRECAO).setValue(false);
    throw new Error('A prova precisa estar finalizada antes de gerar a correção.');
  }

  sh.getRange(row, COL.STATUS).setValue('GERANDO CORREÇÃO...');
  SpreadsheetApp.flush();

  const corr = corrigir_(row);
  const arquivo = gerarRelatorioPdf_(row, corr);

  sh.getRange(row, COL.DATA_CORRECAO).setValue(new Date());
  sh.getRange(row, COL.MENCAO_CORRECAO).setValue(corr.mencao);
  sh.getRange(row, COL.ARQUIVO_CORRECAO).setValue(arquivo.url);
  if (!sh.getRange(row, COL.MENCAO_FINAL).getValue()) sh.getRange(row, COL.MENCAO_FINAL).setValue(corr.mencao);
  sh.getRange(row, COL.STATUS).setValue('CORREÇÃO GERADA - AGUARDANDO REVISÃO');

  acrescentarObservacao_(row, 'Relatório PDF gerado em ' + formatarData_(new Date()));
}

function marcarRevisado_(row) {
  const sh = respostasSheet_();
  const arquivo = String(sh.getRange(row, COL.ARQUIVO_CORRECAO).getDisplayValue() || '').trim();

  if (!arquivo) {
    sh.getRange(row, COL.REVISADO).setValue(false);
    throw new Error('Primeiro marque GERAR CORREÇÃO e aguarde o relatório PDF.');
  }

  if (!sh.getRange(row, COL.MENCAO_FINAL).getValue()) {
    sh.getRange(row, COL.MENCAO_FINAL).setValue(
      sh.getRange(row, COL.MENCAO_CORRECAO).getValue() || sh.getRange(row, COL.MENCAO_AUTO).getValue()
    );
  }

  sh.getRange(row, COL.STATUS).setValue('REVISADO PELO PROFESSOR');
  acrescentarObservacao_(row, 'Revisado pelo professor em ' + formatarData_(new Date()));
}

function aprovarEEnviar_(row) {
  const sh = respostasSheet_();
  const revisado = sh.getRange(row, COL.REVISADO).isChecked();

  if (!revisado) {
    sh.getRange(row, COL.APROVAR_ENVIAR).setValue(false);
    throw new Error('Marque REVISADO PELO PROFESSOR antes de aprovar e enviar.');
  }

  const email = normEmail_(sh.getRange(row, COL.EMAIL).getDisplayValue());
  const nome = sh.getRange(row, COL.NOME).getDisplayValue();
  const url = sh.getRange(row, COL.ARQUIVO_CORRECAO).getDisplayValue();

  if (!emailOk_(email)) {
    sh.getRange(row, COL.APROVAR_ENVIAR).setValue(false);
    throw new Error('E-mail do aluno inválido.');
  }
  if (!url) {
    sh.getRange(row, COL.APROVAR_ENVIAR).setValue(false);
    throw new Error('Arquivo de correção não encontrado.');
  }

  const fileId = extrairDriveId_(url);
  if (!fileId) {
    sh.getRange(row, COL.APROVAR_ENVIAR).setValue(false);
    throw new Error('Não foi possível identificar o PDF da correção.');
  }

  const pdf = DriveApp.getFileById(fileId).getBlob().setName('Correcao_Prova_Administracao_Publica.pdf');
  const mencao = sh.getRange(row, COL.MENCAO_FINAL).getDisplayValue();
  const nota = sh.getRange(row, COL.NOTA).getDisplayValue();
  const acertos = sh.getRange(row, COL.ACERTOS).getDisplayValue();
  const tempo = sh.getRange(row, COL.TEMPO_UTILIZADO).getDisplayValue();

  const assunto = 'Devolutiva - Prova de Administração Pública';
  const corpo = [
    'Olá, ' + nome + '.',
    '',
    'Segue em anexo sua devolutiva da Prova de Administração Pública.',
    '',
    'Acertos: ' + acertos + '/20',
    'Nota: ' + nota,
    'Menção final: ' + mencao,
    'Tempo utilizado: ' + tempo,
    '',
    'O relatório contém a conferência questão por questão.',
    '',
    'Professor Junior Pedro Colombo'
  ].join('\n');

  GmailApp.sendEmail(email, assunto, corpo, { attachments:[pdf] });

  sh.getRange(row, COL.DATA_ENVIO).setValue(new Date());
  sh.getRange(row, COL.STATUS_ENVIO).setValue('ENVIADO');
  sh.getRange(row, COL.STATUS).setValue('DEVOLUTIVA ENVIADA');
  acrescentarObservacao_(row, 'Devolutiva enviada para ' + email + ' em ' + formatarData_(new Date()));
}

/* =========================
 * RELATÓRIO PDF
 * ========================= */

function gerarRelatorioPdf_(row, corr) {
  const sh = respostasSheet_();
  const nome = sh.getRange(row, COL.NOME).getDisplayValue();
  const email = sh.getRange(row, COL.EMAIL).getDisplayValue();
  const turma = sh.getRange(row, COL.TURMA).getDisplayValue();
  const tempo = sh.getRange(row, COL.TEMPO_UTILIZADO).getDisplayValue();
  const idTentativa = sh.getRange(row, COL.ID).getDisplayValue();
  const estado = lerEstado_(row);
  const banco = mapQuestoes_();

  const titulo = nome + ' - Correção Prova Administração Pública - ' + idTentativa;
  const doc = DocumentApp.create(titulo);
  const body = doc.getBody();

  body.appendParagraph('PROVA DE ADMINISTRAÇÃO PÚBLICA').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Relatório individual de correção').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Aluno: ' + nome);
  body.appendParagraph('E-mail: ' + email);
  body.appendParagraph('Turma: ' + turma);
  body.appendParagraph('Acertos: ' + corr.acertos + '/' + corr.total);
  body.appendParagraph('Nota: ' + corr.nota.toFixed(2));
  body.appendParagraph('Menção: ' + corr.mencao);
  body.appendParagraph('Tempo utilizado: ' + tempo);
  body.appendParagraph('');
  body.appendParagraph('CONFERÊNCIA DAS QUESTÕES').setHeading(DocumentApp.ParagraphHeading.HEADING2);

  (estado.questionOrder || []).forEach((qid, i) => {
    const q = banco[qid];
    if (!q) return;

    const marcada = (estado.answers && estado.answers[qid]) || null;
    const correta = q.corretaId;
    const acertou = marcada === correta;
    const letraMarcada = letraDaOpcao_(estado, qid, marcada);
    const letraCorreta = letraDaOpcao_(estado, qid, correta);

    body.appendParagraph((i + 1) + '. ' + q.enunciado).setBold(true);
    body.appendParagraph('Sua resposta: ' + (marcada ? (letraMarcada + ') ' + textoAlternativa_(q, marcada)) : 'Não respondida'));
    body.appendParagraph('Resposta correta: ' + letraCorreta + ') ' + textoAlternativa_(q, correta));
    body.appendParagraph('Resultado: ' + (acertou ? 'CORRETA' : 'INCORRETA'));
    body.appendParagraph('');
  });

  body.appendParagraph('Resultado calculado automaticamente pelo gabarito objetivo da prova.');
  body.appendParagraph('Professor Junior Pedro Colombo');
  doc.saveAndClose();

  const pasta = DriveApp.getFolderById(APP.PASTA_CORRECOES_ID);
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(pasta);

  const pdf = pasta.createFile(docFile.getAs(MimeType.PDF).setName(titulo + '.pdf'));
  return { id:pdf.getId(), url:pdf.getUrl(), docId:doc.getId() };
}

function letraDaOpcao_(estado, qid, optionId) {
  if (!optionId) return '-';
  const ordem = (estado.optionOrder && estado.optionOrder[qid]) || [];
  const idx = ordem.indexOf(optionId);
  return idx >= 0 ? (['A','B','C','D'][idx] || String(idx + 1)) : '-';
}

/* =========================
 * BANCO / ESTADO / TEMPO
 * ========================= */

function lerQuestoes_() {
  const v = questoesSheet_().getDataRange().getValues();
  if (v.length < 2) return [];

  const h = v[0].map(x => String(x).trim());
  const ix = {};
  h.forEach((x, i) => ix[x] = i);
  ['ID','ENUNCIADO','ALT_A','ALT_B','ALT_C','ALT_D','CORRETA_ID'].forEach(k => {
    if (ix[k] === undefined) throw new Error('Coluna ausente em BANCO_QUESTOES: ' + k);
  });

  return v.slice(1).filter(r => r[ix.ID]).map(r => ({
    id:String(r[ix.ID]).trim(),
    enunciado:String(r[ix.ENUNCIADO] || '').trim(),
    corretaId:String(r[ix.CORRETA_ID] || '').trim(),
    alternativas:[
      { id:'ALT_A', texto:String(r[ix.ALT_A] || '').trim() },
      { id:'ALT_B', texto:String(r[ix.ALT_B] || '').trim() },
      { id:'ALT_C', texto:String(r[ix.ALT_C] || '').trim() },
      { id:'ALT_D', texto:String(r[ix.ALT_D] || '').trim() }
    ]
  }));
}

function mapQuestoes_() {
  const m = {};
  lerQuestoes_().forEach(q => m[q.id] = q);
  return m;
}

function lerConfig_() {
  const sh = configSheet_();
  const n = Math.max(0, sh.getLastRow() - 1);
  const v = n ? sh.getRange(2, 1, n, 2).getValues() : [];
  const o = {};
  v.forEach(r => { if (r[0]) o[String(r[0]).trim()] = r[1]; });
  return o;
}

function lerEstado_(row) {
  return parseJson_(respostasSheet_().getRange(row, COL.ESTADO_JSON).getValue(), { questionOrder:[], optionOrder:{}, answers:{} });
}

function validarRespostas_(estado, rs) {
  const qids = new Set(estado.questionOrder || []);
  return rs.map(r => ({
    questionId:String(r.questionId || '').trim(),
    optionId:r.optionId === null ? '' : String(r.optionId || '').trim()
  })).filter(r => {
    if (!qids.has(r.questionId)) return false;
    if (!r.optionId) return true;
    return ((estado.optionOrder && estado.optionOrder[r.questionId]) || []).indexOf(r.optionId) >= 0;
  });
}

function localizar_(email) {
  const sh = respostasSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const v = sh.getRange(2, COL.EMAIL, last - 1, 1).getDisplayValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (normEmail_(v[i][0]) === email) return { row:i + 2 };
  }
  return null;
}

function calcularTempo_(row) {
  const start = respostasSheet_().getRange(row, COL.INICIO).getValue();
  const total = Number(lerConfig_().TEMPO_MINUTOS || 30) * 60;
  const d = start instanceof Date ? start : new Date(start);
  const dec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  return { totalSegundos:total, decorridoSegundos:dec, restanteSegundos:Math.max(0, total - dec) };
}

function validarJanelaProva_() {
  const cfg = lerConfig_();
  const agora = new Date();
  const inicio = parseDataConfig_(cfg.DATA_LIBERACAO);
  const fim = parseDataConfig_(cfg.DATA_FECHAMENTO);

  if (inicio && agora < inicio) return { ok:false, bloqueada:true, erro:'A prova ainda não foi liberada.', liberacao:iso_(inicio) };
  if (fim && agora > fim) return { ok:false, bloqueada:true, erro:'O período de realização da prova foi encerrado.', fechamento:iso_(fim) };
  return { ok:true };
}

function parseDataConfig_(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v).trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] || 0), Number(br[5] || 0), 0);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function statusFinal_(s) {
  s = String(s || '').toUpperCase();
  return s.includes('FINALIZADA') || s.includes('CORREÇÃO GERADA') || s.includes('GERANDO CORREÇÃO') || s.includes('REVISADO') || s.includes('DEVOLUTIVA ENVIADA');
}

/* =========================
 * PLANILHA / HELPERS
 * ========================= */

function bancoSs_() { return SpreadsheetApp.openById(APP.SPREADSHEET_BANCO_ID); }
function controleSs_() { return SpreadsheetApp.openById(APP.SPREADSHEET_CONTROLE_ID); }
function questoesSheet_() { return bancoSs_().getSheetByName(APP.SHEET_QUESTOES); }
function configSheet_() { return bancoSs_().getSheetByName(APP.SHEET_CONFIG); }
function respostasSheet_() {
  const sh = controleSs_().getSheetByName(APP.SHEET_RESPOSTAS);
  if (!sh) throw new Error('Aba RESPOSTAS_ALUNOS não encontrada na planilha de Controle e Correção.');
  return sh;
}

function prepararLinha_(sh, row) {
  // IMPORTANTE: só cria checkboxes na linha efetivamente utilizada.
  // Nunca pré-preencher centenas de linhas, evitando o problema da linha 1001.
  [COL.GERAR_CORRECAO, COL.REVISADO, COL.APROVAR_ENVIAR].forEach(c => {
    sh.getRange(row, c).insertCheckboxes().setValue(false);
  });
  sh.getRange(row, COL.INICIO).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sh.getRange(row, COL.ENVIO).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sh.getRange(row, COL.DATA_CORRECAO).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sh.getRange(row, COL.DATA_ENVIO).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

function atualizarCabecalhosV4_() {
  const sh = respostasSheet_();
  sh.getRange(1, COL.GERAR_CORRECAO).setValue('GERAR CORREÇÃO');
  sh.getRange(1, COL.DATA_CORRECAO).setValue('DATA CORREÇÃO');
  sh.getRange(1, COL.MENCAO_CORRECAO).setValue('MENÇÃO CORREÇÃO');
}

function testarBackendV4() {
  atualizarCabecalhosV4_();
  return {
    versao:APP.VERSAO,
    banco:bancoSs_().getName(),
    controle:controleSs_().getName(),
    questoes:lerQuestoes_().length,
    ultimaLinha:respostasSheet_().getLastRow()
  };
}

function normEmail_(v) { return String(v || '').trim().toLowerCase(); }
function emailOk_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')); }
function criarId_() { return 'ADM-' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Math.floor(1000 + Math.random() * 9000); }
function iso_(v) { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); }
function formatarData_(d) { return Utilities.formatDate(d instanceof Date ? d : new Date(d), APP.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'); }
function erroTexto_(err) { return err && err.message ? err.message : String(err); }

function shuffle_(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function segRelogio_(s) {
  s = Math.max(0, Math.floor(Number(s || 0)));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(n => String(n).padStart(2, '0')).join(':');
}

function textoAlternativa_(q, id) {
  const a = (q.alternativas || []).find(x => x.id === id);
  return a ? a.texto : (id ? '[alternativa não encontrada]' : 'Não respondida');
}

function acrescentarObservacao_(row, texto) {
  const sh = respostasSheet_();
  const rg = sh.getRange(row, COL.OBSERVACOES);
  const atual = String(rg.getValue() || '').trim();
  rg.setValue(atual ? atual + '\n' + texto : texto);
}

function extrairDriveId_(url) {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : null;
}
