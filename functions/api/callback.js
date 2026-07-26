/* Passo 2 do login: troca o code por um token e devolve pro painel
   via postMessage — é o protocolo que o Sveltia/Decap espera. */

function paginaResposta(payload, origem) {
  // O painel escuta 'authorization:github:success:<json>' na janela que abriu o popup.
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Entrando…</title></head>
<body style="font-family:system-ui;background:#1A1214;color:#F2E8E0;display:grid;place-items:center;height:100vh;margin:0">
<p>Conectando ao painel…</p>
<script>
(function(){
  var msg = 'authorization:github:${payload.erro ? 'error' : 'success'}:' + ${JSON.stringify(JSON.stringify(payload.dados))};
  function envia(e){
    if (!window.opener) return;
    window.opener.postMessage(msg, ${JSON.stringify(origem)});
  }
  window.addEventListener('message', envia, false);
  envia();
  setTimeout(function(){ window.close(); }, 1200);
})();
</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origem = url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response('GITHUB_CLIENT_ID/SECRET não configurados no Cloudflare Pages.', { status: 500 });
  }
  if (!code) return new Response('Faltou o code do GitHub.', { status: 400 });

  // confere o state contra o cookie
  const cookies = request.headers.get('Cookie') || '';
  const esperado = /(?:^|;\s*)mesq_oauth_state=([^;]+)/.exec(cookies);
  if (!esperado || !state || esperado[1] !== state) {
    return new Response('State inválido — tente entrar de novo.', { status: 400 });
  }

  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origem}/api/callback`
    })
  });

  const dados = await resp.json();
  if (!resp.ok || dados.error || !dados.access_token) {
    return paginaResposta({ erro: true, dados: { message: dados.error_description || 'Falha ao autenticar no GitHub.' } }, origem);
  }

  return paginaResposta({ erro: false, dados: { token: dados.access_token, provider: 'github' } }, origem);
}
