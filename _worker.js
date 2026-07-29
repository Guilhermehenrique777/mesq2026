/* _worker.js — MESQ.
   API do painel /admin: login, CRUD dos kits, upload de foto e vídeo.
   Conteúdo no Cloudflare KV (binding MQ). Fotos no KV, vídeos no R2 (binding MQMEDIA) —
   vídeo não cabe com folga no teto de 25 MB por item do KV. Advanced mode do Pages:
   este arquivo responde /api/* e delega todo o resto pros arquivos estáticos (env.ASSETS).

   Secrets no projeto Pages:
     ADMIN_SENHA              (obrigatório) senha inicial da Camila
     ADMIN_GUILHERME_SENHA    (opcional) acesso independente do Guilherme
     ADMIN_SECRET             (obrigatório) chave que assina o cookie de sessão

   Bindings no projeto Pages (Settings → Bindings):
     MQ        KV namespace
     MQMEDIA   R2 bucket

   Sobre a senha: quando a Cá troca a senha pelo painel, o hash PBKDF2 vai pro KV
   (chave "senha") e passa a valer no lugar do ADMIN_SENHA. A troca também gira a versão
   da sessão: o aparelho atual recebe um cookie novo e os demais precisam entrar de novo. */

const COOKIE = '__Host-mesq_adm';
const SESSAO_DIAS = 14;
const IMG_MAX = 4 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const CHAVE_CONTEUDO = 'conteudo';
const TENTATIVAS_MAX = 12;
const KITS_MAX = 20;
const MIDIAS_MAX = 8;
const FRASES_MAX = 15;
const BENEFICIOS_MAX = 6;
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
    colecaoAno: '2026',
    corCapa: '#1A1214'
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
          beneficios: ['Bojo incluso', 'Bolso no short', 'Tecido Trilobal', 'Alta sustentação'],
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
          beneficios: ['Bojo incluso', 'Bolso no short', 'Tecido Trilobal', 'Alta sustentação'],
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
          beneficios: ['Bojo incluso', 'Bolso no short', 'Tecido Trilobal', 'Alta sustentação'],
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
          beneficios: ['Bojo incluso', 'Zero transparência', 'Tecido Trilobal', 'Leve brilho'],
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
          beneficios: ['Bojo incluso', 'Zero transparência', 'Tecido Trilobal', 'Leve brilho'],
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
    let response;
    if (url.pathname.indexOf('/api/') === 0) {
      try {
        response = await rota(request, env, url);
      } catch (err) {
        console.error('Falha na API MESQ.', err);
        response = json({ erro: 'Falha inesperada. Tente de novo.' }, 500);
      }
    } else {
      response = await env.ASSETS.fetch(request);
    }
    return comCabecalhos(response, url);
  }
};

async function rota(request, env, url) {
  const p = url.pathname;
  const m = request.method;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(m) >= 0 && !origemPermitida(request, url)) {
    return json({ erro: 'Origem da requisição não permitida.' }, 403);
  }

  if (p === '/api/conteudo' && m === 'GET') return conteudoPublico(env);
  if (p.indexOf('/api/img/') === 0 && m === 'GET') return imagem(env, p.slice(9));
  if (p.indexOf('/api/video/') === 0 && m === 'GET') return video(request, env, p.slice(11));
  if (p === '/api/login' && m === 'POST') return login(request, env);
  if (p === '/api/logout' && m === 'POST') return logout();
  if (p === '/api/sessao' && m === 'GET') {
    const perfil = await perfilAutorizado(request, env);
    return json({ ok: !!perfil, perfil: perfil || null });
  }

  if (p.indexOf('/api/admin/') === 0) {
    const perfil = await perfilAutorizado(request, env);
    if (!perfil) return json({ erro: 'Sessão expirada. Entre de novo.' }, 401);
    if (p === '/api/admin/conteudo' && m === 'GET') return json(await lerConteudo(env));
    if (p === '/api/admin/conteudo' && m === 'PUT') return salvarConteudo(request, env);
    if (p === '/api/admin/imagem' && m === 'POST') return uploadImagem(request, env);
    if (p === '/api/admin/video' && m === 'POST') return uploadVideo(request, env);
    if (p === '/api/admin/senha' && m === 'POST') return trocarSenha(request, env, perfil);
  }
  return json({ erro: 'Rota não encontrada' }, 404);
}

function origemPermitida(request, url) {
  const contexto = request.headers.get('sec-fetch-site');
  if (contexto === 'cross-site') return false;
  const origem = request.headers.get('origin');
  if (origem) return origem === url.origin;
  const referencia = request.headers.get('referer');
  if (!referencia) return false;
  try { return new URL(referencia).origin === url.origin; } catch (e) { return false; }
}

function comCabecalhos(response, url) {
  const h = new Headers(response.headers);
  const ehAdmin = url.pathname === '/admin' || url.pathname.indexOf('/admin/') === 0;
  const ehApi = url.pathname.indexOf('/api/') === 0;
  const ehHtml = (h.get('content-type') || '').indexOf('text/html') >= 0;

  h.delete('access-control-allow-origin');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('x-frame-options', 'DENY');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  h.set('strict-transport-security', 'max-age=31536000');

  if (ehAdmin || ehApi) {
    h.set('cache-control', 'no-store');
    h.set('x-robots-tag', 'noindex, nofollow');
  }
  if (ehHtml) {
    h.set('content-security-policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; " +
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; " +
      "media-src 'self' blob:; connect-src 'self'; upgrade-insecure-requests");
  } else if (ehApi) {
    h.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h
  });
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
  const site = c.site && typeof c.site === 'object' ? c.site : {};
  const secoesSalvas = Array.isArray(c.secoes) ? c.secoes : [];
  return json(
    {
      site: {
        whatsapp: txt(site.whatsapp, 20) || SEMENTE.site.whatsapp,
        freteTexto: txt(site.freteTexto, 200) || SEMENTE.site.freteTexto,
        colecaoNome: txt(site.colecaoNome, 40) || SEMENTE.site.colecaoNome,
        colecaoAno: txt(site.colecaoAno, 20) || SEMENTE.site.colecaoAno,
        corCapa: corValida(site.corCapa) || SEMENTE.site.corCapa
      },
      secoes: SEMENTE.secoes.map(function (base) {
        const salva = secoesSalvas.find(function (s) { return s && s.id === base.id; });
        const kits = salva && Array.isArray(salva.kits) ? salva.kits : base.kits;
        return {
          id: base.id,
          titulo: base.titulo,
          kits: kits.slice(0, KITS_MAX).map(function (k) { return limparKit(k, base.id); })
            .filter(function (k) { return k.ativo !== false; })
        };
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
      colecaoAno: txt(corpo.site.colecaoAno, 20) || SEMENTE.site.colecaoAno,
      corCapa: corValida(corpo.site.corCapa) || SEMENTE.site.corCapa
    } : SEMENTE.site,
    secoes: SEMENTE.secoes.map(function (base) {
      const entrada = entradaPorId[base.id];
      const kits = entrada && Array.isArray(entrada.kits) ? entrada.kits : [];
      return { id: base.id, titulo: base.titulo, kits: kits.slice(0, KITS_MAX).map(function (k) { return limparKit(k, base.id); }) };
    }),
    atualizadoEm: new Date().toISOString()
  };
  await env.MQ.put(CHAVE_CONTEUDO, JSON.stringify(conteudo));
  try { await limparMidiaOrfa(env, conteudo); } catch (e) { /* falha na faxina nao derruba o save */ }
  return json(conteudo);
}

function txt(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 240) : ''; }
function novoId() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
function corValida(v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toUpperCase() : ''; }

function coresValidas(c) {
  if (!c || typeof c !== 'object') return undefined;
  const out = {};
  ['fundo', 'tab', 'letreiro', 'drawerAccent'].forEach(function (k) {
    if (corValida(c[k])) out[k] = corValida(c[k]);
  });
  return Object.keys(out).length ? out : undefined;
}

function limparKit(k, secaoId) {
  k = k || {};
  const beneficiosPadrao = secaoId === 'kits2'
    ? ['Bojo incluso', 'Zero transparência', 'Tecido Trilobal', 'Leve brilho']
    : ['Bojo incluso', 'Bolso no short', 'Tecido Trilobal', 'Alta sustentação'];
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
    frases: (Array.isArray(k.frases) ? k.frases : []).slice(0, FRASES_MAX).map(function (f) { return txt(f, 60); }).filter(Boolean),
    beneficios: (Array.isArray(k.beneficios) ? k.beneficios : beneficiosPadrao).slice(0, BENEFICIOS_MAX).map(function (b) { return txt(b, 50); }).filter(Boolean)
  };
  const cores = coresValidas(k.cores);
  if (cores) kit.cores = cores;
  return kit;
}

function limparMidia(m) {
  m = m || {};
  const tipo = m.tipo === 'video' ? 'video' : 'img';
  const src = txt(m.src, 200);
  if (!midiaSrcValida(src, tipo)) return null;
  const out = { tipo: tipo, src: src };
  if (tipo === 'video') out.comAudio = !!m.comAudio;
  return out;
}

function midiaSrcValida(src, tipo) {
  if (/^\/api\/img\/[a-z0-9]{1,40}$/i.test(src)) return tipo === 'img';
  if (/^\/api\/video\/[a-z0-9]{1,40}$/i.test(src)) return tipo === 'video';
  if (src.indexOf('..') >= 0 || !/^midias\/[a-z0-9._/-]{1,180}$/i.test(src)) return false;
  return tipo === 'video' ? /\.mp4$/i.test(src) : /\.(?:avif|jpe?g|png|webp)$/i.test(src);
}

/* ===== fotos (KV) ===== */

async function uploadImagem(request, env) {
  const ct = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(ct) < 0) {
    return json({ erro: 'Formato não aceito. Use JPG, PNG ou WEBP.' }, 415);
  }
  if (corpoMaiorQue(request, IMG_MAX)) return json({ erro: 'Imagem acima de 4 MB' }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ erro: 'Arquivo vazio' }, 400);
  if (bytes.byteLength > IMG_MAX) return json({ erro: 'Imagem acima de 4 MB' }, 413);
  if (!assinaturaImagemValida(bytes, ct)) return json({ erro: 'O conteúdo do arquivo não corresponde a uma imagem válida.' }, 415);
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
  if (ct !== 'video/mp4') {
    return json({ erro: 'Formato não aceito. Use MP4 para funcionar bem em celulares e computadores.' }, 415);
  }
  if (corpoMaiorQue(request, VIDEO_MAX)) return json({ erro: 'Vídeo acima de 40 MB. Comprima ou encurte antes de subir.' }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ erro: 'Arquivo vazio' }, 400);
  if (bytes.byteLength > VIDEO_MAX) return json({ erro: 'Vídeo acima de 40 MB. Grave um clipe mais curto ou comprima antes de subir.' }, 413);
  if (!assinaturaMp4Valida(bytes)) return json({ erro: 'O arquivo não parece ser um vídeo MP4 válido.' }, 415);
  const id = novoId();
  await env.MQMEDIA.put('vid:' + id, bytes, { httpMetadata: { contentType: ct } });
  return json({ id: id, url: '/api/video/' + id });
}

function corpoMaiorQue(request, max) {
  const n = parseInt(request.headers.get('content-length') || '0', 10);
  return Number.isFinite(n) && n > max;
}

function assinaturaImagemValida(buffer, ct) {
  const b = new Uint8Array(buffer);
  if (ct === 'image/jpeg') return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ct === 'image/png') return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  return b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

function assinaturaMp4Valida(buffer) {
  const b = new Uint8Array(buffer);
  return b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
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
    const faixa = analisarRange(range, size);
    if (!faixa) return new Response('', { status: 416, headers: { 'content-range': 'bytes */' + size } });
    const inicio = faixa.inicio;
    const fim = faixa.fim;

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

function analisarRange(valor, tamanho) {
  if (!tamanho || valor.indexOf(',') >= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(valor.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let inicio;
  let fim;
  if (!m[1]) {
    const sufixo = parseInt(m[2], 10);
    if (!sufixo || sufixo < 1) return null;
    inicio = Math.max(tamanho - sufixo, 0);
    fim = tamanho - 1;
  } else {
    inicio = parseInt(m[1], 10);
    fim = m[2] ? parseInt(m[2], 10) : tamanho - 1;
    if (!Number.isFinite(inicio) || inicio < 0 || inicio >= tamanho) return null;
    if (!Number.isFinite(fim) || fim < inicio) return null;
    fim = Math.min(fim, tamanho - 1);
  }
  return { inicio: inicio, fim: fim };
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
  if (!env.ADMIN_SENHA || !env.ADMIN_SECRET) return json({ erro: 'Segredos do painel ainda não configurados no Cloudflare.' }, 503);
  if (!env.MQ) return json({ erro: 'Painel ainda não configurado (falta o KV no Cloudflare).' }, 503);

  const chaveIp = 'tent:' + (request.headers.get('cf-connecting-ip') || 'sem-ip');
  const tentativas = parseInt((await env.MQ.get(chaveIp)) || '0', 10);
  if (tentativas >= TENTATIVAS_MAX) return json({ erro: 'Muitas tentativas. Espere 10 minutos.' }, 429);

  let corpo = {};
  try { corpo = await request.json(); } catch (e) {}

  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  const perfil = senha.length <= 128 ? await conferirCredencial(env, senha) : '';
  if (!perfil) {
    await env.MQ.put(chaveIp, String(tentativas + 1), { expirationTtl: 600 });
    return json({ erro: 'Senha incorreta' }, 401);
  }
  await env.MQ.delete(chaveIp);
  return json({ ok: true, perfil: perfil }, 200, { 'set-cookie': await cookieSessao(env, perfil) });
}

function logout() {
  return json({ ok: true }, 200, {
    'set-cookie': COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  });
}

async function trocarSenha(request, env, perfil) {
  if (perfil !== 'camila') {
    return json({ erro: 'A senha do acesso Guilherme é gerenciada separadamente no Cloudflare.' }, 403);
  }
  let corpo = {};
  try { corpo = await request.json(); } catch (e) {}
  const nova = typeof corpo.nova === 'string' ? corpo.nova : '';
  if (nova.length < 12) return json({ erro: 'A senha nova precisa de 12 caracteres ou mais.' }, 400);
  if (nova.length > 128) return json({ erro: 'A senha nova precisa ter no máximo 128 caracteres.' }, 400);
  if (!(await conferirSenhaCamila(env, typeof corpo.atual === 'string' ? corpo.atual : ''))) {
    return json({ erro: 'A senha atual está errada.' }, 401);
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.MQ.put('senha', JSON.stringify({
    versao: 2,
    algoritmo: 'hmac-sha256-pepper',
    salt: salt,
    hash: await assinar(env, 'senha-v2:' + salt + ':' + nova)
  }));
  await env.MQ.put('sessao:versao:camila', crypto.randomUUID());
  return json({ ok: true, perfil: 'camila' }, 200, { 'set-cookie': await cookieSessao(env, 'camila') });
}

/* Senha do KV (trocada pelo painel) manda; sem ela, vale o secret ADMIN_SENHA. */
async function conferirSenhaCamila(env, enviada) {
  const guardada = await env.MQ.get('senha', { type: 'json' });
  if (guardada && guardada.versao === 2 && guardada.algoritmo === 'hmac-sha256-pepper' &&
      /^[0-9a-f]{32}$/i.test(guardada.salt || '') && typeof guardada.hash === 'string') {
    return igualSeguro(await assinar(env, 'senha-v2:' + guardada.salt + ':' + enviada), guardada.hash);
  }
  /* Compatibilidade temporária com senhas gravadas pela versão antiga. */
  if (guardada && guardada.hash && /^[0-9a-f]{32}$/i.test(guardada.salt || '') &&
      Number.isInteger(guardada.iter) && guardada.iter >= 50000 && guardada.iter <= 600000) {
    return igualSeguro(await derivar(enviada, guardada.salt, guardada.iter), guardada.hash);
  }
  const base = env.ADMIN_SENHA || '';
  if (!base) return false;
  const par = await Promise.all([assinar(env, 'c:' + enviada), assinar(env, 'c:' + base)]);
  return igualSeguro(par[0], par[1]);
}

async function conferirCredencial(env, enviada) {
  if (await conferirSenhaCamila(env, enviada)) return 'camila';
  const mestre = env.ADMIN_GUILHERME_SENHA || '';
  if (!mestre) return '';
  const par = await Promise.all([assinar(env, 'g:' + enviada), assinar(env, 'g:' + mestre)]);
  return igualSeguro(par[0], par[1]) ? 'guilherme' : '';
}

async function cookieSessao(env, perfil) {
  if (perfil !== 'camila' && perfil !== 'guilherme') throw new Error('Perfil de sessão inválido');
  const exp = Date.now() + SESSAO_DIAS * 86400000;
  const versao = (await env.MQ.get('sessao:versao:' + perfil)) || '1';
  const base = exp + '.' + perfil + '.' + versao;
  const token = base + '.' + (await assinar(env, base));
  return COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSAO_DIAS * 86400;
}

async function perfilAutorizado(request, env) {
  if (!env.ADMIN_SECRET || !env.MQ) return '';
  const cookie = request.headers.get('cookie') || '';
  const achado = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!achado) return '';
  const partes = achado[1].split('.');
  if (partes.length !== 4) return '';
  const exp = parseInt(partes[0], 10);
  const perfil = partes[1];
  if (!exp || exp < Date.now() || (perfil !== 'camila' && perfil !== 'guilherme')) return '';
  const versao = (await env.MQ.get('sessao:versao:' + perfil)) || '1';
  if (!igualSeguro(partes[2], versao)) return '';
  const base = partes[0] + '.' + perfil + '.' + partes[2];
  return igualSeguro(await assinar(env, base), partes[3]) ? perfil : '';
}

function igualSeguro(a, b) {
  a = String(a || '');
  b = String(b || '');
  let diferente = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diferente |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferente === 0;
}

async function assinar(env, dado) {
  const bruto = new TextEncoder().encode(env.ADMIN_SECRET || '');
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
