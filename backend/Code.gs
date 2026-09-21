const SHEET_ID='1susEJxYDXa8WM2ss_21RoJMe7xy1TTsckqgVKnvFvrU';
const TURMA='3º TANE - Ibiúna';
const COMPONENTES=['CI','TIAA','PPBS','ADMP'];
const ABAS={ATIVIDADES:'ATIVIDADES',ENTREGAS:'ENTREGAS',MATERIAIS:'MATERIAIS',CONFIG:'CONFIG'};

// Pastas já existentes do 3º TANE no Google Drive.
// Se houver uma chave PASTA_ENTREGAS_<COMPONENTE>_ID na aba CONFIG,
// ela terá prioridade sobre estes valores.
const PASTAS_PADRAO={
  CI:'1QLLSXjqDAedk0CiFkYnfm1hZBh0L8mx1',
  TIAA:'1GyQS0qnymDjm56OWM4URxmt8DKX4WrMG',
  PPBS:'1jJzgACRwIg-5lf1fmrfPZCjm_f0ICRDU',
  ADMP:'1eUjb6yRh6FHq1iuSRYWqQHfQnN3cfp0Z'
};

function doGet(e){
  const p=(e&&e.parameter)||{};
  const action=String(p.action||'ping').trim();
  try{
    if(action==='listar') return json_(listar_(p.turma||TURMA,p.componente));
    if(action==='atividade') return json_({ok:true,atividade:atividade_(p.id,p.componente),agoraServidor:new Date().toISOString()});
    if(action==='ping') return json_({ok:true,sistema:'3º TANE',versao:'1.0',turma:TURMA,componentes:COMPONENTES,agora:new Date().toISOString()});
    return json_({ok:false,erro:'Ação inválida'});
  }catch(err){
    return json_({ok:false,erro:String(err.message||err)});
  }
}

function doPost(e){
  try{
    const d=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    if(d.action==='enviarAtividade') return json_(enviarAtividade_(d));
    return json_({ok:false,erro:'Ação inválida'});
  }catch(err){
    return json_({ok:false,erro:String(err.message||err)});
  }
}

function ss_(){
  return SpreadsheetApp.openById(SHEET_ID);
}

function sh_(nome){
  const sh=ss_().getSheetByName(nome);
  if(!sh) throw new Error('Aba não encontrada: '+nome);
  return sh;
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function eq_(a,b){
  return String(a??'').trim()===String(b??'').trim();
}

function comp_(v){
  const c=String(v||'').trim().toUpperCase();
  if(!COMPONENTES.includes(c)) throw new Error('Componente inválido: '+c);
  return c;
}

function sheetData_(sh){
  const v=sh.getDataRange().getValues();
  if(!v.length) return {headers:[],rows:[]};
  const headers=v[0].map(String);
  const rows=v.slice(1)
    .filter(r=>r.some(c=>c!==''&&c!==null))
    .map((r,idx)=>{
      const o={__row:idx+2};
      headers.forEach((h,i)=>o[h]=r[i]);
      return o;
    });
  return {headers,rows};
}

function rows_(nome){
  return sheetData_(sh_(nome)).rows;
}

function listar_(turma,componente){
  const c=comp_(componente);

  const atividades=rows_(ABAS.ATIVIDADES)
    .filter(x=>eq_(x.TURMA,turma)&&eq_(String(x.COMPONENTE||'').toUpperCase(),c))
    .sort((a,b)=>Number(a.ORDEM||999)-Number(b.ORDEM||999))
    .map(mapAtividadePublica_);

  const materiais=rows_(ABAS.MATERIAIS)
    .filter(x=>eq_(String(x.COMPONENTE||'').toUpperCase(),c)&&(!x.TURMA||eq_(x.TURMA,turma)))
    .filter(x=>String(x.STATUS||'PUBLICADO').toUpperCase()==='PUBLICADO')
    .sort((a,b)=>Number(a.ORDEM||999)-Number(b.ORDEM||999))
    .map(m=>({
      id:String(m.ID_MATERIAL||''),
      titulo:String(m.TITULO||''),
      descricao:String(m.DESCRICAO||''),
      url:String(m.ARQUIVO_URL||''),
      tipo:String(m.TIPO||'MATERIAL'),
      status:String(m.STATUS||'PUBLICADO'),
      ordem:Number(m.ORDEM||999),
      publicadoEm:dateTimeOut_(m.PUBLICADO_EM)
    }));

  return {ok:true,atividades,materiais,agoraServidor:new Date().toISOString()};
}

function atividade_(id,componente){
  if(!id) return null;
  const c=comp_(componente);
  const a=rows_(ABAS.ATIVIDADES).find(x=>
    eq_(x.ID_ATIVIDADE,id)&&
    eq_(x.TURMA,TURMA)&&
    eq_(String(x.COMPONENTE||'').toUpperCase(),c)
  );
  return a?mapAtividadePublica_(a):null;
}

function mapAtividadePublica_(a){
  const agora=new Date();
  const liberacao=parseDateTime_(a.LIBERACAO,false);
  const prazo=parseDateTime_(a.PRAZO,true);
  const status=String(a.STATUS||'RASCUNHO').toUpperCase();

  let situacao='FECHADA';
  if(status==='PUBLICADA'){
    if(liberacao&&agora<liberacao) situacao='AGENDADA';
    else if(prazo&&agora>prazo) situacao='ENCERRADA';
    else situacao='ABERTA';
  }

  return {
    id:String(a.ID_ATIVIDADE||''),
    turma:String(a.TURMA||''),
    componente:String(a.COMPONENTE||''),
    titulo:String(a.TITULO||''),
    descricao:String(a.DESCRICAO||''),
    tipoEnvio:String(a.TIPO_ENVIO||'SEM_ENVIO'),
    extensoes:String(a.EXTENSOES||''),
    maxArquivos:Number(a.MAX_ARQUIVOS||0),
    liberacao:dateTimeOut_(a.LIBERACAO),
    prazo:dateTimeOut_(a.PRAZO),
    materialUrl:String(a.MATERIAL_APOIO_URL||''),
    status:status,
    ordem:Number(a.ORDEM||999),
    situacao:situacao,
    disponivel:situacao==='ABERTA'
  };
}

function enviarAtividade_(d){
  const c=comp_(d.componente);

  if(!d.idAtividade) throw new Error('Atividade não informada');
  if(!String(d.aluno||'').trim()) throw new Error('Nome do aluno é obrigatório');

  const atividade=atividade_(d.idAtividade,c);
  if(!atividade) throw new Error('Atividade não encontrada');
  if(atividade.status!=='PUBLICADA') throw new Error('Atividade não está aberta para envio');
  if(atividade.situacao==='AGENDADA') throw new Error('Atividade ainda não foi liberada');
  if(atividade.situacao==='ENCERRADA') throw new Error('Prazo de entrega encerrado');
  if(atividade.situacao!=='ABERTA') throw new Error('Atividade não está aberta para envio');

  const arquivos=Array.isArray(d.arquivos)?d.arquivos:[];
  const tipo=String(atividade.tipoEnvio||'').toUpperCase();
  const isTexto=['FORMULARIO','TEXTO'].includes(tipo);

  if(!isTexto&&tipo!=='SEM_ENVIO'){
    if(!arquivos.length) throw new Error('Selecione ao menos um arquivo');
    if(atividade.maxArquivos&&arquivos.length>atividade.maxArquivos){
      throw new Error('Máximo de '+atividade.maxArquivos+' arquivo(s)');
    }
  }

  if(isTexto&&!String(d.respostaTexto||'').trim()){
    throw new Error('Digite a resposta da atividade');
  }

  validaArquivos_(arquivos,atividade.extensoes);

  const pastaId=pastaComponente_(c);
  if(!pastaId) throw new Error('Pasta de entregas não configurada para '+c);

  const raiz=DriveApp.getFolderById(pastaId);
  const pastaEntregas=getOrCreateFolder_(raiz,'Entregas dos alunos');
  const pastaAtividade=getOrCreateFolder_(pastaEntregas,sanitize_(atividade.id+' - '+atividade.titulo));
  const pastaAluno=getOrCreateFolder_(pastaAtividade,sanitize_(d.aluno));

  const urls=[];
  arquivos.forEach((f,i)=>{
    const raw=String(f.data||'').replace(/^data:[^;]+;base64,/, '');
    const bytes=Utilities.base64Decode(raw);
    const nome=sanitizeFile_(f.name||('arquivo-'+(i+1)));
    const blob=Utilities.newBlob(bytes,f.mime||MimeType.PLAIN_TEXT,nome);
    urls.push(pastaAluno.createFile(blob).getUrl());
  });

  const sh=sh_(ABAS.ENTREGAS);
  const dados=sheetData_(sh);
  const id='ENT-'+Utilities.getUuid().slice(0,12).toUpperCase();

  const obj={
    ID_ENTREGA:id,
    ID_ATIVIDADE:atividade.id,
    ALUNO:String(d.aluno).trim(),
    EMAIL:String(d.email||'').trim(),
    ARQUIVOS_URL:urls.join('\n'),
    RESPOSTA_TEXTO:String(d.respostaTexto||''),
    DATA_ENVIO:new Date(),
    STATUS:'RECEBIDA',
    TENTATIVA:Number(d.tentativa||1),
    OBSERVACAO:String(d.observacao||'')
  };

  sh.appendRow(dados.headers.map(h=>obj[h]!==undefined?obj[h]:''));

  return {
    ok:true,
    idEntrega:id,
    componente:c,
    atividade:atividade.id,
    arquivos:urls.length,
    mensagem:'Atividade enviada com sucesso.'
  };
}

function pastaComponente_(c){
  const cfg=config_();
  return String(
    cfg['PASTA_ENTREGAS_'+c+'_ID']||
    cfg.PASTA_ENTREGAS_ID||
    PASTAS_PADRAO[c]||
    ''
  ).trim();
}

function config_(){
  const o={};
  const ss=ss_();
  const sh=ss.getSheetByName(ABAS.CONFIG);
  if(!sh) return o;
  sheetData_(sh).rows.forEach(r=>{
    o[String(r.CHAVE||'').trim()]=r.VALOR;
  });
  return o;
}

function getOrCreateFolder_(pai,nome){
  const it=pai.getFoldersByName(nome);
  return it.hasNext()?it.next():pai.createFolder(nome);
}

function sanitize_(s){
  return String(s||'')
    .replace(/[\\/:*?"<>|#%{}~]/g,'-')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,120)||'Sem nome';
}

function sanitizeFile_(s){
  return String(s||'arquivo')
    .replace(/[\\/:*?"<>|]/g,'-')
    .slice(0,160);
}

function validaArquivos_(arquivos,extensoes){
  const permitidas=String(extensoes||'')
    .toLowerCase()
    .split(',')
    .map(x=>x.trim().replace(/^\./,''))
    .filter(Boolean);

  if(!permitidas.length) return;

  arquivos.forEach(f=>{
    const nome=String(f.name||'');
    const ext=nome.includes('.')?nome.split('.').pop().toLowerCase():'';
    if(!permitidas.includes(ext)) throw new Error('Arquivo não permitido: '+nome);
  });
}

function parseDateTime_(v,fimDoDiaSeSoData){
  if(!v) return null;
  if(Object.prototype.toString.call(v)==='[object Date]') return v;

  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if(m){
    return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0),0);
  }

  m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m){
    return new Date(
      Number(m[1]),
      Number(m[2])-1,
      Number(m[3]),
      fimDoDiaSeSoData?23:0,
      fimDoDiaSeSoData?59:0,
      fimDoDiaSeSoData?59:0,
      0
    );
  }

  const d=new Date(s);
  return isNaN(d.getTime())?null:d;
}

function dateTimeOut_(v){
  if(!v) return '';
  if(Object.prototype.toString.call(v)==='[object Date]'){
    return Utilities.formatDate(v,Session.getScriptTimeZone(),"yyyy-MM-dd'T'HH:mm");
  }

  const s=String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0,16);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s+'T23:59';
  return s;
}
