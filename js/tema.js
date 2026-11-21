(function () {
  const chave = 'tema';

  function preferido() {
    let salvo = null;
    try { salvo = localStorage.getItem(chave); } catch (e) { /* navegação privada */ }
    if (salvo === 'escuro' || salvo === 'claro') return salvo;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'escuro'
      : 'claro';
  }

  document.documentElement.dataset.tema = preferido();

  // Impressão / PDF sempre no tema claro (papel branco); depois volta.
  let temaAntesDeImprimir = null;
  window.addEventListener('beforeprint', () => {
    temaAntesDeImprimir = document.documentElement.dataset.tema;
    document.documentElement.dataset.tema = 'claro';
  });
  window.addEventListener('afterprint', () => {
    if (temaAntesDeImprimir) document.documentElement.dataset.tema = temaAntesDeImprimir;
    temaAntesDeImprimir = null;
  });

  // Ícone + texto. No celular a barra fica apertada e o CSS esconde o texto,
  // deixando só o ícone (lua = ir para o escuro, sol = ir para o claro).
  const ICONE_LUA =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor"/></svg>';
  const ICONE_SOL =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/>' +
    '<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  function atualizarBotao(botao) {
    const escuro = document.documentElement.dataset.tema === 'escuro';
    const texto = escuro ? 'Modo claro' : 'Modo escuro';
    botao.innerHTML = (escuro ? ICONE_SOL : ICONE_LUA) + '<span class="rotulo-topo">' + texto + '</span>';
    botao.title = texto;
    botao.setAttribute('aria-label', texto);
  }

  // Mensagens flutuantes (#mensagens, embaixo da tela): um toque fecha.
  // Botões e links dentro da mensagem continuam funcionando normalmente.
  document.addEventListener('click', (e) => {
    const msg = e.target.closest && e.target.closest('#mensagens > div');
    if (msg && !e.target.closest('button, a, input, select')) msg.remove();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const botao = document.getElementById('btnTema');
    if (!botao) return;
    atualizarBotao(botao);
    botao.addEventListener('click', () => {
      const atual = document.documentElement.dataset.tema;
      const novo = atual === 'escuro' ? 'claro' : 'escuro';
      try { localStorage.setItem(chave, novo); } catch (e) { /* segue só nesta página */ }
      document.documentElement.dataset.tema = novo;
      atualizarBotao(botao);
    });
  });
})();
