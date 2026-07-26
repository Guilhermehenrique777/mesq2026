/* Passo 1 do login do painel: manda a Cá pro GitHub autorizar.
   Precisa de GITHUB_CLIENT_ID nas variáveis do Cloudflare Pages. */
export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response('GITHUB_CLIENT_ID não configurado no Cloudflare Pages.', { status: 500 });
  }

  const origem = new URL(request.url).origin;
  // state aleatório guardado em cookie — confere no callback contra CSRF
  const state = crypto.randomUUID();

  const destino = new URL('https://github.com/login/oauth/authorize');
  destino.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  destino.searchParams.set('redirect_uri', `${origem}/api/callback`);
  destino.searchParams.set('scope', 'repo,user');
  destino.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: destino.toString(),
      'Set-Cookie': `mesq_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    }
  });
}
