// ============================================================
// Barra vermelha do topo: atalhos de criação + área de botões à direita
// ============================================================
//
// A barra do topo é copiada igual em todas as páginas; em vez de repetir os
// botões em cada uma, este arquivo monta a barra sozinho:
//
//   [ marca ]        [ + Nova OS ▾ ] [ + Item ] [ + Boleto ]        [ tema ] [ gerenciador ]
//    esquerda                        centro                             direita (.topo-direita)
//
// Mexeu aqui, muda em todas as páginas.
//
// Cada atalho só ABRE a tela de criação. Nada é gravado no banco até a
// pessoa começar a preencher — um clique sem querer não deixa registro vazio.
(function () {
  const OPCOES_OS = [
    { texto: 'OS (oficina)', href: '/ordens-servico.html?nova=1' },
    { texto: 'Venda balcão', href: '/venda.html' },
    { texto: 'Serviço externo', href: '/externa.html' },
    // Ficha de OS física (papel), para preencher à caneta. Abre o PDF.
    { texto: 'Imprimir ficha de OS', href: '/api/fichas/branco.pdf', novaAba: true, separado: true },
  ];

  // "+" desenhado em vez de digitado: o caractere "+" de texto fica sentado um
  // pouco abaixo do meio da linha em quase todas as fontes, e ficava torto
  // dentro do botão. O desenho centraliza exato.
  const ICONE_MAIS =
    '<svg class="atalho-mais" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">' +
    '<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const ICONE_SETA =
    '<svg class="atalho-seta" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">' +
    '<path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  // Área da direita da barra (tema, gerenciador...). Outros scripts do
  // cabeçalho (gerente.js) usam a mesma função, então tanto faz qual roda
  // primeiro: quem chegar antes cria, o outro reaproveita.
  window.areaDireitaTopo = function () {
    const header = document.querySelector('header');
    if (!header) return null;
    let area = header.querySelector('.topo-direita');
    if (!area) {
      area = criar('div', 'topo-direita');
      header.appendChild(area);
      // Explicação de como a mercadoria chega no estoque (à esquerda do tema).
      const fluxo = criar('a', 'btn-tema btn-fluxo');
      fluxo.href = '/fluxo.html';
      fluxo.title = 'Fluxo de mercadorias: como a peça chega no estoque';
      fluxo.innerHTML = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
        '<path d="M2 5.2 8 2l6 3.2v5.6L8 14l-6-3.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path d="M2 5.2 8 8.4l6-3.2M8 8.4V14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
        '<span class="rotulo-topo">Fluxo de mercadorias</span>';
      if (location.pathname === '/fluxo.html') fluxo.setAttribute('aria-current', 'page');
      area.appendChild(fluxo);
      const botaoTema = header.querySelector('#btnTema');
      if (botaoTema) area.appendChild(botaoTema);
    }
    return area;
  };

  function montar() {
    const header = document.querySelector('header');
    if (!header || header.querySelector('.atalhos-topo')) return;
    const direita = window.areaDireitaTopo();

    const nav = criar('nav', 'atalhos-topo');
    nav.setAttribute('aria-label', 'Atalhos de criação');

    // --- Nova OS / Venda balcão / Externo: um botão com menu ---
    const grupo = criar('div', 'atalho-grupo');
    const botaoOs = criar('button', 'atalho-topo');
    botaoOs.type = 'button';
    botaoOs.setAttribute('aria-haspopup', 'true');
    botaoOs.setAttribute('aria-expanded', 'false');
    botaoOs.innerHTML = ICONE_MAIS + '<span>Nova OS</span>' + ICONE_SETA;
    const menu = criar('div', 'atalho-menu oculto');
    menu.setAttribute('role', 'menu');
    OPCOES_OS.forEach((op) => {
      const a = criar('a', '', op.texto);
      a.href = op.href;
      if (op.novaAba) a.target = '_blank';
      if (op.separado) a.classList.add('atalho-separado');
      a.setAttribute('role', 'menuitem');
      menu.appendChild(a);
    });
    grupo.appendChild(botaoOs);
    grupo.appendChild(menu);

    function abrirMenu(abrir) {
      menu.classList.toggle('oculto', !abrir);
      botaoOs.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    }
    botaoOs.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirMenu(menu.classList.contains('oculto'));
    });
    document.addEventListener('click', (e) => {
      if (!grupo.contains(e.target)) abrirMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') abrirMenu(false);
    });

    // --- Novo item / Novo boleto: links diretos ---
    const item = criar('a', 'atalho-topo');
    item.href = '/itens.html?novo=1';
    item.innerHTML = ICONE_MAIS + '<span>Item</span>';
    item.title = 'Cadastrar novo item';

    const boleto = criar('a', 'atalho-topo');
    boleto.href = '/despesas.html?novo_boleto=1';
    boleto.innerHTML = ICONE_MAIS + '<span>Boleto</span>';
    boleto.title = 'Lançar novo boleto';

    nav.appendChild(grupo);
    nav.appendChild(item);
    nav.appendChild(boleto);

    // Os atalhos ficam no meio: entre a marca e a área da direita.
    header.insertBefore(nav, direita);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();

// Usado pelas páginas de destino: devolve true (uma vez só) se a página foi
// aberta por um atalho com ?parametro=1, e já limpa o parâmetro da barra de
// endereço — senão, apertar F5 abriria o formulário de novo sozinho.
window.abertoPorAtalho = function (parametro) {
  const params = new URLSearchParams(location.search);
  if (!params.has(parametro)) return false;
  params.delete(parametro);
  const resto = params.toString();
  history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + location.hash);
  return true;
};
