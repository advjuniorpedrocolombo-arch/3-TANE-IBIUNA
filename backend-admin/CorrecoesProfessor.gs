/** Complemento do Apps Script do PAINEL ADMINISTRATIVO, não do backend público.
 * Requer propriedade PROFESSOR_EMAIL definida e implantação restrita ao professor.
 * A avaliação nunca é enviada sem aprovação explícita.
 */
function authCorrecoes_() {
  const autorizado=String(PropertiesService.getScriptProperties().getProperty('PROFESSOR_EMAIL')||'').trim().toLowerCase();
  const ativo=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!autorizado || !ativo || autorizado!==ativo)throw new Error('Acesso negado: configure PROFESSOR_EMAIL e acesse com essa conta autenticada.');
}
function carregarLinhasCorrecoes_() {
  const sh=sh_('CORRECOES_IA'),v=sh.getDataRange().getValues();
  if(!v.length)return {sh,h:[],registros:[]};
  const h=v[0].map(String);
  return {sh,h,registros:v.slice(1).filter(r=>r.some(c=>c!==''&&c!==null)).map((r,i)=>({linha:i+2,registro:Object.fromEntries(h.map((k,j)=>[k,r[j]]))}))};
}
function detalheCorrecao_(id) {
  const fonte=carregarLinhasCorrecoes_();
  const matches=fonte.registros.filter(x=>String(x.registro.ID_ENTREGA)===String(id));
  if(matches.length!==1)throw new Error('Correção não encontrada ou ID duplicado');
  return {...fonte,...matches[0]};
}
function setCorrecao_(ref,map) {
  for(const [nome,valor] of Object.entries(map)){
    const pos=ref.h.indexOf(nome);
    if(pos<0)throw new Error('Coluna ausente: '+nome);
    ref.sh.getRange(ref.linha,pos+1).setValue(valor);
  }
}
function dadosParecer_(v) {
  try {const obj=JSON.parse(String(v||'{}'));return obj && typeof obj==='object' && !Array.isArray(obj)?obj:{}}
  catch(e){throw new Error('JSON da correção inválido; necessário revisão técnica')}
}
function listarCorrecoesProfessor(componente) {
  authCorrecoes_();
  const fonte=carregarLinhasCorrecoes_();
  const entregas=new Map(rows_('ENTREGAS').map(x=>[String(x.ID_ENTREGA||''),x]));
  const atividades=new Map(rows_('ATIVIDADES').map(x=>[String(x.ID_ATIVIDADE||''),x]));
  const aliases={'ADMP_AULA10':'ATD2_ADMP'};
  return fonte.registros.map(({registro:r})=>{
    const idA=String(r.ID_ATIVIDADE||''),a=atividades.get(idA)||atividades.get(aliases[idA]),e=entregas.get(String(r.ID_ENTREGA||'')),p=dadosParecer_(r.CORRECAO_JSON);
    return {id:String(r.ID_ENTREGA||''),idAtividade:idA,titulo:String(a?.TITULO||idA),componente:String(a?.COMPONENTE||''),aluno:String(r.ALUNO||''),emails:String(r.EMAIL||''),mencao:String(r.MENCAO||''),status:String(r.STATUS||''),justificativa:String(p.justificativa||''),pontosFortes:Array.isArray(p.pontos_fortes)?p.pontos_fortes:[],melhorias:Array.isArray(p.melhorias)?p.melhorias:[],erro:String(r.ERRO||''),arquivos:String(e?.ARQUIVOS_URL||''),resposta:String(e?.RESPOSTA_TEXTO||'').slice(0,25000),corrigidoEm:r.CORRIGIDO_EM?String(r.CORRIGIDO_EM):'',enviadoEm:r.ENVIADO_EM?String(r.ENVIADO_EM):''};
  }).filter(x=>!componente||x.componente===String(componente));
}
function salvarRevisaoProfessor(id,mencao,justificativa) {
  authCorrecoes_();
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ref=detalheCorrecao_(id),status=String(ref.registro.STATUS||'');
    if(!['PENDENTE_APROVACAO','EM_REVISAO','APROVADA'].includes(status))throw new Error('Avaliação não está em situação editável');
    if(ref.registro.ENVIADO_EM)throw new Error('Avaliação já enviada');
    if(!['MB','B','R','I'].includes(mencao))throw new Error('Menção inválida');
    const justificativaFinal=String(justificativa||'').trim();
    if(!justificativaFinal)throw new Error('Justificativa obrigatória');
    const parecer=dadosParecer_(ref.registro.CORRECAO_JSON);
    parecer.mencao=mencao;parecer.justificativa=justificativaFinal;parecer.revisadoPeloProfessor=true;
    setCorrecao_(ref,{MENCAO:mencao,CORRECAO_JSON:JSON.stringify(parecer),STATUS:'EM_REVISAO',APROVADO_EM:''});
    return {ok:true,status:'EM_REVISAO'};
  }finally{lock.releaseLock()}
}
function aprovarCorrecaoProfessor(id) {
  authCorrecoes_();
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const ref=detalheCorrecao_(id),r=ref.registro;
    if(!['EM_REVISAO','PENDENTE_APROVACAO'].includes(String(r.STATUS)))throw new Error('Correção não está pendente de aprovação');
    if(!['MB','B','R','I'].includes(String(r.MENCAO)))throw new Error('Menção inválida');
    if(!dadosParecer_(r.CORRECAO_JSON).justificativa)throw new Error('Justificativa ausente');
    setCorrecao_(ref,{STATUS:'APROVADA',APROVADO_EM:new Date()});
    return {ok:true,status:'APROVADA'};
  }finally{lock.releaseLock()}
}
function emailsCorrecoes_(v) {
  const candidatos=String(v||'').split(/\s*\|\s*|[,;\n]+/).map(x=>x.trim()).filter(Boolean);
  const todos=[...new Set(candidatos.map(x=>x.toLowerCase()))];
  if(!todos.length||todos.some(x=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))throw new Error('E-mail(s) inválido(s). Conferir antes de enviar.');
  return todos;
}
function enviarCorrecaoAprovada(id) {
  authCorrecoes_();
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const ref=detalheCorrecao_(id),r=ref.registro;
    if(!['APROVADA','ENVIO_PARCIAL'].includes(String(r.STATUS)))throw new Error('Somente avaliações aprovadas podem ser enviadas');
    const p=dadosParecer_(r.CORRECAO_JSON);
    if(!['MB','B','R','I'].includes(String(r.MENCAO))||!p.justificativa)throw new Error('Avaliação incompleta');
    const emails=emailsCorrecoes_(r.EMAIL);
    const a=rows_('ATIVIDADES').find(x=>String(x.ID_ATIVIDADE)===String(r.ID_ATIVIDADE));
    const titulo=String(a?.TITULO||r.ID_ATIVIDADE||'Atividade');
    const aluno=String(r.ALUNO||'Aluno(a)');
    const enviado=Array.isArray(p.emailsEnviados)?p.emailsEnviados:[];
    const corpo=['Resultado da atividade: '+titulo,'Aluno(s): '+aluno,'Menção aprovada: '+r.MENCAO,'','Parecer do professor:',String(p.justificativa),'',
      'Pontos fortes:',...(Array.isArray(p.pontos_fortes)?p.pontos_fortes:[]).map(x=>'- '+x),'',
      'Orientações de melhoria:',...(Array.isArray(p.melhorias)?p.melhorias:[]).map(x=>'- '+x),'',
      'Esta avaliação foi revisada e aprovada pelo professor.'].join('\n');
    for(const email of emails) {
      if(enviado.includes(email))continue;
      MailApp.sendEmail({to:email,subject:'Avaliação da atividade - '+titulo,body:corpo,name:'Painel do Professor - 3º TANE'});
      enviado.push(email);
      p.emailsEnviados=enviado;
      setCorrecao_(ref,{CORRECAO_JSON:JSON.stringify(p),STATUS:'ENVIO_PARCIAL'});
    }
    setCorrecao_(ref,{STATUS:'ENVIADA',ENVIADO_EM:new Date()});
    return {ok:true,status:'ENVIADA',destinatarios:enviado.length};
  }finally{lock.releaseLock()}
}
