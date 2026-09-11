/*
 * PROVA - ADMINISTRAÇÃO PÚBLICA
 * Backend Google Apps Script
 * Interface futura: GitHub Pages
 * Banco/controle: Google Sheets
 *
 * Fluxo:
 * 1) aluno informa e-mail e inicia/retoma a tentativa;
 * 2) servidor sorteia uma única vez a ordem das questões e alternativas;
 * 3) início, sorteio, respostas e tempo ficam gravados no Sheets;
 * 4) queda de internet/fechamento do navegador não reinicia o tempo;
 * 5) prova finaliza automaticamente ao atingir 30 min;
 * 6) depois de finalizada, o mesmo e-mail não abre nova tentativa;
 * 7) planilha mantém os gatilhos CORRIGIR COM IA, REVISADO PELO PROFESSOR e APROVAR E ENVIAR.
 */

const APP = {
  SPREADSHEET_ID: '1IhZ7u5eSWVTf2Hv8g5eMBycUlz5bhYcbMvkMHQFizAQ',
  SHEET_QUESTOES: 'BANCO_QUESTOES',
  SHEET_RESPOSTAS: 'RESPOSTAS_ALUNOS',
  SHEET_CONFIG: 'CONFIGURACAO',
  PASTA_CORRECOES_ID: '1AA00TSqjyepE_NySsS0zwIa6UyNkA-80',
  TIMEZONE: 'America/Sao_Paulo',
  VERSAO: 'ADM-PUBLICA-2026-09-v1'
};

const COL = {
  ID: 1,
  INICIO: 2,
  NOME: 3,
  EMAIL: 4,
  TURMA: 5,
  VERSAO: 6,
  ENVIO: 7,
  TEMPO_UTILIZADO: 8,
  TEMPO_REFERENCIA: 9,
  EXCEDENTE: 10,
  ACERTOS: 11,
  NOTA: 12,
  MENCAO_AUTO: 13,
  STATUS: 14,
  CORRIGIR_IA: 15,
  DATA_CORRECAO_IA: 16,
  MENCAO_IA: 17,
  ARQUIVO_CORRECAO: 18,
  REVISADO: 19,
  MENCAO_FINAL: 20,
  APROVAR_ENVIAR: 21,
  DATA_ENVIO: 22,
  STATUS_ENVIO: 23,
  ESTADO_JSON: 24,
  OBSERVACOES: 25
};

/* =========================
 * WEB APP / API
 * ========================= */

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'ping').trim();
  try {
    if (action === 'ping') {
      return json_({ ok: true, sistema: 'Prova Administração Pública', versao: APP.VERSAO, agora: agoraIso_() });
    }
    if (action === 'consultar') {
      return json_(consultarTentativa_(e.parameter.email || ''));
    }
    return json_({ ok: false, erro: 'Ação GET inválida.' });
  } catch (err) {
    return json_({ ok: false, erro: erroTexto_(err) });
  }
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = String(payload.action || '').trim();

    switch (action) {
      case 'iniciarOuRetomar':
        return json_(iniciarOuRetomar_(payload));
      case 'consultar':
        return json_(consultarTentativa_(payload.email || ''));
      case 'salvarResposta':
        return json_(salvarResposta_(payload));
      case 'salvarRespostas':
        return json_(salvarRespostasLote_(payload));
      case 'finalizar':
        return json_(finalizarPorAluno_(payload));
      case 'ping':
        return json_({ ok: true, sistema: 'Prova Administração Pública', versao: APP.VERSAO, agora: agoraIso_() });
      default:
        return json_({ ok: false, erro: 'Ação POST inválida.' });
    }
  } catch (err) {
    return json_({ ok: false, erro: erroTexto_(err) });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const raw = e.postData.contents;
  try { return JSON.parse(raw); } catch (_) {}

  const obj = {};
  raw.split('&').forEach(par => {
    const p = par.split('=');
    obj[decodeURIComponent(p[0] || '')] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
  });
  return obj;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================
 * TENTATIVA DO ALUNO
 * ========================= */

function iniciarOuRetomar_(payload) {
  const email = normalizarEmail_(payload.email);
  const nome = String(payload.nome || '').trim();
  const turma = String(payload.turma || '').trim();

  if (!emailValido_(email)) return { ok: false, erro: 'Informe um e-mail válido.' };
  if (!nome) return { ok: false, erro: 'Informe o nome do aluno.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const sh = respostasSheet_();
    const existente = localizarTentativaPorEmail_(email);

    if (existente) {
      return montarRetornoTentativa_(existente.row);
    }

    const janela = validarJanelaProva_(true);
    if (!janela.ok) return janela;

    const config = lerConfig_();
    const questoes = lerBancoQuestoes_();
    const total = Math.min(Number(config.TOTAL_QUESTOES || questoes.length), questoes.length);
    if (!total) return { ok: false, erro: 'Banco de questões vazio.' };

    const selecionadas = embaralhar_(questoes.slice()).slice(0, total);
    const questionOrder = selecionadas.map(q => q.id);
    const optionOrder = {};

    selecionadas.forEach(q => {
      optionOrder[q.id] = embaralhar_(q.alternativas.map(a => a.id));
    });

    const estado = {
      schema: 1,
      questionOrder,
      optionOrder,
      answers: {},
      lastSavedAt: agoraIso_()
    };

    const inicio = new Date();
    const id = criarIdTentativa_();
    const semente = Utilities.getUuid();
    const tempoMin = Number(config.TEMPO_MINUTOS || 30);

    const row = [
      id,
      inicio,
      nome,
      email,
      turma,
      semente,
      '',
      '',
      tempoMin,
      '',
      '',
      '',
      '',
      String(config.STATUS_PADRAO || 'EM ANDAMENTO'),
      false,
      '',
      '',
      '',
      false,
      '',
      false,
      '',
      '',
      JSON.stringify(estado),
      'Tentativa iniciada em ' + formatarData_(inicio)
    ];

    sh.appendRow(row);
    const newRow = sh.getLastRow();
    formatarLinhaNova_(sh, newRow);

    return montarRetornoTentativa_(newRow);
  } finally {
    lock.releaseLock();
  }
}

function consultarTentativa_(emailRaw) {
  const email = normalizarEmail_(emailRaw);
  if (!emailValido_(email)) return { ok: false, erro: 'Informe um e-mail válido.' };

  const tentativa = localizarTentativaPorEmail_(email);
  if (!tentativa) return { ok: false, existe: false, erro: 'Nenhuma tentativa encontrada para este e-mail.' };
  return montarRetornoTentativa_(tentativa.row);
}

function salvarResposta_(payload) {
  return salvarRespostasLote_({
    email: payload.email,
    respostas: [{ questionId: payload.questionId, optionId: payload.optionId }]
  });
}

function salvarRespostasLote_(payload) {
  const email = normalizarEmail_(payload.email);
  const respostas = Array.isArray(payload.respostas) ? payload.respostas : [];
  if (!emailValido_(email)) return { ok: false, erro: 'E-mail inválido.' };
  if (!respostas.length) return { ok: true, salvo: false, mensagem: 'Nenhuma resposta recebida.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const tentativa = localizarTentativaPorEmail_(email);
    if (!tentativa) return { ok: false, erro: 'Tentativa não encontrada.' };

    const sh = respostasSheet_();
    const status = String(sh.getRange(tentativa.row, COL.STATUS).getDisplayValue() || '');
    if (statusFinal_(status)) return { ok: false, finalizada: true, erro: 'Esta prova já foi finalizada.' };

    const tempo = calcularTempo_(tentativa.row);
    if (tempo.restanteSegundos <= 0) {
      finalizarTentativa_(tentativa.row, 'FINALIZADA POR TEMPO');
      return montarRetornoTentativa_(tentativa.row);
    }

    const estado = lerEstadoLinha_(tentativa.row);
    const validas = validarRespostasRecebidas_(estado, respostas);

    validas.forEach(r => {
      if (r.optionId === null || r.optionId === '') delete estado.answers[r.questionId];
      else estado.answers[r.questionId] = r.optionId;
    });
    estado.lastSavedAt = agoraIso_();

    sh.getRange(tentativa.row, COL.ESTADO_JSON).setValue(JSON.stringify(estado));

    return {
      ok: true,
      salvo: true,
      respostasSalvas: Object.keys(estado.answers).length,
      tempoRestanteSegundos: calcularTempo_(tentativa.row).restanteSegundos,
      servidorAgora: agoraIso_()
    };
  } finally {
    lock.releaseLock();
  }
}

function finalizarPorAluno_(payload) {
  const email = normalizarEmail_(payload.email);
  if (!emailValido_(email)) return { ok: false, erro: 'E-mail inválido.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const tentativa = localizarTentativaPorEmail_(email);
    if (!tentativa) return { ok: false, erro: 'Tentativa não encontrada.' };

    if (Array.isArray(payload.respostas) && payload.respostas.length) {
      const sh = respostasSheet_();
      const estado = lerEstadoLinha_(tentativa.row);
      validarRespostasRecebidas_(estado, payload.respostas).forEach(r => {
        if (r.optionId === null || r.optionId === '') delete estado.answers[r.questionId];
        else estado.answers[r.questionId] = r.optionId;
      });
      estado.lastSavedAt = agoraIso_();
      sh.getRange(tentativa.row, COL.ESTADO_JSON).setValue(JSON.stringify(estado));
    }

    const statusAtual = String(respostasSheet_().getRange(tentativa.row, COL.STATUS).getDisplayValue() || '');
    if (!statusFinal_(statusAtual)) {
      const tempo = calcularTempo_(tentativa.row);
      finalizarTentativa_(tentativa.row, tempo.restanteSegundos <= 0 ? 'FINALIZADA POR TEMPO' : 'FINALIZADA PELO ALUNO');
    }

    return montarRetornoTentativa_(tentativa.row);
  } finally {
    lock.releaseLock();
  }
}

function montarRetornoTentativa_(row) {
  const sh = respostasSheet_();
  const status = String(sh.getRange(row, COL.STATUS).getDisplayValue() || '');

  if (!statusFinal_(status)) {
    const janela = validarJanelaProva_(false);
    const tempo = calcularTempo_(row);
    if (!janela.ok || tempo.restanteSegundos <= 0) {
      finalizarTentativa_(row, tempo.restanteSegundos <= 0 ? 'FINALIZADA POR TEMPO' : 'FINALIZADA - JANELA ENCERRADA');
    }
  }

  const valores = sh.getRange(row, 1, 1, COL.OBSERVACOES).getValues()[0];
  const estado = parseEstado_(valores[COL.ESTADO_JSON - 1]);
  const questoesMap = mapaQuestoes_();
  const finalizada = statusFinal_(String(valores[COL.STATUS - 1] || ''));
  const tempo = calcularTempo_(row);

  const questoes = (estado.questionOrder || []).map((qid, idx) => {
    const q = questoesMap[qid];
    if (!q) return null;
    const ordemAlt = (estado.optionOrder && estado.optionOrder[qid]) || q.alternativas.map(a => a.id);
    const altMap = {};
    q.alternativas.forEach(a => altMap[a.id] = a.texto);

    return {
      numero: idx + 1,
      id: q.id,
      enunciado: q.enunciado,
      alternativas: ordemAlt.map((aid, i) => ({
        id: aid,
        letra: ['A', 'B', 'C', 'D'][i] || String(i + 1),
        texto: altMap[aid] || ''
      })),
      respostaMarcada: (estado.answers && estado.answers[qid]) || null
    };
  }).filter(Boolean);

  const retorno = {
    ok: true,
    existe: true,
    id: valores[COL.ID - 1],
    nome: valores[COL.NOME - 1],
    email: valores[COL.EMAIL - 1],
    turma: valores[COL.TURMA - 1],
    status: valores[COL.STATUS - 1],
    finalizada,
    inicio: dataIso_(valores[COL.INICIO - 1]),
    servidorAgora: agoraIso_(),
    tempoTotalSegundos: tempo.totalSegundos,
    tempoRestanteSegundos: finalizada ? 0 : tempo.restanteSegundos,
    questoes,
    respostasSalvas: Object.keys(estado.answers || {}).length
  };

  if (finalizada) {
    retorno.envio = dataIso_(valores[COL.ENVIO - 1]);
    retorno.acertos = valores[COL.ACERTOS - 1];
    retorno.nota = valores[COL.NOTA - 1];
    retorno.mencao = valores[COL.MENCAO_FINAL - 1] || valores[COL.MENCAO_AUTO - 1];
    // O gabarito não é enviado pela API ao aluno.
  }

  return retorno;
}

/* =========================
 * FINALIZAÇÃO / CORREÇÃO OBJETIVA
 * ========================= */

function finalizarTentativa_(row, statusFinal) {
  const sh = respostasSheet_();
  const atual = String(sh.getRange(row, COL.STATUS).getDisplayValue() || '');
  if (statusFinal_(atual)) return;

  const agora = new Date();
  const tempo = calcularTempo_(row);
  const correcao = corrigirLinha_(row);
  const config = lerConfig_();
  const limite = Number(config.TEMPO_MINUTOS || 30) * 60;
  const usado = Math.min(tempo.decorridoSegundos, limite);
  const excedente = Math.max(0, tempo.decorridoSegundos - limite);

  sh.getRange(row, COL.ENVIO).setValue(agora);
  sh.getRange(row, COL.TEMPO_UTILIZADO).setValue(segundosParaRelogio_(usado));
  sh.getRange(row, COL.TEMPO_REFERENCIA).setValue(Number(config.TEMPO_MINUTOS || 30));
  sh.getRange(row, COL.EXCEDENTE).setValue(segundosParaRelogio_(excedente));
  sh.getRange(row, COL.ACERTOS).setValue(correcao.acertos);
  sh.getRange(row, COL.NOTA).setValue(correcao.nota);
  sh.getRange(row, COL.MENCAO_AUTO).setValue(correcao.mencao);
  sh.getRange(row, COL.STATUS).setValue(statusFinal || 'FINALIZADA');

  if (!sh.getRange(row, COL.MENCAO_FINAL).getValue()) {
    sh.getRange(row, COL.MENCAO_FINAL).setValue(correcao.mencao);
  }

  acrescentarObservacao_(row, 'Prova finalizada: ' + (statusFinal || 'FINALIZADA') + ' em ' + formatarData_(agora));
}

function corrigirLinha_(row) {
  const estado = lerEstadoLinha_(row);
  const banco = mapaQuestoes_();
  const ids = estado.questionOrder || Object.keys(banco);
  let acertos = 0;
  const detalhes = [];

  ids.forEach(qid => {
    const q = banco[qid];
    if (!q) return;
    const marcada = (estado.answers && estado.answers[qid]) || null;
    const acertou = marcada === q.corretaId;
    if (acertou) acertos++;
    detalhes.push({ questionId: qid, marcada, correta: q.corretaId, acertou });
  });

  const total = ids.length || 20;
  const nota = Number(((acertos / total) * 10).toFixed(2));
  return { acertos, total, nota, mencao: calcularMencao_(nota), detalhes };
}

function calcularMencao_(nota) {
  // Faixas iniciais. Se desejar, altere aqui antes da aplicação oficial.
  if (nota >= 9) return 'MB';
  if (nota >= 7) return 'B';
  if (nota >= 5) return 'R';
  return 'I';
}

/* =========================
 * GATILHOS DA PLANILHA
 * ========================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PROVA ADM. PÚBLICA')
    .addItem('Instalar / reinstalar gatilho', 'instalarSistema')
    .addItem('Verificar estrutura', 'verificarEstrutura')
    .addItem('Testar backend', 'testarBackend')
    .addToUi();
}

function instalarSistema() {
  const ss = SpreadsheetApp.openById(APP.SPREADSHEET_ID);

  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'gatilhoEdicaoInstalavel') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('gatilhoEdicaoInstalavel')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  verificarEstrutura();
  SpreadsheetApp.getUi().alert('Sistema instalado. O gatilho de edição foi criado com sucesso.');
}

function gatilhoEdicaoInstalavel(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== APP.SHEET_RESPOSTAS) return;
    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row < 2 || e.value !== 'TRUE') return;

    if (col === COL.CORRIGIR_IA) {
      processarCorrecaoIA_(row);
    } else if (col === COL.REVISADO) {
      marcarRevisado_(row);
    } else if (col === COL.APROVAR_ENVIAR) {
      aprovarEEnviar_(row);
    }
  } catch (err) {
    try {
      const row = e && e.range ? e.range.getRow() : null;
      if (row && row >= 2) acrescentarObservacao_(row, 'ERRO NO GATILHO: ' + erroTexto_(err));
    } catch (_) {}
    throw err;
  }
}

function processarCorrecaoIA_(row) {
  const sh = respostasSheet_();
  const status = String(sh.getRange(row, COL.STATUS).getDisplayValue() || '');
  if (!statusFinal_(status)) {
    sh.getRange(row, COL.CORRIGIR_IA).setValue(false);
    throw new Error('A prova precisa estar finalizada antes da correção.');
  }

  sh.getRange(row, COL.STATUS).setValue('CORRIGINDO COM IA');

  const correcao = corrigirLinha_(row);
  const valores = sh.getRange(row, 1, 1, COL.OBSERVACOES).getValues()[0];
  const feedback = gerarFeedbackIAOuAutomatico_(row, correcao);
  const arquivo = gerarDocumentoCorrecao_(row, correcao, feedback);

  sh.getRange(row, COL.DATA_CORRECAO_IA).setValue(new Date());
  sh.getRange(row, COL.MENCAO_IA).setValue(correcao.mencao);
  sh.getRange(row, COL.ARQUIVO_CORRECAO).setValue(arquivo.url);
  sh.getRange(row, COL.STATUS).setValue('CORRIGIDO POR IA - AGUARDANDO REVISÃO');

  if (!sh.getRange(row, COL.MENCAO_FINAL).getValue()) {
    sh.getRange(row, COL.MENCAO_FINAL).setValue(correcao.mencao);
  }

  acrescentarObservacao_(row, 'Correção processada em ' + formatarData_(new Date()) + '. Aluno: ' + valores[COL.NOME - 1]);
}

function marcarRevisado_(row) {
  const sh = respostasSheet_();
  const arquivo = sh.getRange(row, COL.ARQUIVO_CORRECAO).getDisplayValue();
  if (!arquivo) {
    sh.getRange(row, COL.REVISADO).setValue(false);
    throw new Error('Primeiro marque CORRIGIR COM IA e aguarde a geração da correção.');
  }

  if (!sh.getRange(row, COL.MENCAO_FINAL).getValue()) {
    sh.getRange(row, COL.MENCAO_FINAL).setValue(
      sh.getRange(row, COL.MENCAO_IA).getValue() || sh.getRange(row, COL.MENCAO_AUTO).getValue()
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

  const email = normalizarEmail_(sh.getRange(row, COL.EMAIL).getDisplayValue());
  const nome = sh.getRange(row, COL.NOME).getDisplayValue();
  const url = sh.getRange(row, COL.ARQUIVO_CORRECAO).getDisplayValue();
  if (!emailValido_(email)) {
    sh.getRange(row, COL.APROVAR_ENVIAR).setValue(false);
    throw new Error('E-mail do aluno inválido.');
  }
  if (!url) {
    sh.getRange(row, COL.APROVAR_ENVIAR).setValue(false);
    throw new Error('Arquivo de correção não encontrado.');
  }

  const fileId = extrairDriveId_(url);
  const anexos = [];
  if (fileId) {
    try { anexos.push(DriveApp.getFileById(fileId).getBlob().setName('Correcao_Prova_Administracao_Publica.pdf')); } catch (_) {}
  }

  const mencao = sh.getRange(row, COL.MENCAO_FINAL).getDisplayValue();
  const nota = sh.getRange(row, COL.NOTA).getDisplayValue();
  const acertos = sh.getRange(row, COL.ACERTOS).getDisplayValue();

  const assunto = 'Devolutiva - Prova de Administração Pública';
  const corpo = [
    'Olá, ' + nome + '.',
    '',
    'Segue a devolutiva da Prova de Administração Pública.',
    'Acertos: ' + acertos + '/20',
    'Nota: ' + nota,
    'Menção final: ' + mencao,
    '',
    'Professor Junior Pedro Colombo'
  ].join('\n');

  GmailApp.sendEmail(email, assunto, corpo, anexos.length ? { attachments: anexos } : {});

  sh.getRange(row, COL.DATA_ENVIO).setValue(new Date());
  sh.getRange(row, COL.STATUS_ENVIO).setValue('ENVIADO');
  sh.getRange(row, COL.STATUS).setValue('DEVOLUTIVA ENVIADA');
  acrescentarObservacao_(row, 'Devolutiva enviada para ' + email + ' em ' + formatarData_(new Date()));
}

/* =========================
 * CORREÇÃO / PDF
 * ========================= */

function gerarFeedbackIAOuAutomatico_(row, correcao) {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) return feedbackAutomatico_(correcao);

  try {
    const model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4.1-mini';
    const dados = dadosErrosParaFeedback_(row, correcao);
    const prompt = [
      'Você é professor corrigindo uma prova objetiva de Administração Pública.',
      'Use SOMENTE os dados fornecidos abaixo. Não acrescente conteúdos externos.',
      'Faça uma devolutiva curta, pedagógica e respeitosa em português do Brasil.',
      'Não altere nota, acertos ou menção.',
      '',
      JSON.stringify(dados)
    ].join('\n');

    const resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      })
    });

    if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
      const obj = JSON.parse(resp.getContentText());
      const txt = obj && obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content;
      if (txt) return String(txt).trim();
    }
  } catch (_) {}

  return feedbackAutomatico_(correcao);
}

function dadosErrosParaFeedback_(row, correcao) {
  const estado = lerEstadoLinha_(row);
  const banco = mapaQuestoes_();
  const erros = correcao.detalhes.filter(d => !d.acertou).map(d => {
    const q = banco[d.questionId];
    return {
      questao: d.questionId,
      enunciado: q ? q.enunciado : '',
      respostaAluno: q ? textoAlternativa_(q, d.marcada) : '',
      respostaCorreta: q ? textoAlternativa_(q, d.correta) : ''
    };
  });

  return {
    acertos: correcao.acertos,
    total: correcao.total,
    nota: correcao.nota,
    mencao: correcao.mencao,
    erros
  };
}

function feedbackAutomatico_(correcao) {
  if (correcao.acertos === correcao.total) {
    return 'Excelente desempenho. Todas as questões foram respondidas corretamente.';
  }
  return 'Resultado objetivo: ' + correcao.acertos + ' acerto(s) em ' + correcao.total +
    '. Revise os itens indicados abaixo comparando sua resposta com o gabarito da atividade.';
}

function gerarDocumentoCorrecao_(row, correcao, feedback) {
  const sh = respostasSheet_();
  const nome = sh.getRange(row, COL.NOME).getDisplayValue();
  const email = sh.getRange(row, COL.EMAIL).getDisplayValue();
  const estado = lerEstadoLinha_(row);
  const banco = mapaQuestoes_();

  const titulo = nome + ' - Correção Prova Administração Pública - ' + sh.getRange(row, COL.ID).getDisplayValue();
  const doc = DocumentApp.create(titulo);
  const body = doc.getBody();

  body.appendParagraph('PROVA DE ADMINISTRAÇÃO PÚBLICA').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Aluno: ' + nome);
  body.appendParagraph('E-mail: ' + email);
  body.appendParagraph('Acertos: ' + correcao.acertos + '/' + correcao.total);
  body.appendParagraph('Nota: ' + correcao.nota.toFixed(2));
  body.appendParagraph('Menção: ' + correcao.mencao);
  body.appendParagraph('');
  body.appendParagraph('Devolutiva').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(feedback || '');
  body.appendParagraph('');
  body.appendParagraph('Questões').setHeading(DocumentApp.ParagraphHeading.HEADING2);

  (estado.questionOrder || []).forEach((qid, i) => {
    const q = banco[qid];
    if (!q) return;
    const marcada = (estado.answers && estado.answers[qid]) || null;
    const acertou = marcada === q.corretaId;
    body.appendParagraph((i + 1) + '. ' + q.enunciado).setBold(true);
    body.appendParagraph('Sua resposta: ' + (marcada ? textoAlternativa_(q, marcada) : 'Não respondida'));
    body.appendParagraph('Resposta correta: ' + textoAlternativa_(q, q.corretaId));
    body.appendParagraph(acertou ? 'Resultado: CORRETA' : 'Resultado: INCORRETA');
    body.appendParagraph('');
  });

  body.appendParagraph('Professor Junior Pedro Colombo');
  doc.saveAndClose();

  const pasta = DriveApp.getFolderById(APP.PASTA_CORRECOES_ID);
  const docFile = DriveApp.getFileById(doc.getId());
  pasta.addFile(docFile);
  try { DriveApp.getRootFolder().removeFile(docFile); } catch (_) {}

  const pdfBlob = docFile.getAs(MimeType.PDF).setName(titulo + '.pdf');
  const pdf = pasta.createFile(pdfBlob);

  return { id: pdf.getId(), url: pdf.getUrl(), docId: doc.getId() };
}

/* =========================
 * BANCO DE QUESTÕES / ESTADO
 * ========================= */

function lerBancoQuestoes_() {
  const sh = questoesSheet_();
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];

  const header = vals[0].map(v => String(v).trim());
  const idx = {};
  header.forEach((h, i) => idx[h] = i);

  const obrig = ['ID', 'ENUNCIADO', 'ALT_A', 'ALT_B', 'ALT_C', 'ALT_D', 'CORRETA_ID'];
  obrig.forEach(h => { if (idx[h] === undefined) throw new Error('Coluna ausente em BANCO_QUESTOES: ' + h); });

  return vals.slice(1).filter(r => r[idx.ID]).map(r => ({
    id: String(r[idx.ID]).trim(),
    enunciado: String(r[idx.ENUNCIADO] || '').trim(),
    corretaId: String(r[idx.CORRETA_ID] || '').trim(),
    fonte: idx.FONTE !== undefined ? String(r[idx.FONTE] || '').trim() : '',
    alternativas: [
      { id: 'ALT_A', texto: String(r[idx.ALT_A] || '').trim() },
      { id: 'ALT_B', texto: String(r[idx.ALT_B] || '').trim() },
      { id: 'ALT_C', texto: String(r[idx.ALT_C] || '').trim() },
      { id: 'ALT_D', texto: String(r[idx.ALT_D] || '').trim() }
    ]
  }));
}

function mapaQuestoes_() {
  const map = {};
  lerBancoQuestoes_().forEach(q => map[q.id] = q);
  return map;
}

function validarRespostasRecebidas_(estado, respostas) {
  const qids = new Set(estado.questionOrder || []);
  return respostas.map(r => ({
    questionId: String(r.questionId || '').trim(),
    optionId: r.optionId === null ? null : String(r.optionId || '').trim()
  })).filter(r => {
    if (!qids.has(r.questionId)) return false;
    if (r.optionId === null || r.optionId === '') return true;
    const permitidas = (estado.optionOrder && estado.optionOrder[r.questionId]) || [];
    return permitidas.indexOf(r.optionId) >= 0;
  });
}

function lerEstadoLinha_(row) {
  return parseEstado_(respostasSheet_().getRange(row, COL.ESTADO_JSON).getValue());
}

function parseEstado_(raw) {
  if (!raw) return { questionOrder: [], optionOrder: {}, answers: {} };
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    obj.questionOrder = obj.questionOrder || [];
    obj.optionOrder = obj.optionOrder || {};
    obj.answers = obj.answers || {};
    return obj;
  } catch (_) {
    throw new Error('Estado da tentativa corrompido.');
  }
}

/* =========================
 * CONFIGURAÇÃO / TEMPO
 * ========================= */

function lerConfig_() {
  const sh = configSheet_();
  const last = sh.getLastRow();
  const vals = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  const obj = {};
  vals.forEach(r => {
    const k = String(r[0] || '').trim();
    if (k) obj[k] = r[1];
  });
  return obj;
}

function validarJanelaProva_(novoAcesso) {
  const cfg = lerConfig_();
  const agora = new Date();
  const inicio = parseDataConfig_(cfg.DATA_LIBERACAO);
  const fim = parseDataConfig_(cfg.DATA_FECHAMENTO);

  if (inicio && agora < inicio) {
    return { ok: false, bloqueada: true, erro: 'A prova ainda não foi liberada.', liberacao: dataIso_(inicio) };
  }
  if (fim && agora > fim) {
    return { ok: false, bloqueada: true, erro: 'O período de realização da prova foi encerrado.', fechamento: dataIso_(fim) };
  }
  return { ok: true };
}

function calcularTempo_(row) {
  const sh = respostasSheet_();
  const inicio = sh.getRange(row, COL.INICIO).getValue();
  const cfg = lerConfig_();
  const totalSegundos = Number(cfg.TEMPO_MINUTOS || 30) * 60;
  const start = inicio instanceof Date ? inicio : new Date(inicio);
  const decorridoSegundos = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  return {
    totalSegundos,
    decorridoSegundos,
    restanteSegundos: Math.max(0, totalSegundos - decorridoSegundos)
  };
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

/* =========================
 * PLANILHA / INSTALAÇÃO
 * ========================= */

function verificarEstrutura() {
  const ss = SpreadsheetApp.openById(APP.SPREADSHEET_ID);
  [APP.SHEET_QUESTOES, APP.SHEET_RESPOSTAS, APP.SHEET_CONFIG].forEach(n => {
    if (!ss.getSheetByName(n)) throw new Error('Aba não encontrada: ' + n);
  });

  const head = respostasSheet_().getRange(1, 1, 1, COL.OBSERVACOES).getDisplayValues()[0];
  const esperados = {
    1: 'ID', 2: 'HORÁRIO DE INÍCIO', 3: 'NOME DO ALUNO', 4: 'E-MAIL PARA DEVOLUTIVA',
    5: 'TURMA', 6: 'VERSÃO/SEMENTE', 7: 'HORÁRIO DE ENVIO', 8: 'TEMPO UTILIZADO',
    9: 'TEMPO DE REFERÊNCIA', 10: 'EXCEDENTE', 11: 'ACERTOS', 12: 'NOTA',
    13: 'MENÇÃO AUTOMÁTICA', 14: 'STATUS', 15: 'CORRIGIR COM IA', 16: 'DATA CORREÇÃO IA',
    17: 'MENÇÃO IA', 18: 'ARQUIVO CORREÇÃO', 19: 'REVISADO PELO PROFESSOR', 20: 'MENÇÃO FINAL',
    21: 'APROVAR E ENVIAR', 22: 'DATA ENVIO', 23: 'STATUS ENVIO', 24: 'RESPOSTAS/ORDEM (JSON)', 25: 'OBSERVAÇÕES'
  };

  Object.keys(esperados).forEach(k => {
    const i = Number(k);
    if (String(head[i - 1] || '').trim() !== esperados[i]) {
      throw new Error('Cabeçalho divergente na coluna ' + i + '. Esperado: ' + esperados[i]);
    }
  });

  garantirCheckboxes_();
  return true;
}

function garantirCheckboxes_() {
  const sh = respostasSheet_();
  const max = Math.max(sh.getMaxRows(), 200);
  [COL.CORRIGIR_IA, COL.REVISADO, COL.APROVAR_ENVIAR].forEach(c => {
    sh.getRange(2, c, max - 1, 1).insertCheckboxes();
  });
}

function formatarLinhaNova_(sh, row) {
  [COL.CORRIGIR_IA, COL.REVISADO, COL.APROVAR_ENVIAR].forEach(c => {
    sh.getRange(row, c).insertCheckboxes().setValue(false);
  });
  sh.getRange(row, COL.INICIO).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

function testarBackend() {
  const q = lerBancoQuestoes_();
  const cfg = lerConfig_();
  SpreadsheetApp.getUi().alert(
    'Backend OK.\nQuestões carregadas: ' + q.length + '\nTempo: ' + (cfg.TEMPO_MINUTOS || 30) + ' minutos.'
  );
}

/* =========================
 * HELPERS
 * ========================= */

function ss_() { return SpreadsheetApp.openById(APP.SPREADSHEET_ID); }
function questoesSheet_() { return ss_().getSheetByName(APP.SHEET_QUESTOES); }
function respostasSheet_() { return ss_().getSheetByName(APP.SHEET_RESPOSTAS); }
function configSheet_() { return ss_().getSheetByName(APP.SHEET_CONFIG); }

function localizarTentativaPorEmail_(email) {
  const sh = respostasSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, COL.EMAIL, last - 1, 1).getDisplayValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (normalizarEmail_(vals[i][0]) === email) return { row: i + 2 };
  }
  return null;
}

function statusFinal_(status) {
  const s = String(status || '').toUpperCase();
  return s.indexOf('FINALIZADA') >= 0 || s === 'DEVOLUTIVA ENVIADA' || s === 'REVISADO PELO PROFESSOR' || s.indexOf('CORRIGIDO') >= 0 || s.indexOf('CORRIGINDO') >= 0;
}

function normalizarEmail_(v) { return String(v || '').trim().toLowerCase(); }
function emailValido_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '')); }
function criarIdTentativa_() { return 'ADM-' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Math.floor(1000 + Math.random() * 9000); }
function agoraIso_() { return new Date().toISOString(); }
function dataIso_(v) { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); }
function formatarData_(d) { return Utilities.formatDate(d instanceof Date ? d : new Date(d), APP.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'); }
function erroTexto_(err) { return err && err.message ? err.message : String(err); }

function embaralhar_(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function segundosParaRelogio_(seg) {
  seg = Math.max(0, Math.floor(Number(seg || 0)));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
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
  const s = String(url || '');
  const m = s.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}
