/* ============================================================
   PTCC - STATUS POR GRUPO / JANELAS / AJUSTES DO PROFESSOR
   Requer as funções auxiliares existentes no Code.gs:
   allObjects_, findObject_, appendByHeaders_, updateObjectRow_, logAdmin_
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
    if (fimDoDia) d.setHours(23,59,59,999);
    else d.setHours(0,0,0,0);
    return d;
  }
  const s = String(valor).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    if (fimDoDia) d.setHours(23,59,59,999);
    else d.setHours(0,0,0,0);
    return d;
  }
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), fimDoDia ? 23 : 0, fimDoDia ? 59 : 0, fimDoDia ? 59 : 0, fimDoDia ? 999 : 0);
}

function formatDataPt_(valor) {
  const d = parseDataPt_(valor, false);
  if (!d) return '';
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
}

function ultimaEntregaEtapaGrupo_(idGrupo, idEtapa) {
  const rows = allObjects_('ENTREGAS').filter(r =>
    String(r.obj.ID_GRUPO).toUpperCase() === String(idGrupo).toUpperCase() &&
    String(r.obj.ID_ETAPA).toUpperCase() === String(idEtapa).toUpperCase()
  );
  if (!rows.length) return null;
  rows.sort((a,b) => {
    const va = Number(a.obj.VERSAO || 0), vb = Number(b.obj.VERSAO || 0);
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
    PODE_ENVIAR: ['EM ANDAMENTO','REENVIO LIBERADO','ABERTA'].indexOf(efetivo) >= 0
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

  const novoStatus = statusEtapaGrupo_(idGrupo, findObject_('ETAPAS','ID_ETAPA',idEtapa).obj).STATUS_EFETIVO;
  logAdmin_('AJUSTE_ETAPA', idGrupo, idEtapa, '', 'PROFESSOR', 'AJUSTAR_JANELA_OU_STATUS', anterior ? String(anterior.obj.STATUS_MANUAL || '') : '', novoStatus, patch.MOTIVO);
  return { ok: true, idGrupo, idEtapa, statusEfetivo: novoStatus, dataLimiteEfetiva: statusEtapaGrupo_(idGrupo, findObject_('ETAPAS','ID_ETAPA',idEtapa).obj).DATA_LIMITE_EFETIVA };
}

function removerAjusteEtapaGrupo(idGrupo, idEtapa, motivo) {
  const ajuste = getAjusteEtapaGrupo_(String(idGrupo).toUpperCase(), String(idEtapa).toUpperCase());
  if (!ajuste) return { ok: true, message: 'Nenhum ajuste ativo.' };
  updateObjectRow_('AJUSTES_ETAPAS', ajuste.row, { ATIVO: 'NÃO', ALTERADO_EM: new Date(), ALTERADO_POR: 'PROFESSOR', OBSERVACOES: String(motivo || '') });
  logAdmin_('AJUSTE_ETAPA', String(idGrupo).toUpperCase(), String(idEtapa).toUpperCase(), '', 'PROFESSOR', 'REMOVER_AJUSTE', String(ajuste.obj.STATUS_MANUAL || ''), 'REGRA AUTOMÁTICA', String(motivo || ''));
  return { ok: true };
}
