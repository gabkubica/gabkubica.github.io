// ============================================================
// Modo Gerenciador — tudo que é comum a todas as páginas
// ============================================================
//
// O que este arquivo faz em toda página:
//   - Botão "Modo Gerenciador" na barra vermelha (entrar com usuário e senha;
//     na primeira vez, cadastrar o primeiro gerente).
//   - Faixa logo abaixo da barra mostrando QUEM entrou, com botão Sair.
//   - Marca a página com <html data-gerente="sim|nao">.
//   - Páginas só de gerente (PAGINAS_GERENTE): em qualquer menu da página,
//     os links para elas ficam apagados com cadeado; clicar pede o login.
//     Abrir uma delas direto pelo endereço mostra um aviso no lugar do
//     conteúdo até alguém entrar.
//   - Campos/botões marcados com data-trava-gerente ficam travados (com
//     cadeado e o aviso "Editável no modo gerenciador") — ver aplicarTravas.
//
// IMPORTANTE: tudo isso é só a TELA. Quem garante a proteção é o servidor
// (src/gerente.js), que recusa as ações de gerente fora do modo.
//
// Para as telas usarem:
//   HTML:  <button data-somente-gerente>...</button>   (some fora do modo)
//          <input data-trava-gerente>                  (fica travado fora do modo)
//   JS:    Gerente.ativo()        -> true/false
//          Gerente.usuario()      -> { id, nome, login } ou null
//          Gerente.aplicarTravas(raiz, travarQuandoDesligado = true)
//          await Gerente.pedir()  -> abre a janela; true se entrou
//          window.addEventListener('gerente:mudou', e => e.detail.ativo ...)
(function () {
  const PAGINAS_GERENTE = [
    '/caixa.html',
    '/numeros.html',
    '/londrisoft.html',
    '/funcionarios.html',
    '/usuarios.html',
    '/comissoes.html', // comissões dos funcionários
    '/importar.html', // importar tabela de itens
    '/contatos.html', // agenda escondida: só se chega pela faixa do gerente
  ];
  const AVISO_TRAVA = 'Editável no modo gerenciador';
  const AVISO_LINK = 'Disponível no modo gerenciador';

  let ativo = false;
  let usuario = null;
  let temUsuarios = true;
  let inatividadeMin = 15;
  let expiraEm = null; // quando (Date.now) o modo desliga sozinho, se ninguém usar
  let jaConsultou = false;
  let botao = null;
  let faixa = null;
  let dialogo = null;

  const paginaAtual = location.pathname === '/' ? '/index.html' : location.pathname;
  const ehPaginaGerente = PAGINAS_GERENTE.includes(paginaAtual);

  const ICONE_CADEADO =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/>' +
    '<path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const ICONE_ABERTO =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/>' +
    '<path d="M5.2 7V5a2.8 2.8 0 0 1 5.5-.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  // Cadeado pequeno, para campos travados e links apagados.
  const CADEADO_MINI =
    '<svg class="cadeado-mini" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/>' +
    '<path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  // Enquanto o servidor não responde (uns milissegundos), a tela começa com o
  // último estado conhecido neste computador — assim a faixa, os links e os
  // cadeados não "piscam" ao trocar de página. É só a aparência: quem manda
  // é o servidor, e a resposta dele corrige tudo logo em seguida.
  // Nas páginas só de gerente, nem o conteúdo nem o aviso de cadeado aparecem
  // antes da resposta (classe gerente-verificando).
  const CHAVE_DICA = 'gerente-dica';
  function lerDica() {
    try {
      const d = JSON.parse(localStorage.getItem(CHAVE_DICA) || 'null');
      return d && d.ativo && d.usuario ? d : null;
    } catch (e) { return null; }
  }
  function guardarDica() {
    try {
      if (ativo && usuario) {
        localStorage.setItem(CHAVE_DICA, JSON.stringify({
          ativo: true, usuario: { nome: usuario.nome, login: usuario.login },
        }));
      } else {
        localStorage.removeItem(CHAVE_DICA);
      }
    } catch (e) { /* sem armazenamento: só perde a dica */ }
  }
  const dica = lerDica();
  if (dica) { ativo = true; usuario = dica.usuario; }
  document.documentElement.dataset.gerente = ativo ? 'sim' : 'nao';
  document.documentElement.classList.add('gerente-verificando');
  if (ehPaginaGerente) document.documentElement.classList.add('pagina-gerente');

  // ---------- estado ----------

  function aplicar(novoAtivo, novoUsuario) {
    const mudou = novoAtivo !== ativo;
    const estavaConsultado = jaConsultou;
    ativo = novoAtivo;
    usuario = novoAtivo ? novoUsuario : null;
    jaConsultou = true;
    document.documentElement.dataset.gerente = ativo ? 'sim' : 'nao';
    document.documentElement.classList.remove('gerente-verificando');
    marcarTitulo();
    guardarDica();
    atualizarBotao();
    atualizarFaixa();
    marcarLinks();
    aplicarTravas(document);
    if (mudou) {
      window.dispatchEvent(new CustomEvent('gerente:mudou', { detail: { ativo, usuario } }));
      // Numa página só de gerente, os dados não carregaram enquanto o modo
      // estava desligado (o servidor recusou). Entrou agora: recarrega.
      if (ativo && ehPaginaGerente && estavaConsultado) location.reload();
    }
  }

  // caminho 'renovar' = mesma resposta, mas conta como uso (clique no contador).
  async function consultarEstado(caminho) {
    try {
      const r = await fetch('/api/gerente/' + (caminho === 'renovar' ? 'renovar' : 'estado'), { cache: 'no-store' });
      if (!r.ok) { pararVerificacao(); return; }
      const d = await r.json();
      temUsuarios = !!d.temUsuarios;
      if (d.inatividadeMin) inatividadeMin = d.inatividadeMin;
      expiraEm = d.restanteSeg === null || d.restanteSeg === undefined ? null : Date.now() + d.restanteSeg * 1000;
      aplicar(!!d.ativo, d.usuario || null);
    } catch (e) {
      // Sem conexão com o servidor: mantém como está.
      pararVerificacao();
    }
  }

  // Sem resposta do servidor: não deixa a página só de gerente em branco;
  // mostra o que o estado atual manda (o cadeado, se não houver dica).
  function pararVerificacao() {
    document.documentElement.classList.remove('gerente-verificando');
  }

  async function postar(caminho, corpo) {
    const r = await fetch('/api/gerente/' + caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {}),
    });
    let d = {};
    try { d = await r.json(); } catch (e) { /* resposta vazia */ }
    if (!r.ok) {
      const erro = new Error(d.erro || 'Erro no Modo Gerenciador.');
      erro.codigo = d.codigo;
      throw erro;
    }
    return d;
  }

  async function sair() {
    try { await postar('sair'); } catch (e) { /* mesmo com erro, desliga na tela */ }
    aplicar(false, null);
  }

  // ---------- travas de campos ----------

  // Trava (ou destrava) os elementos com data-trava-gerente dentro de "raiz".
  //   travarQuandoDesligado = false -> nunca trava (ex.: produto NOVO, em que
  //   todos os campos precisam ser preenchidos por quem está cadastrando).
  // data-trava-gerente="icone": só mostra o cadeado, sem mexer no campo
  // (para campos que já são sempre bloqueados, ex.: código automático).
  function aplicarTravas(raiz, travarQuandoDesligado) {
    const base = raiz || document;
    const permitido = travarQuandoDesligado !== false;
    base.querySelectorAll('[data-trava-gerente]').forEach((el) => {
      // A página pode desligar a trava de um bloco inteiro (produto novo).
      const bloco = el.closest('[data-trava-desligada]');
      const travar = !ativo && permitido && !bloco;
      const soIcone = el.dataset.travaGerente === 'icone';
      if (!soIcone) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.readOnly = travar;
        } else {
          el.disabled = travar;
        }
      }
      el.dataset.travado = travar ? '1' : '';
      // Campo: "Editável no modo gerenciador". Botão (excluir, usar preço):
      // "Disponível no modo gerenciador" — botão não se "edita".
      const aviso = el.tagName === 'BUTTON' ? AVISO_LINK : AVISO_TRAVA;
      if (travar) {
        if (!el.dataset.tituloOriginal) el.dataset.tituloOriginal = el.getAttribute('title') || '-';
        el.title = aviso;
      } else if (el.dataset.tituloOriginal) {
        if (el.dataset.tituloOriginal === '-') el.removeAttribute('title');
        else el.title = el.dataset.tituloOriginal;
        delete el.dataset.tituloOriginal;
      }
      // Cadeado ao lado do rótulo do campo (ou dentro do botão).
      const alvo = rotuloDe(el);
      if (alvo) {
        let cad = alvo.querySelector(':scope > .cadeado-campo');
        if (!cad) {
          cad = document.createElement('span');
          cad.className = 'cadeado-campo';
          cad.innerHTML = CADEADO_MINI;
          cad.title = aviso;
          cad.setAttribute('aria-label', aviso);
          alvo.appendChild(cad);
        }
        cad.hidden = !travar;
      }
    });
  }

  function rotuloDe(el) {
    if (el.tagName === 'BUTTON') return el;
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return l;
    }
    return el.closest('label');
  }

  // ---------- links para páginas só de gerente ----------

  function caminhoDoLink(a) {
    try {
      const u = new URL(a.getAttribute('href'), location.href);
      if (u.origin !== location.origin) return null;
      return u.pathname === '/' ? '/index.html' : u.pathname;
    } catch (e) {
      return null;
    }
  }

  function marcarLinks() {
    document.querySelectorAll('a[href]').forEach((a) => {
      if (a.closest('.barra-gerente')) return; // links da própria faixa do gerente
      const caminho = caminhoDoLink(a);
      if (!caminho || !PAGINAS_GERENTE.includes(caminho)) return;
      a.classList.add('link-gerente');
      if (!a.querySelector('.cadeado-link')) {
        const c = document.createElement('span');
        c.className = 'cadeado-link';
        c.innerHTML = CADEADO_MINI;
        a.appendChild(c);
      }
      if (!ativo) {
        a.setAttribute('aria-disabled', 'true');
        a.title = AVISO_LINK;
      } else {
        a.removeAttribute('aria-disabled');
        if (a.title === AVISO_LINK) a.removeAttribute('title');
      }
    });
  }

  // Clique num link apagado: em vez de abrir, pede o login. Entrou -> abre.
  document.addEventListener('click', async (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || ativo) return;
    const caminho = caminhoDoLink(a);
    if (!caminho || !PAGINAS_GERENTE.includes(caminho)) return;
    e.preventDefault();
    e.stopPropagation();
    if (await pedir()) location.href = a.href;
  }, true);

  // ---------- botão na barra vermelha ----------

  function atualizarBotao() {
    if (!botao) return;
    const texto = ativo ? 'Gerenciador ligado' : 'Modo Gerenciador';
    botao.innerHTML = (ativo ? ICONE_ABERTO : ICONE_CADEADO) + '<span class="rotulo-topo">' + texto + '</span>';
    botao.title = ativo
      ? 'Modo Gerenciador ligado (' + (usuario ? usuario.nome : '') + '). Clique para ver opções ou sair.'
      : 'Entrar no Modo Gerenciador (usuário e senha)';
    botao.setAttribute('aria-label', texto);
    botao.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  }

  function montarBotao() {
    const header = document.querySelector('header');
    if (!header || header.querySelector('.btn-gerente')) return;
    let area = window.areaDireitaTopo ? window.areaDireitaTopo() : null;
    if (!area) {
      area = document.createElement('div');
      area.className = 'topo-direita';
      header.appendChild(area);
    }
    botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn-gerente';
    area.appendChild(botao);
    botao.addEventListener('click', async () => {
      await consultarEstado(); // pode ter expirado enquanto a página estava aberta
      pedir();
    });
    atualizarBotao();
  }

  // ---------- faixa "quem entrou", logo abaixo da barra vermelha ----------

  function montarFaixa() {
    const header = document.querySelector('header');
    if (!header || document.querySelector('.barra-gerente')) return;
    faixa = document.createElement('div');
    faixa.className = 'barra-gerente';
    faixa.setAttribute('role', 'status');
    header.insertAdjacentElement('afterend', faixa);
    faixa.addEventListener('click', (e) => {
      const b = e.target.closest('[data-faixa]');
      if (!b) return;
      if (b.dataset.faixa === 'sair') sair();
      if (b.dataset.faixa === 'senha') telaTrocarSenha();
      if (b.dataset.faixa === 'renovar') consultarEstado('renovar');
    });
    atualizarFaixa();
  }

  // Painéis laterais fixos (ex.: Editar item) começam logo abaixo da barra
  // vermelha. Com a faixa do gerente visível, eles precisam descer a altura
  // dela — senão cobrem a faixa e o botão Sair fica escondido atrás.
  function medirFaixa() {
    const altura = faixa && ativo && usuario ? faixa.offsetHeight : 0;
    document.documentElement.style.setProperty('--altura-faixa-gerente', altura + 'px');
  }
  window.addEventListener('resize', () => medirFaixa());

  // "🔓 GERENTE · " na frente do título da aba enquanto o modo está ligado.
  const PREFIXO_TITULO = '🔓 GERENTE · ';
  function marcarTitulo() {
    const base = document.title.startsWith(PREFIXO_TITULO) ? document.title.slice(PREFIXO_TITULO.length) : document.title;
    document.title = (ativo ? PREFIXO_TITULO : '') + base;
  }

  function atualizarFaixa() {
    if (!faixa) return;
    if (!ativo || !usuario) { faixa.innerHTML = ''; medirFaixa(); return; }
    faixa.innerHTML =
      '<span class="faixa-quem" title="Modo Gerenciador ligado · usuário ' + esc(usuario.login) + '">' + ICONE_ABERTO +
      ' <span class="faixa-titulo">Gerente</span> <strong>' + esc(usuario.nome) + '</strong></span>' +
      '<button type="button" class="faixa-tempo" data-faixa="renovar"></button>' +
      '<span class="faixa-acoes">' +
      '<a href="/contatos.html" class="faixa-btn">Contatos</a>' +
      '<a href="/usuarios.html" class="faixa-btn">Usuários</a>' +
      '<button type="button" class="faixa-btn" data-faixa="senha"><span class="faixa-longo">Trocar senha</span><span class="faixa-curto">Senha</span></button>' +
      '<button type="button" class="faixa-btn faixa-sair" data-faixa="sair" title="Sair do modo gerenciador">Sair</button>' +
      '</span>';
    atualizarContador();
    medirFaixa();
  }

  // "desliga em 12 min": conta para baixo; no último minuto fica laranja e
  // pisca. Clicar renova o prazo (conta como uso).
  function atualizarContador() {
    const el = faixa && faixa.querySelector('.faixa-tempo');
    if (!el) return;
    const seg = expiraEm === null ? inatividadeMin * 60 : Math.max(0, (expiraEm - Date.now()) / 1000);
    const min = Math.max(1, Math.ceil(seg / 60));
    el.innerHTML = 'desliga em <b>' + min + '</b> min';
    el.classList.toggle('acabando', seg <= 60);
    el.title = 'Desliga sozinho depois de ' + inatividadeMin + ' min sem uso. Clique para renovar o prazo.';
  }
  setInterval(atualizarContador, 10 * 1000);

  // Qualquer pedido desta tela ao servidor conta como uso: o prazo recomeça.
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = function (entrada, opcoes) {
    try {
      const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href);
      if (ativo && url.origin === location.origin && url.pathname.indexOf('/api/') === 0 && url.pathname !== '/api/gerente/estado') {
        expiraEm = Date.now() + inatividadeMin * 60 * 1000;
        setTimeout(atualizarContador, 0);
      }
    } catch (e) { /* endereço estranho: não mexe no contador */ }
    return fetchOriginal(entrada, opcoes);
  };

  // ---------- aviso no lugar do conteúdo (páginas só de gerente) ----------

  function montarAvisoPagina() {
    if (!ehPaginaGerente || document.querySelector('.aviso-pagina-gerente')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const aviso = document.createElement('section');
    aviso.className = 'aviso-pagina-gerente';
    aviso.innerHTML =
      '<div class="aviso-pagina-caixa">' + ICONE_CADEADO.replace('width="15" height="15"', 'width="40" height="40"') +
      '<h2>Área do Modo Gerenciador</h2>' +
      '<p>Esta parte do sistema só abre para gerentes. Entre com o seu usuário e senha para continuar.</p>' +
      '<div class="aviso-pagina-acoes"><button type="button" class="sucesso" data-entrar>Entrar no Modo Gerenciador</button>' +
      '<a href="/" class="btn-voltar">← Voltar ao Painel</a></div></div>';
    main.insertAdjacentElement('beforebegin', aviso);
    aviso.querySelector('[data-entrar]').addEventListener('click', async () => {
      await consultarEstado();
      pedir();
    });
  }

  // ---------- janelas (dialog) ----------

  function criarDialogo() {
    if (dialogo) return dialogo;
    dialogo = document.createElement('dialog');
    dialogo.className = 'dialog-gerente';
    document.body.appendChild(dialogo);
    dialogo.addEventListener('cancel', () => fecharDialogo(false));
    return dialogo;
  }

  let resolverPedido = null;
  function fecharDialogo(resultado) {
    if (dialogo && dialogo.open) dialogo.close();
    if (resolverPedido) { resolverPedido(resultado); resolverPedido = null; }
  }

  // campos: [{ nome, rotulo, tipo: 'text'|'password', auto }]
  function montarFormulario(titulo, explicacao, campos, textoBotao, aoEnviar) {
    const d = criarDialogo();
    d.innerHTML =
      '<form method="dialog" class="form-gerente">' +
      '<h3>' + titulo + '</h3>' +
      '<p class="explica-gerente">' + explicacao + '</p>' +
      campos.map((c) =>
        '<label>' + c.rotulo +
        '<input type="' + (c.tipo || 'password') + '" name="' + c.nome + '" autocomplete="' + c.auto +
        '" maxlength="' + (c.max || 100) + '"' + (c.tipo === 'text' ? ' autocapitalize="off" spellcheck="false"' : '') + '></label>'
      ).join('') +
      '<p class="erro-gerente" role="alert"></p>' +
      '<div class="dialog-acoes">' +
      '<button type="submit" class="sucesso">' + textoBotao + '</button>' +
      '<button type="button" class="secundario" data-cancelar>Cancelar</button>' +
      '</div></form>';
    const form = d.querySelector('form');
    const erroEl = d.querySelector('.erro-gerente');
    d.querySelector('[data-cancelar]').addEventListener('click', () => fecharDialogo(false));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      erroEl.textContent = '';
      const valores = {};
      campos.forEach((c) => { valores[c.nome] = form.elements[c.nome].value; });
      const enviar = form.querySelector('button[type="submit"]');
      enviar.disabled = true;
      try {
        await aoEnviar(valores);
      } catch (err) {
        erroEl.textContent = err.message;
        const senha = form.querySelector('input[type="password"]');
        if (senha) { senha.value = ''; senha.focus(); }
      } finally {
        enviar.disabled = false;
      }
    });
    if (!d.open) d.showModal();
    const primeiro = form.querySelector('input');
    if (primeiro) primeiro.focus();
  }

  function telaPrimeiroAcesso() {
    montarFormulario(
      'Cadastrar o primeiro gerente',
      'Ainda não existe nenhum gerente no sistema. Cadastre o seu usuário: ' +
      'depois disso, só um gerente consegue cadastrar outro (no botão Usuários da barra do gerente, ao lado de Contatos).',
      [
        { nome: 'nome', rotulo: 'Seu nome', tipo: 'text', auto: 'name', max: 80 },
        { nome: 'login', rotulo: 'Usuário (para entrar; sem espaço)', tipo: 'text', auto: 'username', max: 40 },
        { nome: 'senha', rotulo: 'Senha (mínimo 4 caracteres)', auto: 'new-password' },
        { nome: 'confirma', rotulo: 'Repita a senha', auto: 'new-password' },
      ],
      'Cadastrar e entrar',
      async (v) => {
        if (v.senha !== v.confirma) throw new Error('As duas senhas não são iguais.');
        const d = await postar('primeiro-acesso', { nome: v.nome, login: v.login, senha: v.senha });
        temUsuarios = true;
        // Liga o modo ANTES de fechar: quem chamou pedir() recebe true.
        aplicar(true, d.usuario);
        fecharDialogo(true);
      }
    );
  }

  function telaEntrar() {
    montarFormulario(
      'Modo Gerenciador',
      'Entre com o seu usuário e senha de gerente. O modo desliga sozinho depois de ' +
      inatividadeMin + ' minutos sem uso, ou quando o navegador for fechado.',
      [
        { nome: 'login', rotulo: 'Usuário', tipo: 'text', auto: 'username', max: 40 },
        { nome: 'senha', rotulo: 'Senha', auto: 'current-password' },
      ],
      'Entrar',
      async (v) => {
        let d;
        try {
          d = await postar('entrar', { login: v.login, senha: v.senha });
        } catch (err) {
          if (err.codigo === 'SEM_USUARIOS') { temUsuarios = false; telaPrimeiroAcesso(); return; }
          throw err;
        }
        // Liga o modo ANTES de fechar: quem chamou pedir() recebe true.
        aplicar(true, d.usuario);
        fecharDialogo(true);
      }
    );
  }

  function telaLigado() {
    const d = criarDialogo();
    d.innerHTML =
      '<div class="form-gerente">' +
      '<h3>Modo Gerenciador ligado</h3>' +
      '<p class="explica-gerente">Você entrou como <strong>' + esc(usuario ? usuario.nome : '') +
      '</strong> (' + esc(usuario ? usuario.login : '') + '). O modo desliga sozinho depois de ' +
      inatividadeMin + ' minutos sem uso, ou quando o navegador for fechado. ' +
      'Se for sair de perto, desligue agora.</p>' +
      '<div class="dialog-acoes">' +
      '<button type="button" class="perigo" data-sair>Sair do Modo Gerenciador</button>' +
      '<button type="button" class="secundario" data-trocar>Trocar senha</button>' +
      '<button type="button" class="secundario" data-fechar>Fechar</button>' +
      '</div></div>';
    d.querySelector('[data-sair]').addEventListener('click', async () => {
      await sair();
      fecharDialogo(false);
    });
    d.querySelector('[data-trocar]').addEventListener('click', telaTrocarSenha);
    d.querySelector('[data-fechar]').addEventListener('click', () => fecharDialogo(true));
    if (!d.open) d.showModal();
  }

  function telaTrocarSenha() {
    montarFormulario(
      'Trocar a minha senha',
      'Confirme a sua senha atual e escolha a nova.',
      [
        { nome: 'atual', rotulo: 'Senha atual', auto: 'current-password' },
        { nome: 'nova', rotulo: 'Nova senha (mínimo 4 caracteres)', auto: 'new-password' },
        { nome: 'confirma', rotulo: 'Repita a nova senha', auto: 'new-password' },
      ],
      'Trocar senha',
      async (v) => {
        if (v.nova !== v.confirma) throw new Error('As duas senhas novas não são iguais.');
        await postar('trocar-senha', { atual: v.atual, nova: v.nova });
        fecharDialogo(true);
        alert('Senha trocada.');
      }
    );
  }

  // Abre a janela certa (primeiro acesso / entrar / ligado). Devolve uma
  // promessa que resolve true se, ao fechar, o modo estiver ligado.
  function pedir() {
    return new Promise((resolve) => {
      if (resolverPedido) resolverPedido(false);
      resolverPedido = (r) => resolve(!!r && ativo);
      if (ativo) telaLigado();
      else if (!temUsuarios) telaPrimeiroAcesso();
      else telaEntrar();
    });
  }

  window.Gerente = {
    ativo: () => ativo,
    usuario: () => usuario,
    pedir,
    sair,
    atualizar: consultarEstado,
    aplicarTravas,
    AVISO_TRAVA,
  };

  function iniciar() {
    montarBotao();
    montarFaixa();
    montarAvisoPagina();
    marcarLinks();
    aplicarTravas(document);
    consultarEstado();
    // Confere a cada minuto: se o prazo de inatividade venceu, tudo que é de
    // gerente volta a travar sozinho, sem precisar recarregar.
    setInterval(consultarEstado, 60 * 1000);
    // Voltou para esta aba depois de um tempo: confere na hora.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) consultarEstado();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
