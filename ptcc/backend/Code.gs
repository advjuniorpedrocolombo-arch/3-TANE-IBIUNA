const SPREADSHEET_ID = '1uVrwJGkExmTkpoEAoMGTQ73z5zlK45xDvZ3sNRyBb3A';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const TZ = 'America/Sao_Paulo';

function doGet() {
  return json_({
    ok: true,
    sistema: 'PTCC Marketing 2026 - Ibiúna',
    versao: getConfig_().VERSAO_SISTEMA || '1.0.0'
  });
}

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(p.action || '').trim();
    const handlers = {
      submitTerm: submitTerm_,
      login: login_,
      forgotPassword: forgotPassword_,
      resetPassword: resetPassword_,
      dashboard: dashboard_,
      submitStage: submitStage_,
      logout: logout_
    };
    if (!handlers[action]) throw new Error('Ação inválida.');
    return json_(handlers[action](p));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function setupInicial() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('AUTH_PEPPER')) {
    props.setProperty('AUTH_PEPPER', Utilities.getUuid() + Utilities.getUuid());
  }
  const url = ScriptApp.getService().getUrl();
  if (url) setConfig_('URL_WEBAPP', url);
  return { ok: true, url: url || '', pepperConfigurado: true };
}

function submitTerm_(p) {
  const nomeGrupo = req_(p.nomeGrupo, 'Nome do grupo');
  const representante = req_(p.representante, 'Representante');
  const emailRep = email_(p.emailRepresentante, 'E-mail do representante');
  const vice = req_(p.viceRepresentante, 'Vice-representante');
  const emailVice = email_(p.emailVice, 'E-mail do vice-representante');
  const integrantes = Array.isArray(p.integrantes) ? p.integrantes : [];
  const tema = String(p.tema || '').trim();
  const pdf = decodePdf_(p.pdfBase64, p.fileName || 'Termo_de_Compromisso.pdf');
  const cfg = getConfig_();
  if (!cfg.PASTA_TERMOS_ID) throw new Error('PASTA_TERMOS_ID não configurada.');

  const protocolo = nextProtocol_('TERMO');
  const pasta = DriveApp.getFolderById(cfg.PASTA_TERMOS_ID);
  const file = pasta.createFile(pdf.blob.setName(`${protocolo} - ${safe_(nomeGrupo)}.pdf`));
  const now = new Date();

  appendByHeaders_('TERMOS_PENDENTES', {
    PROTOCOLO: protocolo,
    TIMESTAMP: now,
    NOME_GRUPO: nomeGrupo,
    TEMA: tema,
    REPRESENTANTE: representante,
    EMAIL_REPRESENTANTE: emailRep,
    VICE_REPRESENTANTE: vice,
    EMAIL_VICE: emailVice,
    INTEGRANTES_JSON: JSON.stringify(integrantes),
    ARQUIVO_ID: file.getId(),
    ARQUIVO_URL: file.getUrl(),
    STATUS: 'AGUARDANDO VALIDAÇÃO',
    GRUPO_CRIADO: '',
    OBSERVACOES: ''
  });

  appendByHeaders_('ENTREGAS', {
    PROTOCOLO: protocolo,
    ID_ENTREGA: Utilities.getUuid(),
    TIMESTAMP: now,
    ID_GRUPO: 'PENDENTE',
    ID_ETAPA: 'ETP02',
    VERSAO: 1,
    NOME_ARQUIVO: file.getName(),
    ARQUIVO_DRIVE_URL: file.getUrl(),
    ARQUIVO_DRIVE_ID: file.getId(),
    ENVIADO_POR: representante,
    EMAIL_ENVIO: emailRep,
    STATUS: 'AGUARDANDO VALIDAÇÃO',
    APROVADO_PROFESSOR: 'NÃO'
  });

  appendProtocol_(protocolo, 'PENDENTE', 'ETP02', 1, emailRep, file.getId(), 'AGUARDANDO VALIDAÇÃO');
  logAdmin_('TERMO', '', 'ETP02', protocolo, representante, 'ENVIO_TERMO', '', 'AGUARDANDO VALIDAÇÃO', nomeGrupo);
  sendProtocolEmail_([emailRep, emailVice], protocolo, 'Termo de Compromisso recebido', `O termo do grupo “${nomeGrupo}” foi recebido e aguarda validação do professor.`);

  return { ok: true, protocolo, status: 'AGUARDANDO VALIDAÇÃO', arquivo: file.getUrl() };
}

function validarTermoPorProtocolo(protocolo) {
  protocolo = req_(protocolo, 'Protocolo');
  const pending = findObject_('TERMOS_PENDENTES', 'PROTOCOLO', protocolo);
  if (!pending) throw new Error('Protocolo não localizado.');
  if (String(pending.obj.STATUS || '').indexOf('VALIDADO') === 0) throw new Error('Este termo já foi validado.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const idGrupo = nextGroupId_();
    const cfg = getConfig_();
    if (!cfg.PASTA_GRUPOS_ID) throw new Error('PASTA_GRUPOS_ID não configurada.');

    const root = DriveApp.getFolderById(cfg.PASTA_GRUPOS_ID);
    const folder = root.createFolder(`${idGrupo} - ${safe_(pending.obj.NOME_GRUPO)}`);
    const folders = createGroupFolders_(folder);
    const original = DriveApp.getFileById(pending.obj.ARQUIVO_ID);
    original.makeCopy(`${idGrupo} - Termo de Compromisso.pdf`, folders.ETP02);

    appendByHeaders_('GRUPOS', {
      ID_GRUPO: idGrupo,
      NOME_GRUPO: pending.obj.NOME_GRUPO,
      TEMA: pending.obj.TEMA,
      DELIMITACAO: '',
      REPRESENTANTE: pending.obj.REPRESENTANTE,
      VICE_REPRESENTANTE: pending.obj.VICE_REPRESENTANTE,
      EMAIL_GRUPO: pending.obj.EMAIL_REPRESENTANTE,
      STATUS_GERAL: 'ATIVO',
      PASTA_DRIVE_ID: folder.getId(),
      DATA_CADASTRO: new Date(),
      OBSERVACOES: `Criado a partir do protocolo ${protocolo}`
    });

    mergeMembers_(pending.obj).forEach(m => appendByHeaders_('ALUNOS', {
      ID_ALUNO: nextStudentId_(),
      NOME_COMPLETO: m.nome,
      EMAIL: m.email,
      ID_GRUPO: idGrupo,
      FUNCAO: m.funcao,
      ATIVO: 'SIM'
    }));

    const senha = generatePassword_();
    const salt = Utilities.getUuid();
    appendByHeaders_('ACESSOS', {
      ID_GRUPO: idGrupo,
      SENHA_HASH: hash_(salt + senha),
      SALT: salt,
      EMAIL_RECUPERACAO: pending.obj.EMAIL_REPRESENTANTE,
      RESET_TOKEN_HASH: '',
      RESET_EXPIRA_EM: '',
      SESSAO_TOKEN_HASH: '',
      SESSAO_EXPIRA_EM: '',
      ULTIMO_LOGIN: '',
      SENHA_ATUALIZADA_EM: new Date(),
      TENTATIVAS_FALHAS: 0,
      BLOQUEADO_ATE: '',
      ATIVO: 'SIM',
      OBSERVACOES: ''
    });

    updateObjectRow_('TERMOS_PENDENTES', pending.row, {
      STATUS: `VALIDADO - ${idGrupo}`,
      GRUPO_CRIADO: idGrupo
    });

    // Corrige os registros históricos do termo para o novo grupo.
    const entregaTermo = findObject_('ENTREGAS', 'PROTOCOLO', protocolo);
    if (entregaTermo) {
      updateObjectRow_('ENTREGAS', entregaTermo.row, {
        ID_GRUPO: idGrupo,
        STATUS: 'APROVADO',
        APROVADO_PROFESSOR: 'SIM',
        DATA_APROVACAO: new Date()
      });
    }
    const protocoloTermo = findObject_('PROTOCOLOS', 'PROTOCOLO', protocolo);
    if (protocoloTermo) {
      updateObjectRow_('PROTOCOLOS', protocoloTermo.row, {
        ID_GRUPO: idGrupo,
        STATUS: 'APROVADO'
      });
    }

    logAdmin_('GRUPO', idGrupo, 'ETP02', protocolo, 'PROFESSOR', 'VALIDAR_TERMO', 'AGUARDANDO VALIDAÇÃO', 'ATIVO', pending.obj.NOME_GRUPO);
    sendCredentials_(idGrupo, senha, [pending.obj.EMAIL_REPRESENTANTE, pending.obj.EMAIL_VICE]);

    return { ok: true, idGrupo, pasta: folder.getUrl(), senhaInicial: senha };
  } finally {
    lock.releaseLock();
  }
}

function solicitarRegularizacaoTermo(protocolo, motivo) {
  const pending = findObject_('TERMOS_PENDENTES', 'PROTOCOLO', protocolo);
  if (!pending) throw new Error('Protocolo não localizado.');

  updateObjectRow_('TERMOS_PENDENTES', pending.row, {
    STATUS: 'REGULARIZAÇÃO SOLICITADA',
    OBSERVACOES: motivo || ''
  });

  sendProtocolEmail_([
    pending.obj.EMAIL_REPRESENTANTE,
    pending.obj.EMAIL_VICE
  ], protocolo, 'Regularização necessária', motivo || 'O professor solicitou regularização do Termo de Compromisso.');

  logAdmin_('TERMO', '', 'ETP02', protocolo, 'PROFESSOR', 'SOLICITAR_REGULARIZACAO', pending.obj.STATUS, 'REGULARIZAÇÃO SOLICITADA', motivo || '');
  return { ok: true };
}

function login_(p) {
  const idGrupo = req_(p.idGrupo, 'Grupo').toUpperCase();
  const senha = req_(p.senha, 'Senha');
  const access = findObject_('ACESSOS', 'ID_GRUPO', idGrupo);
  if (!access || String(access.obj.ATIVO).toUpperCase() !== 'SIM') throw new Error('Grupo ou senha inválidos.');

  const now = new Date();
  if (access.obj.BLOQUEADO_ATE && new Date(access.obj.BLOQUEADO_ATE) > now) {
    throw new Error('Acesso temporariamente bloqueado. Tente novamente mais tarde.');
  }

  if (hash_(access.obj.SALT + senha) !== access.obj.SENHA_HASH) {
    const cfg = getConfig_();
    const falhas = Number(access.obj.TENTATIVAS_FALHAS || 0) + 1;
    const patch = { TENTATIVAS_FALHAS: falhas };
    if (falhas >= Number(cfg.MAX_TENTATIVAS_LOGIN || 5)) {
      patch.BLOQUEADO_ATE = new Date(now.getTime() + Number(cfg.BLOQUEIO_MINUTOS || 15) * 60000);
    }
    updateObjectRow_('ACESSOS', access.row, patch);
    throw new Error('Grupo ou senha inválidos.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  const exp = new Date(now.getTime() + Number(getConfig_().SESSAO_HORAS || 8) * 3600000);
  updateObjectRow_('ACESSOS', access.row, {
    SESSAO_TOKEN_HASH: hash_(token),
    SESSAO_EXPIRA_EM: exp,
    ULTIMO_LOGIN: now,
    TENTATIVAS_FALHAS: 0,
    BLOQUEADO_ATE: ''
  });

  return { ok: true, token, expiraEm: exp.toISOString(), grupo: groupSummary_(idGrupo) };
}

function forgotPassword_(p) {
  const idGrupo = req_(p.idGrupo, 'Grupo').toUpperCase();
  const email = email_(p.email, 'E-mail');
  const resposta = { ok: true, message: 'Se os dados estiverem corretos, um código será enviado.' };
  if (!isAuthorizedRecoveryEmail_(idGrupo, email)) return resposta;

  const access = findObject_('ACESSOS', 'ID_GRUPO', idGrupo);
  if (!access) return resposta;

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const exp = new Date(Date.now() + Number(getConfig_().RESET_MINUTOS || 15) * 60000);
  updateObjectRow_('ACESSOS', access.row, {
    RESET_TOKEN_HASH: hash_(code),
    RESET_EXPIRA_EM: exp
  });

  MailApp.sendEmail({
    to: email,
    subject: `PTCC - Código de recuperação do ${idGrupo}`,
    htmlBody: `<p>Seu código de recuperação é:</p><p style="font-size:28px;font-weight:bold">${code}</p><p>Validade: ${getConfig_().RESET_MINUTOS || 15} minutos.</p>`
  });

  return resposta;
}

function resetPassword_(p) {
  const idGrupo = req_(p.idGrupo, 'Grupo').toUpperCase();
  const code = req_(p.codigo, 'Código');
  const nova = req_(p.novaSenha, 'Nova senha');
  if (nova.length < 8) throw new Error('A nova senha deve possuir pelo menos 8 caracteres.');

  const access = findObject_('ACESSOS', 'ID_GRUPO', idGrupo);
  if (!access || !access.obj.RESET_EXPIRA_EM || new Date(access.obj.RESET_EXPIRA_EM) < new Date() || hash_(code) !== access.obj.RESET_TOKEN_HASH) {
    throw new Error('Código inválido ou expirado.');
  }

  const salt = Utilities.getUuid();
  updateObjectRow_('ACESSOS', access.row, {
    SENHA_HASH: hash_(salt + nova),
    SALT: salt,
    RESET_TOKEN_HASH: '',
    RESET_EXPIRA_EM: '',
    SESSAO_TOKEN_HASH: '',
    SESSAO_EXPIRA_EM: '',
    SENHA_ATUALIZADA_EM: new Date(),
    TENTATIVAS_FALHAS: 0,
    BLOQUEADO_ATE: ''
  });

  return { ok: true };
}

function dashboard_(p) {
  const idGrupo = req_(p.idGrupo, 'Grupo').toUpperCase();
  validateSession_(idGrupo, p.token);
  return { ok: true, ...dashboardData_(idGrupo) };
}

function submitStage_(p) {
  const idGrupo = req_(p.idGrupo, 'Grupo').toUpperCase();
  validateSession_(idGrupo, p.token);

  const idEtapa = req_(p.idEtapa, 'Etapa').toUpperCase();
  if (idEtapa === 'ETP02') throw new Error('Use o módulo de Termo de Compromisso para esta etapa.');

  const stage = findObject_('ETAPAS', 'ID_ETAPA', idEtapa);
  if (!stage) throw new Error('Etapa não localizada.');

  const situacao = statusEtapaGrupo_(idGrupo, stage.obj);
  if (!situacao.PODE_ENVIAR) {
    throw new Error(`Esta etapa não está disponível para envio. Situação atual: ${situacao.STATUS_EFETIVO}.`);
  }

  const pdf = decodePdf_(p.pdfBase64, p.fileName || `${idEtapa}.pdf`);
  const versao = nextVersion_(idGrupo, idEtapa);
  const protocolo = nextProtocol_('ETAPA', idGrupo, idEtapa, versao);
  const group = findObject_('GRUPOS', 'ID_GRUPO', idGrupo);
  if (!group) throw new Error('Grupo não localizado.');

  const groupFolder = DriveApp.getFolderById(group.obj.PASTA_DRIVE_ID);
  const stageFolder = getStageFolder_(groupFolder, idEtapa);
  const nomeArquivo = `${idEtapa}_${idGrupo}_V${pad_(versao, 2)}.pdf`;
  const file = stageFolder.createFile(pdf.blob.setName(nomeArquivo));
  const now = new Date();
  const sender = String(p.enviadoPor || '').trim();
  const email = email_(p.email || group.obj.EMAIL_GRUPO, 'E-mail');

  appendByHeaders_('ENTREGAS', {
    PROTOCOLO: protocolo,
    ID_ENTREGA: Utilities.getUuid(),
    TIMESTAMP: now,
    ID_GRUPO: idGrupo,
    ID_ETAPA: idEtapa,
    VERSAO: versao,
    NOME_ARQUIVO: nomeArquivo,
    ARQUIVO_DRIVE_URL: file.getUrl(),
    ARQUIVO_DRIVE_ID: file.getId(),
    ENVIADO_POR: sender,
    EMAIL_ENVIO: email,
    STATUS: 'EM CORREÇÃO',
    APROVADO_PROFESSOR: 'NÃO'
  });

  appendProtocol_(protocolo, idGrupo, idEtapa, versao, email, file.getId(), 'EM CORREÇÃO');
  logAdmin_('ENTREGA', idGrupo, idEtapa, protocolo, sender, 'ENVIO_ETAPA', '', 'EM CORREÇÃO', nomeArquivo);
  sendProtocolEmail_([email], protocolo, 'Entrega recebida', `Etapa ${stage.obj.ETAPA} - Versão ${pad_(versao, 2)} recebida com sucesso.`);

  return { ok: true, protocolo, versao, status: 'EM CORREÇÃO' };
}

function logout_(p) {
  const idGrupo = req_(p.idGrupo, 'Grupo').toUpperCase();
  const access = findObject_('ACESSOS', 'ID_GRUPO', idGrupo);
  if (access) {
    updateObjectRow_('ACESSOS', access.row, {
      SESSAO_TOKEN_HASH: '',
      SESSAO_EXPIRA_EM: ''
    });
  }
  return { ok: true };
}

function aprovarEntregaPorProtocolo(protocolo, parecer) {
  const ent = findObject_('ENTREGAS', 'PROTOCOLO', protocolo);
  if (!ent) throw new Error('Entrega não localizada.');

  updateObjectRow_('ENTREGAS', ent.row, {
    STATUS: 'APROVADO',
    APROVADO_PROFESSOR: 'SIM',
    DATA_APROVACAO: new Date()
  });

  appendByHeaders_('CORRECOES', {
    ID_CORRECAO: Utilities.getUuid(),
    PROTOCOLO_ENTREGA: protocolo,
    ID_GRUPO: ent.obj.ID_GRUPO,
    ID_ETAPA: ent.obj.ID_ETAPA,
    VERSAO: ent.obj.VERSAO,
    REVISAO_PROFESSOR: parecer || 'Etapa aprovada.',
    STATUS_CORRECAO: 'APROVADO',
    SOLICITAR_REENVIO: 'NÃO',
    DATA_ENVIO_DEVOLUTIVA: new Date()
  });

  sendProtocolEmail_([ent.obj.EMAIL_ENVIO], protocolo, 'PTCC - Etapa aprovada', parecer || 'A etapa foi aprovada pelo professor.');
  logAdmin_('CORRECAO', ent.obj.ID_GRUPO, ent.obj.ID_ETAPA, protocolo, 'PROFESSOR', 'APROVAR_ENTREGA', ent.obj.STATUS, 'APROVADO', parecer || '');
  return { ok: true };
}

function solicitarReenvioPorProtocolo(protocolo, parecer) {
  const ent = findObject_('ENTREGAS', 'PROTOCOLO', protocolo);
  if (!ent) throw new Error('Entrega não localizada.');

  updateObjectRow_('ENTREGAS', ent.row, {
    STATUS: 'REENVIO LIBERADO',
    APROVADO_PROFESSOR: 'NÃO'
  });

  appendByHeaders_('CORRECOES', {
    ID_CORRECAO: Utilities.getUuid(),
    PROTOCOLO_ENTREGA: protocolo,
    ID_GRUPO: ent.obj.ID_GRUPO,
    ID_ETAPA: ent.obj.ID_ETAPA,
    VERSAO: ent.obj.VERSAO,
    REVISAO_PROFESSOR: parecer || '',
    STATUS_CORRECAO: 'CORREÇÃO SOLICITADA',
    SOLICITAR_REENVIO: 'SIM',
    DATA_LIBERACAO_REENVIO: new Date(),
    DATA_ENVIO_DEVOLUTIVA: new Date()
  });

  sendProtocolEmail_([ent.obj.EMAIL_ENVIO], protocolo, 'Reenvio liberado', parecer || 'Há correções solicitadas pelo professor.');
  logAdmin_('CORRECAO', ent.obj.ID_GRUPO, ent.obj.ID_ETAPA, protocolo, 'PROFESSOR', 'LIBERAR_REENVIO', ent.obj.STATUS, 'REENVIO LIBERADO', parecer || '');
  return { ok: true };
}

function liberarEtapa(idEtapa, status) {
  const item = findObject_('ETAPAS', 'ID_ETAPA', String(idEtapa).toUpperCase());
  if (!item) throw new Error('Etapa não localizada.');
  updateObjectRow_('ETAPAS', item.row, { STATUS_GLOBAL: status || 'EM ANDAMENTO' });
  return { ok: true };
}

function validateSession_(idGrupo, token) {
  const a = findObject_('ACESSOS', 'ID_GRUPO', idGrupo);
  if (!a || !token || hash_(token) !== a.obj.SESSAO_TOKEN_HASH || !a.obj.SESSAO_EXPIRA_EM || new Date(a.obj.SESSAO_EXPIRA_EM) < new Date()) {
    throw new Error('Sessão inválida ou expirada. Faça login novamente.');
  }
}

function dashboardData_(idGrupo) {
  return {
    grupo: groupSummary_(idGrupo),
    alunos: filterObjects_('ALUNOS', 'ID_GRUPO', idGrupo).map(x => pick_(x.obj, ['NOME_COMPLETO', 'EMAIL', 'FUNCAO', 'ATIVO'])),
    etapas: etapasComStatusDoGrupo_(idGrupo).map(etapa => ({
      ID_ETAPA: etapa.ID_ETAPA,
      ORDEM: etapa.ORDEM,
      ETAPA: etapa.ETAPA,
      DATA_INICIO: etapa.DATA_INICIO,
      DATA_LIMITE: etapa.DATA_LIMITE,
      DATA_LIMITE_EFETIVA: etapa.DATA_LIMITE_EFETIVA,
      STATUS_GLOBAL: etapa.STATUS_GLOBAL,
      STATUS_CALCULADO: etapa.STATUS_CALCULADO,
      STATUS_EFETIVO: etapa.STATUS_EFETIVO,
      AJUSTE_MANUAL: etapa.AJUSTE_MANUAL,
      MOTIVO_AJUSTE: etapa.MOTIVO_AJUSTE,
      PODE_ENVIAR: etapa.PODE_ENVIAR,
      CRITERIOS: etapa.CRITERIOS
    })),
    entregas: filterObjects_('ENTREGAS', 'ID_GRUPO', idGrupo).map(x => pick_(x.obj, ['PROTOCOLO', 'TIMESTAMP', 'ID_ETAPA', 'VERSAO', 'NOME_ARQUIVO', 'ARQUIVO_DRIVE_URL', 'STATUS', 'DATA_APROVACAO'])),
    correcoes: filterObjects_('CORRECOES', 'ID_GRUPO', idGrupo).map(x => pick_(x.obj, ['PROTOCOLO_ENTREGA', 'ID_ETAPA', 'VERSAO', 'REVISAO_PROFESSOR', 'STATUS_CORRECAO', 'SOLICITAR_REENVIO', 'DATA_LIBERACAO_REENVIO']))
  };
}

function groupSummary_(idGrupo) {
  const g = findObject_('GRUPOS', 'ID_GRUPO', idGrupo);
  if (!g) throw new Error('Grupo não localizado.');
  return pick_(g.obj, ['ID_GRUPO', 'NOME_GRUPO', 'TEMA', 'DELIMITACAO', 'REPRESENTANTE', 'VICE_REPRESENTANTE', 'STATUS_GERAL', 'DATA_CADASTRO']);
}

/* ============================================================
   STATUS POR GRUPO / JANELAS / AJUSTES DO PROFESSOR
============================================================ */

function getAjusteEtapaGrupo_(idGrupo, idEtapa) {
  const chave = String(idGrupo).toUpperCase() + '|' + String(idEtapa).toUpperCase();
  return allObjects_('AJUSTES_ETAPAS').find(r =>
    String(r.obj.CHAVE || '').toUpperCase() === chave &&
    String(r.obj.ATIVO || 'SIM').toUpperCase() !== 'NÃO'
  ) || null;
}

function parseDataPt_(valor, fimDoDia) {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    const d = new Date(valor.getTime());
    if (fimDoDia) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
    return d;
  }

  const s = String(valor).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    if (fimDoDia) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
    return d;
  }

  return new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    fimDoDia ? 23 : 0,
    fimDoDia ? 59 : 0,
    fimDoDia ? 59 : 0,
    fimDoDia ? 999 : 0
  );
}

function formatDataPt_(valor) {
  const d = parseDataPt_(valor, false);
  if (!d) return '';
  return Utilities.formatDate(d, TZ, 'dd/MM/yyyy');
}

function ultimaEntregaEtapaGrupo_(idGrupo, idEtapa) {
  const rows = allObjects_('ENTREGAS').filter(r =>
    String(r.obj.ID_GRUPO).toUpperCase() === String(idGrupo).toUpperCase() &&
    String(r.obj.ID_ETAPA).toUpperCase() === String(idEtapa).toUpperCase()
  );

  if (!rows.length) return null;

  rows.sort((a, b) => {
    const va = Number(a.obj.VERSAO || 0);
    const vb = Number(b.obj.VERSAO || 0);
    if (va !== vb) return vb - va;
    return new Date(b.obj.TIMESTAMP || 0) - new Date(a.obj.TIMESTAMP || 0);
  });

  return rows[0];
}

function statusEtapaGrupo_(idGrupo, etapaObj) {
  const idEtapa = String(etapaObj.ID_ETAPA || '').toUpperCase();
  const ajuste = getAjusteEtapaGrupo_(idGrupo, idEtapa);
  const dataInicio = parseDataPt_(etapaObj.DATA_INICIO, false);
  const dataLimitePadrao = parseDataPt_(etapaObj.DATA_LIMITE, true);
  const dataLimiteEspecial = ajuste && ajuste.obj.NOVA_DATA_LIMITE
    ? parseDataPt_(ajuste.obj.NOVA_DATA_LIMITE, true)
    : null;
  const dataLimiteEfetiva = dataLimiteEspecial || dataLimitePadrao;
  const statusManual = ajuste ? String(ajuste.obj.STATUS_MANUAL || '').trim().toUpperCase() : '';
  const entrega = ultimaEntregaEtapaGrupo_(idGrupo, idEtapa);
  const statusEntrega = entrega ? String(entrega.obj.STATUS || '').trim().toUpperCase() : '';
  const global = String(etapaObj.STATUS_GLOBAL || '').trim().toUpperCase();
  const agora = new Date();

  let calculado = '';

  if (statusEntrega === 'APROVADO' || statusEntrega === 'APROVADA') {
    calculado = 'APROVADA';
  } else if (statusEntrega === 'REENVIO LIBERADO') {
    calculado = 'REENVIO LIBERADO';
  } else if (statusEntrega === 'CORREÇÃO SOLICITADA' || statusEntrega === 'CORRECAO SOLICITADA') {
    calculado = 'CORREÇÃO SOLICITADA';
  } else if (statusEntrega === 'EM CORREÇÃO' || statusEntrega === 'EM CORRECAO' || statusEntrega === 'ENVIADO') {
    calculado = 'EM CORREÇÃO';
  } else if (global === 'CONCLUÍDA' || global === 'CONCLUIDA') {
    calculado = 'CONCLUÍDA';
  } else if (dataInicio && agora < dataInicio) {
    calculado = 'AGENDADA';
  } else if (dataLimiteEfetiva && agora > dataLimiteEfetiva) {
    calculado = 'ATRASADA';
  } else {
    calculado = 'EM ANDAMENTO';
  }

  const efetivo = statusManual || calculado;

  return {
    ID_ETAPA: idEtapa,
    STATUS_CALCULADO: calculado,
    STATUS_EFETIVO: efetivo,
    DATA_LIMITE_PADRAO: formatDataPt_(dataLimitePadrao),
    DATA_LIMITE_EFETIVA: formatDataPt_(dataLimiteEfetiva),
    AJUSTE_MANUAL: !!ajuste,
    MOTIVO_AJUSTE: ajuste ? String(ajuste.obj.MOTIVO || '') : '',
    PODE_ENVIAR: ['EM ANDAMENTO', 'REENVIO LIBERADO', 'ABERTA'].indexOf(efetivo) >= 0
  };
}

function etapasComStatusDoGrupo_(idGrupo) {
  return allObjects_('ETAPAS').map(r => {
    const base = Object.assign({}, r.obj);
    return Object.assign(base, statusEtapaGrupo_(idGrupo, base));
  });
}

function podeEnviarEtapaGrupo_(idGrupo, idEtapa) {
  const etapa = findObject_('ETAPAS', 'ID_ETAPA', String(idEtapa).toUpperCase());
  if (!etapa) throw new Error('Etapa não localizada.');
  return statusEtapaGrupo_(idGrupo, etapa.obj).PODE_ENVIAR;
}

function definirAjusteEtapaGrupo(idGrupo, idEtapa, novaDataLimite, statusManual, motivo) {
  idGrupo = String(idGrupo || '').trim().toUpperCase();
  idEtapa = String(idEtapa || '').trim().toUpperCase();
  if (!idGrupo || !idEtapa) throw new Error('Grupo e etapa são obrigatórios.');
  if (!findObject_('GRUPOS', 'ID_GRUPO', idGrupo)) throw new Error('Grupo não localizado.');
  if (!findObject_('ETAPAS', 'ID_ETAPA', idEtapa)) throw new Error('Etapa não localizada.');

  const chave = idGrupo + '|' + idEtapa;
  const anterior = getAjusteEtapaGrupo_(idGrupo, idEtapa);
  const patch = {
    ID_GRUPO: idGrupo,
    ID_ETAPA: idEtapa,
    NOVA_DATA_LIMITE: novaDataLimite ? formatDataPt_(novaDataLimite) : '',
    STATUS_MANUAL: String(statusManual || '').trim().toUpperCase(),
    MOTIVO: String(motivo || '').trim(),
    ATIVO: 'SIM',
    ALTERADO_EM: new Date(),
    ALTERADO_POR: 'PROFESSOR',
    OBSERVACOES: '',
    CHAVE: chave
  };

  if (anterior) updateObjectRow_('AJUSTES_ETAPAS', anterior.row, patch);
  else appendByHeaders_('AJUSTES_ETAPAS', patch);

  const etapaObj = findObject_('ETAPAS', 'ID_ETAPA', idEtapa).obj;
  const situacao = statusEtapaGrupo_(idGrupo, etapaObj);
  logAdmin_('AJUSTE_ETAPA', idGrupo, idEtapa, '', 'PROFESSOR', 'AJUSTAR_JANELA_OU_STATUS', anterior ? String(anterior.obj.STATUS_MANUAL || '') : '', situacao.STATUS_EFETIVO, patch.MOTIVO);

  return {
    ok: true,
    idGrupo,
    idEtapa,
    statusEfetivo: situacao.STATUS_EFETIVO,
    dataLimiteEfetiva: situacao.DATA_LIMITE_EFETIVA
  };
}

function removerAjusteEtapaGrupo(idGrupo, idEtapa, motivo) {
  idGrupo = String(idGrupo || '').toUpperCase();
  idEtapa = String(idEtapa || '').toUpperCase();
  const ajuste = getAjusteEtapaGrupo_(idGrupo, idEtapa);
  if (!ajuste) return { ok: true, message: 'Nenhum ajuste ativo.' };

  updateObjectRow_('AJUSTES_ETAPAS', ajuste.row, {
    ATIVO: 'NÃO',
    ALTERADO_EM: new Date(),
    ALTERADO_POR: 'PROFESSOR',
    OBSERVACOES: String(motivo || '')
  });

  logAdmin_('AJUSTE_ETAPA', idGrupo, idEtapa, '', 'PROFESSOR', 'REMOVER_AJUSTE', String(ajuste.obj.STATUS_MANUAL || ''), 'REGRA AUTOMÁTICA', String(motivo || ''));
  return { ok: true };
}

/* ============================================================
   PROTOCOLOS / NUMERAÇÃO
============================================================ */

function nextProtocol_(tipo, idGrupo, idEtapa, versao) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const seq = nextSequential_();
    const prefix = getConfig_().PROTOCOLO_PREFIXO || 'PTCC-2026';
    if (tipo === 'TERMO') return `${prefix}-TERMO-${pad_(seq, 5)}`;
    return `${prefix}-${idGrupo}-${idEtapa}-V${pad_(versao, 2)}-${pad_(seq, 5)}`;
  } finally {
    lock.releaseLock();
  }
}

function nextSequential_() {
  const rows = allObjects_('PROTOCOLOS');
  let max = 0;
  rows.forEach(r => max = Math.max(max, Number(r.obj.SEQUENCIAL || 0)));
  return max + 1;
}

function nextVersion_(idGrupo, idEtapa) {
  const rows = filterObjects_('ENTREGAS', 'ID_GRUPO', idGrupo).filter(r => String(r.obj.ID_ETAPA) === String(idEtapa));
  let max = 0;
  rows.forEach(r => max = Math.max(max, Number(r.obj.VERSAO || 0)));
  return max + 1;
}

function nextGroupId_() {
  const rows = allObjects_('GRUPOS');
  let max = 0;
  rows.forEach(r => {
    const m = String(r.obj.ID_GRUPO || '').match(/G(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'G' + pad_(max + 1, 2);
}

function nextStudentId_() {
  const rows = allObjects_('ALUNOS');
  let max = 0;
  rows.forEach(r => {
    const m = String(r.obj.ID_ALUNO || '').match(/A(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'A' + pad_(max + 1, 4);
}

function appendProtocol_(protocolo, idGrupo, idEtapa, versao, email, fileId, status) {
  const m = String(protocolo).match(/(\d{5})$/);
  const seq = Number(m ? m[1] : nextSequential_());
  appendByHeaders_('PROTOCOLOS', {
    PROTOCOLO: protocolo,
    SEQUENCIAL: seq,
    TIMESTAMP: new Date(),
    ID_GRUPO: idGrupo,
    ID_ETAPA: idEtapa,
    VERSAO: versao,
    EMAIL: email,
    ARQUIVO_ID: fileId,
    STATUS: status,
    COMPROVANTE_ENVIADO: 'SIM',
    OBSERVACOES: ''
  });
}

/* ============================================================
   DRIVE / MEMBROS / EMAILS
============================================================ */

function createGroupFolders_(folder) {
  const defs = {
    ETP01: '01 - Formação da Equipe',
    ETP02: '02 - Termo de Compromisso',
    ETP03: '03 - Tema e Delimitação',
    ETP04: '04 - Problemáticas',
    ETP05: '05 - Hipóteses',
    ETP06: '06 - Objetivos e Justificativa',
    ETP07: '07 - Metodologia',
    ETP08: '08 - Estrutura',
    ETP09: '09 - Revisão',
    ETP10: '10 - Projeto Final'
  };
  const out = {};
  Object.keys(defs).forEach(k => out[k] = folder.createFolder(defs[k]));
  return out;
}

function getStageFolder_(groupFolder, idEtapa) {
  const prefix = pad_(Number(idEtapa.replace('ETP', '')), 2) + ' - ';
  const it = groupFolder.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(prefix) === 0) return f;
  }
  return groupFolder.createFolder(prefix + idEtapa);
}

function mergeMembers_(p) {
  const out = [];
  const seen = {};

  function add(nome, email, funcao) {
    nome = String(nome || '').trim();
    email = String(email || '').trim().toLowerCase();
    if (!nome || !email || seen[email]) return;
    seen[email] = true;
    out.push({ nome, email, funcao });
  }

  add(p.REPRESENTANTE, p.EMAIL_REPRESENTANTE, 'REPRESENTANTE');
  add(p.VICE_REPRESENTANTE, p.EMAIL_VICE, 'VICE');

  try {
    (JSON.parse(p.INTEGRANTES_JSON || '[]') || []).forEach(m => add(
      m.nome || m.nomeCompleto,
      m.email,
      m.funcao || 'INTEGRANTE'
    ));
  } catch (e) {}

  return out;
}

function isAuthorizedRecoveryEmail_(idGrupo, email) {
  return filterObjects_('ALUNOS', 'ID_GRUPO', idGrupo).some(r =>
    ['REPRESENTANTE', 'VICE'].indexOf(String(r.obj.FUNCAO).toUpperCase()) >= 0 &&
    String(r.obj.EMAIL).toLowerCase() === email.toLowerCase()
  );
}

function sendCredentials_(idGrupo, senha, emails) {
  const site = getConfig_().URL_SITE || '';
  sendProtocolEmail_(
    emails,
    '',
    `PTCC - Acesso do grupo ${idGrupo}`,
    `Grupo criado com sucesso.<br><b>Grupo:</b> ${idGrupo}<br><b>Senha inicial:</b> ${senha}<br><br>Acesse: <a href="${site}">${site}</a><br><br>Recomendamos alterar a senha após o primeiro acesso.`
  );
}

function sendProtocolEmail_(emails, protocolo, assunto, mensagem) {
  const list = [...new Set((emails || []).filter(Boolean))];
  if (!list.length) return;

  MailApp.sendEmail({
    to: list.join(','),
    subject: assunto,
    htmlBody: `<div style="font-family:Arial"><h2>PTCC - Técnico em Marketing</h2>${protocolo ? `<p><b>Protocolo:</b> ${protocolo}</p>` : ''}<p>${mensagem}</p><p>Etec de Mairinque - Extensão Ibiúna</p></div>`
  });
}

/* ============================================================
   UTILIDADES / SEGURANÇA
============================================================ */

function decodePdf_(base64, fileName) {
  if (!base64) throw new Error('PDF não enviado.');
  const clean = String(base64).replace(/^data:application\/pdf;base64,/, '');
  const bytes = Utilities.base64Decode(clean);
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF excede o limite de 10 MB.');
  if (bytes.length < 4 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70) {
    throw new Error('O arquivo enviado não é um PDF válido.');
  }
  return { blob: Utilities.newBlob(bytes, 'application/pdf', fileName) };
}

function generatePassword_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function hash_(value) {
  const pepper = PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER');
  if (!pepper) throw new Error('Execute setupInicial() uma vez antes de usar o sistema.');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value) + pepper,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(digest);
}

function safe_(s) {
  return String(s || '').replace(/[\\/:*?"<>|#%{}~]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 90);
}

function pad_(n, l) {
  return String(n).padStart(l, '0');
}

function req_(v, label) {
  const s = String(v || '').trim();
  if (!s) throw new Error(`${label} é obrigatório.`);
  return s;
}

function email_(v, label) {
  const s = req_(v, label);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error(`${label} inválido.`);
  return s.toLowerCase();
}

function pick_(o, keys) {
  const r = {};
  keys.forEach(k => r[k] = o[k] == null ? '' : o[k]);
  return r;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   PLANILHA / CONFIGURAÇÕES / LOG
============================================================ */

function getConfig_() {
  const map = {};
  allObjects_('CONFIGURACOES').forEach(r => map[r.obj.CHAVE] = r.obj.VALOR);
  return map;
}

function setConfig_(key, value) {
  const f = findObject_('CONFIGURACOES', 'CHAVE', key);
  if (f) updateObjectRow_('CONFIGURACOES', f.row, { VALOR: value });
  else appendByHeaders_('CONFIGURACOES', { CHAVE: key, VALOR: value, DESCRICAO: '' });
}

function sheet_(name) {
  const s = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!s) throw new Error(`Aba ${name} não encontrada.`);
  return s;
}

function headers_(s) {
  return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
}

function allObjects_(name) {
  const s = sheet_(name);
  const last = s.getLastRow();
  if (last < 2) return [];
  const h = headers_(s);
  const vals = s.getRange(2, 1, last - 1, h.length).getValues();
  return vals.map((row, i) => ({
    row: i + 2,
    obj: Object.fromEntries(h.map((k, j) => [k, row[j]]))
  }));
}

function filterObjects_(name, key, val) {
  return allObjects_(name).filter(r => String(r.obj[key]) === String(val));
}

function findObject_(name, key, val) {
  return allObjects_(name).find(r => String(r.obj[key]) === String(val));
}

function appendByHeaders_(name, obj) {
  const s = sheet_(name);
  const h = headers_(s);
  s.appendRow(h.map(k => obj[k] == null ? '' : obj[k]));
}

function updateObjectRow_(name, row, obj) {
  const s = sheet_(name);
  const h = headers_(s);
  const vals = s.getRange(row, 1, 1, h.length).getValues()[0];
  h.forEach((k, i) => {
    if (Object.prototype.hasOwnProperty.call(obj, k)) vals[i] = obj[k];
  });
  s.getRange(row, 1, 1, h.length).setValues([vals]);
}

function logAdmin_(tipo, idGrupo, idEtapa, protocolo, usuario, acao, antes, depois, detalhes) {
  appendByHeaders_('LOG_ADMIN', {
    TIMESTAMP: new Date(),
    TIPO_EVENTO: tipo,
    ID_GRUPO: idGrupo,
    ID_ETAPA: idEtapa,
    PROTOCOLO: protocolo,
    USUARIO: usuario,
    ACAO: acao,
    STATUS_ANTERIOR: antes,
    STATUS_NOVO: depois,
    DETALHES: detalhes,
    IP_OU_ORIGEM: 'WEBAPP',
    ID_EVENTO: Utilities.getUuid()
  });
}

/* ============================================================
   TESTE MANUAL - REMOVER APÓS O PILOTO
============================================================ */

function testarValidacaoTermo() {
  const resultado = validarTermoPorProtocolo('PTCC-2026-TERMO-00001');
  Logger.log(resultado);
}
