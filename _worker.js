/* _worker.js — MESQ.
   API do painel /admin: login, CRUD dos kits, upload de foto e vídeo.
   Conteúdo no Cloudflare KV (binding MQ). Fotos no KV, vídeos no R2 (binding MQMEDIA) —
   vídeo não cabe com folga no teto de 25 MB por item do KV. Advanced mode do Pages:
   este arquivo responde /api/* e delega todo o resto pros arquivos estáticos (env.ASSETS).

   Secrets no projeto Pages:
     ADMIN_SENHA   (obrigatório) senha inicial do painel
     ADMIN_SECRET  (obrigatório) chave que assina o cookie de sessão

   Bindings no projeto Pages (Settings → Bindings):
     MQ        KV namespace
     MQMEDIA   R2 bucket

   Sobre a senha: quando a Cá troca a senha pelo painel, o hash PBKDF2 vai pro KV
   (chave "senha") e passa a valer no lugar do ADMIN_SENHA. A chave que assina a sessão
   é o ADMIN_SECRET e NÃO muda junto, então trocar a senha não derruba sessões abertas
   em outros aparelhos. Pra derrubar todas, trocar o ADMIN_SECRET pelo wrangler. */

const COOKIE = 'mesq_adm';
const SESSAO_DIAS = 30;
const IMG_MAX = 4 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const CHAVE_CONTEUDO = 'conteudo';
const TENTATIVAS_MAX = 12;
const KITS_MAX = 20;
const MIDIAS_MAX = 8;
const FRASES_MAX = 15;
const PBKDF2_ITER = 120000;

/* Conteúdo inicial: os mesmos kits que já estavam fixos em data/conteudo.json.
   Serve enquanto a Cá não salvar nada pelo painel. O primeiro save grava no KV.
   Se mudar aqui, mude também data/conteudo.json (é o que o index.html usa como
   reserva caso a API esteja fora do ar). */
const SEMENTE = {
  site: {
    whatsapp: '5511966050632',
    freteTexto: 'Frete grátis para todo o Brasil em pedidos acima de R$ 199',
    colecaoNome: 'Coleção',
    colecaoAno: '2026'
  },
  secoes: [
    {
      id: 'kits',
      titulo: 'Conjunto Top + Short',
      kits: [
        { id: 'esmeralda', ativo: true, rotulo: 'Esmeralda', nome: 'Kit Esmeralda',
          desc: 'Modelagem estratégica em verde esmeralda vibrante. Tecido firme e confortável, ideal para treinos intensos ou para o dia a dia.',
          cor: '#5EA89A', cores: { fundo: '#E6EFED', tab: '#2A5555', letreiro: '#4A8888' },
          tamanhos: ['P', 'M', 'G'], precoPix: 'R$ 179,90', preco3x: 'R$ 71,66',
          midias: [
            { tipo: 'img', src: 'midias/esmeralda-1.webp' },
            { tipo: 'img', src: 'midias/esmeralda-2.webp' },
            { tipo: 'img', src: 'midias/esmeralda-3.webp' },
            { tipo: 'video', src: 'midias/esmeralda-video.mp4', comAudio: false }
          ],
          frases: ['MESQ.', 'Modelagem estratégica', 'Tecido firme e confortável', 'Ideal para treinos', 'Valoriza o corpo', 'Alta sustentação', 'Conforto no movimento', 'Tecido gelado', 'Bolso para celular', 'Estilo em movimento'] },
        { id: 'cereja', ativo: true, rotulo: 'Cereja', nome: 'Kit Cereja',
          desc: 'O vermelho cereja que chega com personalidade. Presença garantida dentro e fora da academia.',
          cor: '#C1323C', cores: { fundo: '#F0E8E8', tab: '#961E2D', letreiro: '#C1323C' },
          tamanhos: ['P', 'M', 'G'], precoPix: 'R$ 179,90', preco3x: 'R$ 71,66',
          midias: [
            { tipo: 'img', src: 'midias/cereja-1.webp' },
            { tipo: 'img', src: 'midias/cereja-2.webp' },
            { tipo: 'img', src: 'midias/cereja-3.webp' }
          ],
          frases: ['MESQ.', 'Presença garantida', 'Modelagem que abraça', 'Zero transparência', 'Tecido com brilho sutil', 'Do treino ao dia a dia', 'Conforto com estilo', 'Tecido gelado', 'Bolso para celular', 'Estilo em movimento'] },
        { id: 'rose', ativo: true, rotulo: 'Rosé', nome: 'Kit Rosé',
          desc: 'Delicadeza com firmeza. O rosé que modela, valoriza e entrega sofisticação em cada movimento.',
          cor: '#D98FA8', cores: { fundo: '#F0ECF0', tab: '#A0506E', letreiro: '#D98FA8' },
          tamanhos: ['G'], precoPix: 'R$ 179,90', preco3x: 'R$ 71,66',
          midias: [
            { tipo: 'img', src: 'midias/rose-1.webp' },
            { tipo: 'img', src: 'midias/rose-2.webp' },
            { tipo: 'video', src: 'midias/rose-video.mp4', comAudio: false }
          ],
          frases: ['MESQ.', 'Delicadeza com firmeza', 'Sofisticação em movimento', 'Modela as curvas', 'Alta performance', 'Alta sustentação', 'Valoriza o seu corpo', 'Tecido gelado', 'Bolso para celular', 'Estilo em movimento'] }
      ]
    },
    {
      id: 'kits2',
      titulo: 'Conjunto Top + Legging',
      kits: [
        { id: 'rubi', ativo: true, rotulo: 'Rubi', nome: 'Kit Rubi',
          desc: 'Modela o corpo, valoriza as curvas e entrega conforto com zero transparência. Tecido com leve brilho sofisticado. Perfeito para treinar e sair pronta. Presença garantida.',
          cor: '#B03050', cores: { fundo: '#F0E8EA', tab: '#7A1E35', letreiro: '#B03050' },
          tamanhos: ['G'], precoPix: 'R$ 199,00', preco3x: 'R$ 78,83',
          midias: [
            { tipo: 'img', src: 'midias/rubi-3.webp' },
            { tipo: 'img', src: 'midias/rubi-2.webp' },
            { tipo: 'img', src: 'midias/rubi-1.webp' },
            { tipo: 'video', src: 'midias/rubi-video.mp4', comAudio: true }
          ],
          frases: ['MESQ.', 'Presença garantida', 'Valoriza as curvas', 'Zero transparência', 'Leve brilho sofisticado', 'Do treino à rua', 'Alta sustentação', 'Tecido gelado', 'Bolso para celular', 'Estilo em movimento'] },
        { id: 'pacifico', ativo: true, rotulo: 'Pacífico', nome: 'Kit Pacífico',
          desc: 'Modela o corpo, valoriza as curvas e entrega conforto com zero transparência. Tecido com leve brilho sofisticado. Perfeito para treinar e sair pronta. Presença garantida.',
          cor: '#7A9EC0', cores: { fundo: '#E8EDF5', tab: '#3A5A78', letreiro: '#7A9EC0' },
          tamanhos: ['P', 'M', 'G'], precoPix: 'R$ 199,00', preco3x: 'R$ 78,83',
          midias: [
            { tipo: 'img', src: 'midias/pacifico-1.webp' },
            { tipo: 'img', src: 'midias/pacifico-2.webp' },
            { tipo: 'video', src: 'midias/pacifico-video.mp4', comAudio: true }
          ],
          frases: ['MESQ.', 'Presença garantida', 'Azul que conquista', 'Zero transparência', 'Leve brilho sofisticado', 'Do treino à rua', 'Alta sustentação', 'Tecido gelado', 'Bolso para celular', 'Estilo em movimento'] }
      ]
    }
  ]
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.indexOf('/api/') === 0) {
      try {
        return await rota(request, env, url);
      } catch (err) {
        return json({ erro: (err && err.message) || 'Falha inesperada' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};

async function rota(request, env, url) {
  const p = url.pathname;
  const m = request.method;

  if (p === '/api/conteudo' && m === 'GET') return conteudoPublico(env);
  if (p.indexOf('/api/img/') === 0 && m === 'GET') return imagem(env, p.slice(9));
  if (p.indexOf('/api/video/') === 0 && m === 'GET') return video(request, env, p.slice(11));
  if (p === '/api/login' && m === 'POST') return login(request, env);
  if (p === '/api/logout' && m === 'POST') return logout();
  if (p === '/api/sessao' && m === 'GET') return json({ ok: await autorizado(request, env) });

  if (p.indexOf('/api/admin/') === 0) {
    if (!(await autorizado(request, env))) return json({ erro: 'Sessão expirada. Entre de novo.' }, 401);
    if (p === '/api/admin/conteudo' && m === 'GET') return json(await lerConteudo(env));
    if (p === '/api/admin/conteudo' && m === 'PUT') return salvarConteudo(request, env);
    if (p === '/api/admin/imagem' && m === 'POST') return uploadImagem(request, env);
    if (p === '/api/admin/video' && m === 'POST') return uploadVideo(request, env);
    if (p === '/api/admin/senha' && m === 'POST') return trocarSenha(request, env);
  }
  return json({ erro: 'Rota não encontrada' }, 404);
}

/* ===== conteúdo ===== */

async function lerConteudo(env) {
  if (!env.MQ) return SEMENTE; /* KV ainda não ligado no Cloudflare: serve a reserva em vez de quebrar o site */
  const salvo = await env.MQ.get(CHAVE_CONTEUDO, { type: 'json' });
  if (salvo && Array.isArray(salvo.secoes)) return salvo;
  return SEMENTE;
}

async function conteudoPublico(env) {
  const c = await lerConteudo(env);
  return json(
    {
      site: c.site,
      secoes: c.secoes.map(function (s) {
        return { id: s.id, titulo: s.titulo, kits: s.kits.filter(function (k) { return k.ativo !== false; }) };
      })
    },
    200,
    { 'cache-control': 'public, max-age=30' }
  );
}

async function salvarConteudo(request, env) {
  let corpo = {};
  try { corpo = await request.json(); } catch (e) { return json({ erro: 'Dados inválidos' }, 400); }
  const entradaPorId = {};
  (Array.isArray(corpo.secoes) ? corpo.secoes : []).forEach(function (s) { if (s && s.id) entradaPorId[s.id] = s; });

  const conteudo = {
    site: (corpo.site && typeof corpo.site === 'object') ? {
      whatsapp: txt(corpo.site.whatsapp, 20) || SEMENTE.site.whatsapp,
      freteTexto: txt(corpo.site.freteTexto, 200) || SEMENTE.site.freteTexto,
      colecaoNome: txt(corpo.site.colecaoNome, 40) || SEMENTE.site.colecaoNome,
      colecaoAno: txt(corpo.site.colecaoAno, 20) || SEMENTE.site.colecaoAno
    } : SEMENTE.site,
    secoes: SEMENTE.secoes.map(function (base) {
      const entrada = entradaPorId[base.id];
      const kits = entrada && Array.isArray(entrada.kits) ? entrada.kits : [];
      return { id: base.id, titulo: base.titulo, kits: kits.slice(0, KITS_MAX).map(limparKit) };
    }),
    atualizadoEm: new Date().toISOString()
  };
  await env.MQ.put(CHAVE_CONTEUDO, JSON.stringify(conteudo));
  try { await limparMidiaOrfa(env, conteudo); } catch (e) { /* falha na faxina nao derruba o save */ }
  return json(conteudo);
}

function txt(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 240) : ''; }
function novoId() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
function corValida(v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v.toLowerCase() : ''; }

function coresValidas(c) {
  if (!c || typeof c !== 'object') return undefined;
  const out = {};
  ['fundo', 'tab', 'letreiro', 'drawerAccent'].forEach(function (k) {
    if (corValida(c[k])) out[k] = corValida(c[k]);
  });
  return Object.keys(out).length ? out : undefined;
}

function limparKit(k) {
  k = k || {};
  const kit = {
    id: txt(k.id, 40) || novoId(),
    ativo: k.ativo !== false,
    rotulo: txt(k.rotulo, 40),
    nome: txt(k.nome, 80),
    desc: txt(k.desc, 500),
    cor: corValida(k.cor) || '#7A1030',
    tamanhos: (Array.isArray(k.tamanhos) ? k.tamanhos : []).filter(function (t) { return ['P', 'M', 'G'].indexOf(t) >= 0; }).slice(0, 3),
    precoPix: txt(k.precoPix, 30),
    preco3x: txt(k.preco3x, 30),
    midias: (Array.isArray(k.midias) ? k.midias : []).slice(0, MIDIAS_MAX).map(limparMidia).filter(Boolean),
    frases: (Array.isArray(k.frases) ? k.frases : []).slice(0, FRASES_MAX).map(function (f) { return txt(f, 60); }).filter(Boolean)
  };
  const cores = coresValidas(k.cores);
  if (cores) kit.cores = cores;
  return kit;
}

function limparMidia(m) {
  m = m || {};
  const tipo = m.tipo === 'video' ? 'video' : 'img';
  const src = txt(m.src, 200);
  if (!src) return null;
  const out = { tipo: tipo, src: src };
  if (tipo === 'video') out.comAudio = !!m.comAudio;
  return out;
}

/* ===== fotos (KV) ===== */

async function uploadImagem(request, env) {
  const ct = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(ct) < 0) {
    return json({ erro: 'Formato não aceito. Use JPG, PNG ou WEBP.' }, 415);
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ erro: 'Arquivo vazio' }, 400);
  if (bytes.byteLength > IMG_MAX) return json({ erro: 'Imagem acima de 4 MB' }, 413);
  const id = novoId();
  await env.MQ.put('img:' + id, bytes, { metadata: { ct: ct, criadoEm: Date.now() } });
  return json({ id: id, url: '/api/img/' + id });
}

async function imagem(env, id) {
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return new Response('', { status: 404 });
  const r = await env.MQ.getWithMetadata('img:' + id, { type: 'arrayBuffer' });
  if (!r || !r.value) return new Response('', { status: 404 });
  return new Response(r.value, {
    headers: {
      'content-type': (r.metadata && r.metadata.ct) || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable'
    }
  });
}

/* ===== vídeos (R2) =====
   R2 em vez de KV porque vídeo passa fácil do teto de 25 MB por item do KV.
   GET responde Range pra permitir avançar o vídeo sem baixar tudo antes. */

async function uploadVideo(request, env) {
  const ct = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (['video/mp4', 'video/quicktime', 'video/webm'].indexOf(ct) < 0) {
    return json({ erro: 'Formato não aceito. Use MP4, MOV ou WEBM.' }, 415);
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ erro: 'Arquivo vazio' }, 400);
  if (bytes.byteLength > VIDEO_MAX) return json({ erro: 'Vídeo acima de 40 MB. Grave um clipe mais curto ou comprima antes de subir.' }, 413);
  const id = novoId();
  await env.MQMEDIA.put('vid:' + id, bytes, { httpMetadata: { contentType: ct } });
  return json({ id: id, url: '/api/video/' + id });
}

async function video(request, env, id) {
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return new Response('', { status: 404 });
  const key = 'vid:' + id;
  const range = request.headers.get('range');
  const headers = { 'cache-control': 'public, max-age=31536000, immutable', 'accept-ranges': 'bytes' };

  if (range) {
    const head = await env.MQMEDIA.head(key);
    if (!head) return new Response('', { status: 404 });
    const size = head.size;
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let inicio = m[1] ? parseInt(m[1], 10) : 0;
    let fim = m[2] ? parseInt(m[2], 10) : size - 1;
    if (isNaN(inicio) || inicio < 0) inicio = 0;
    if (isNaN(fim) || fim > size - 1) fim = size - 1;
    if (inicio > fim) return new Response('', { status: 416, headers: { 'content-range': 'bytes */' + size } });

    const obj = await env.MQMEDIA.get(key, { range: { offset: inicio, length: fim - inicio + 1 } });
    if (!obj) return new Response('', { status: 404 });
    headers['content-type'] = (obj.httpMetadata && obj.httpMetadata.contentType) || 'video/mp4';
    headers['content-length'] = String(fim - inicio + 1);
    headers['content-range'] = 'bytes ' + inicio + '-' + fim + '/' + size;
    return new Response(obj.body, { status: 206, headers: headers });
  }

  const obj = await env.MQMEDIA.get(key);
  if (!obj) return new Response('', { status: 404 });
  headers['content-type'] = (obj.httpMetadata && obj.httpMetadata.contentType) || 'video/mp4';
  headers['content-length'] = String(obj.size);
  return new Response(obj.body, { status: 200, headers: headers });
}

/* Apaga do KV/R2 a mídia que nenhum kit usa mais (kit excluído, foto/vídeo trocado).
   Só mexe em mídia com mais de 1 hora: assim não apaga a que acabou de ser enviada
   e ainda não foi publicada. Atenção: env.MQ.list() rejeita cursor null. */
async function limparMidiaOrfa(env, conteudo) {
  const usadasImg = {}, usadasVid = {};
  conteudo.secoes.forEach(function (s) {
    s.kits.forEach(function (k) {
      (k.midias || []).forEach(function (m) {
        const alvoImg = /\/api\/img\/([a-z0-9]+)/i.exec(m.src);
        const alvoVid = /\/api\/video\/([a-z0-9]+)/i.exec(m.src);
        if (alvoImg) usadasImg[alvoImg[1]] = 1;
        if (alvoVid) usadasVid[alvoVid[1]] = 1;
      });
    });
  });
  const limite = Date.now() - 3600000;

  let cursor = '';
  do {
    const opcoes = { prefix: 'img:' };
    if (cursor) opcoes.cursor = cursor;
    const r = await env.MQ.list(opcoes);
    for (const k of r.keys) {
      const criado = (k.metadata && k.metadata.criadoEm) || 0;
      if (!usadasImg[k.name.slice(4)] && criado < limite) await env.MQ.delete(k.name);
    }
    cursor = r.list_complete ? '' : r.cursor;
  } while (cursor);

  let cursorV;
  do {
    const r = await env.MQMEDIA.list({ prefix: 'vid:', cursor: cursorV });
    for (const obj of r.objects) {
      const id = obj.key.slice(4);
      if (!usadasVid[id] && obj.uploaded.getTime() < limite) await env.MQMEDIA.delete(obj.key);
    }
    cursorV = r.truncated ? r.cursor : undefined;
  } while (cursorV);
}

/* ===== sessão e senha ===== */

async function login(request, env) {
  if (!env.ADMIN_SENHA) return json({ erro: 'Senha do painel ainda não configurada no Cloudflare.' }, 503);
  if (!env.MQ) return json({ erro: 'Painel ainda não configurado (falta o KV no Cloudflare).' }, 503);

  const chaveIp = 'tent:' + (request.headers.get('cf-connecting-ip') || 'sem-ip');
  const tentativas = parseInt((await env.MQ.get(chaveIp)) || '0', 10);
  if (tentativas >= TENTATIVAS_MAX) return json({ erro: 'Muitas tentativas. Espere 10 minutos.' }, 429);

  let corpo = {};
  try { corpo = await request.json(); } catch (e) {}

  if (!(await conferirSenha(env, typeof corpo.senha === 'string' ? corpo.senha : ''))) {
    await env.MQ.put(chaveIp, String(tentativas + 1), { expirationTtl: 600 });
    return json({ erro: 'Senha incorreta' }, 401);
  }
  await env.MQ.delete(chaveIp);
  return json({ ok: true }, 200, { 'set-cookie': await cookieSessao(env) });
}

function logout() {
  return json({ ok: true }, 200, {
    'set-cookie': COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  });
}

async function trocarSenha(request, env) {
  let corpo = {};
  try { corpo = await request.json(); } catch (e) {}
  const nova = typeof corpo.nova === 'string' ? corpo.nova : '';
  if (nova.length < 8) return json({ erro: 'A senha nova precisa de 8 caracteres ou mais.' }, 400);
  if (!(await conferirSenha(env, typeof corpo.atual === 'string' ? corpo.atual : ''))) {
    return json({ erro: 'A senha atual está errada.' }, 401);
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.MQ.put('senha', JSON.stringify({ salt: salt, iter: PBKDF2_ITER, hash: await derivar(nova, salt, PBKDF2_ITER) }));
  return json({ ok: true });
}

/* Senha do KV (trocada pelo painel) manda; sem ela, vale o secret ADMIN_SENHA. */
async function conferirSenha(env, enviada) {
  const guardada = await env.MQ.get('senha', { type: 'json' });
  if (guardada && guardada.hash) return (await derivar(enviada, guardada.salt, guardada.iter)) === guardada.hash;
  const base = env.ADMIN_SENHA || '';
  if (!base) return false;
  const par = await Promise.all([assinar(env, 'c:' + enviada), assinar(env, 'c:' + base)]);
  return par[0] === par[1];
}

async function cookieSessao(env) {
  const exp = Date.now() + SESSAO_DIAS * 86400000;
  const token = exp + '.' + (await assinar(env, String(exp)));
  return COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSAO_DIAS * 86400;
}

async function autorizado(request, env) {
  if (!env.ADMIN_SENHA) return false;
  const cookie = request.headers.get('cookie') || '';
  const achado = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!achado) return false;
  const partes = achado[1].split('.');
  if (partes.length !== 2) return false;
  const exp = parseInt(partes[0], 10);
  if (!exp || exp < Date.now()) return false;
  return (await assinar(env, String(exp))) === partes[1];
}

async function assinar(env, dado) {
  const bruto = new TextEncoder().encode(env.ADMIN_SECRET || env.ADMIN_SENHA || '');
  const chave = await crypto.subtle.importKey('raw', bruto, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(dado)));
}

async function derivar(senha, saltHex, iter) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: deHex(saltHex), iterations: iter || PBKDF2_ITER, hash: 'SHA-256' }, chave, 256);
  return b64url(bits);
}

function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}
function deHex(h) {
  const a = new Uint8Array(String(h).length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(String(h).substr(i * 2, 2), 16);
  return a;
}
function b64url(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(dados, status, extras) {
  const h = { 'content-type': 'application/json; charset=utf-8' };
  for (const k in extras || {}) h[k] = extras[k];
  return new Response(JSON.stringify(dados), { status: status || 200, headers: h });
}
