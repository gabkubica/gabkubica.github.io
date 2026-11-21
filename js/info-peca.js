// ============================================================
// Peças na OS, no serviço externo e na venda de balcão (2026-11-21)
// ============================================================
//   InfoPeca.linhaBusca(item)      -> na lista de busca: local, saldo e quem
//                                     conferiu por último
//   InfoPeca.codigo(itemId, codigo)-> o código da peça lançada vira botão que
//                                     abre a ficha dela
//   InfoPeca.local(texto, saldo)   -> "Local B-14 · Saldo 8" embaixo do nome
//   InfoPeca.abrir(itemId)         -> janela: local, saldo, conferência,
//                                     preços, garantia
//   InfoPeca.desconto(tabela, preco, editavel)
//                                  -> botão "%" ao lado do preço + selo
//                                     "−10% · tabela R$ 450,00"
// O desconto é calculado sobre o preço de TABELA (dois descontos não se
// somam) e gravado pelo próprio campo de preço da linha: o botão muda o valor
// e dispara o "change" que a página já usa para salvar.
(function () {
  const DESCONTOS = [5, 10, 20, 30];

  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
  function moeda(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function dataBr(v) {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }
  const r2 = (v) => Math.round(Number(v) * 100) / 100;

  // ---------- lista de busca ----------
  function linhaBusca(i) {
    const saldo = Number(i.estoque);
    const classeSaldo = saldo < 0 ? ' ip-neg' : saldo === 0 ? ' ip-zero' : '';
    const caminho = Number(i.a_caminho) ? ' <span class="ip-caminho">(+' + Number(i.a_caminho) + ' a caminho)</span>' : '';
    const conferido = i.data_conferencia
      ? 'Conferido em ' + dataBr(i.data_conferencia) + (i.conferente_nome ? ' por ' + esc(i.conferente_nome) : '')
      : 'Nunca conferido';
    return '<small class="ip-busca">' +
      '<span>Local <b>' + (i.localizacao ? esc(i.localizacao) : '—') + '</b></span>' +
      '<span class="ip-saldo' + classeSaldo + '">Saldo <b>' + saldo + '</b>' + caminho + '</span>' +
      '<span>' + conferido + '</span></small>';
  }

  // ---------- peça lançada: código que abre a ficha, local ----------
  function codigo(itemId, cod) {
    return '<button type="button" class="ip-codigo" data-info-peca="' + esc(itemId) + '" title="Ver local, saldo e conferência desta peça">' +
      esc(cod || 'ver peça') + '</button>';
  }
  function local(texto, saldo) {
    const temSaldo = saldo !== undefined && saldo !== null && saldo !== '';
    const n = Number(saldo);
    return '<small class="ip-local">Local <b>' + (texto ? esc(texto) : '—') + '</b>' +
      (temSaldo ? ' · Saldo <b class="' + (n <= 0 ? 'ip-saldo-zero' : '') + '">' + esc(saldo) + '</b>' : '') + '</small>';
  }

  // ---------- ficha da peça ----------
  let dlg = null;
  function montarDialogo() {
    dlg = document.createElement('dialog');
    dlg.className = 'dialog-tipos ip-dialogo';
    dlg.innerHTML = '<div id="ipConteudo"></div><div class="dialog-acoes">' +
      '<a class="botao-link secundario" id="ipAbrirItens" href="/itens.html">Abrir na tabela de Itens</a>' +
      '<button type="button" class="secundario" id="ipFechar">Fechar</button></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#ipFechar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  async function abrir(itemId) {
    if (!dlg) montarDialogo();
    const caixa = dlg.querySelector('#ipConteudo');
    caixa.innerHTML = '<div class="aviso-vazio">Carregando...</div>';
    dlg.showModal();
    try {
      const r = await fetch('/api/itens/' + encodeURIComponent(itemId), { cache: 'no-store' });
      const i = await r.json();
      if (!r.ok) throw new Error(i.erro || 'Peça não encontrada.');
      const saldo = Number(i.estoque);
      const garantia = i.garantia_meses ? (Number(i.garantia_meses) === 12 ? '1 ano' : i.garantia_meses + ' meses') : 'não informada';
      const campo = (rot, val, classe) => '<div class="ip-campo' + (classe ? ' ' + classe : '') + '"><span>' + rot + '</span><b>' + val + '</b></div>';
      caixa.innerHTML =
        '<h3 class="ip-titulo">' + esc(i.nome) + '</h3>' +
        '<p class="ip-sub">' + esc([i.codigo, i.marca, i.numero_interno ? 'etiqueta nº ' + String(i.numero_interno).padStart(6, '0') : ''].filter(Boolean).join(' · ')) + '</p>' +
        '<div class="ip-grade">' +
          campo('Local', i.localizacao ? esc(i.localizacao) : '—', 'ip-destaque') +
          campo('Saldo agora', saldo + (Number(i.a_caminho) ? ' <small>(+' + Number(i.a_caminho) + ' a caminho)</small>' : ''),
            'ip-destaque' + (saldo < 0 ? ' ip-neg' : saldo === 0 ? ' ip-zero' : '')) +
          campo('Última conferência', i.data_conferencia ? dataBr(i.data_conferencia) + (i.conferente_nome ? '<small>por ' + esc(i.conferente_nome) + '</small>' : '') : 'nunca conferida') +
          campo('Estoque mínimo', esc(i.estoque_minimo || 0)) +
          campo('Preço levar', moeda(i.preco)) +
          campo('Preço c/ instalação', moeda(i.preco_com_instalacao)) +
          campo('Garantia', garantia) +
        '</div>';
      dlg.querySelector('#ipAbrirItens').href = '/itens.html?f1=' + encodeURIComponent(i.codigo || i.nome);
    } catch (e) {
      caixa.innerHTML = '<div class="erro">' + esc(e.message) + '</div>';
    }
  }

  // ---------- desconto rápido ----------
  function desconto(tabela, preco, editavel) {
    const t = Number(tabela);
    const p = Number(preco);
    let selo = '';
    if (t > 0 && p < t - 0.004) {
      const pct = Math.round((1 - p / t) * 1000) / 10;
      selo = '<small class="ip-desc-selo">−' + String(pct).replace('.', ',') + '% · tabela ' + moeda(t) + '</small>';
    } else if (t > 0 && p > t + 0.004) {
      selo = '<small class="ip-desc-selo ip-acima">acima da tabela (' + moeda(t) + ')</small>';
    }
    const botao = editavel && t > 0
      ? '<button type="button" class="ip-desc-btn" data-tabela="' + t + '" title="Desconto rápido">%</button>'
      : '';
    return botao + selo;
  }

  let menu = null;
  let campoAlvo = null;
  function fecharMenu() { if (menu) menu.hidden = true; campoAlvo = null; }
  function abrirMenu(botao) {
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'ip-desc-menu';
      menu.hidden = true;
      document.body.appendChild(menu);
      menu.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-pct]');
        if (!b || !campoAlvo) return;
        let pct = b.dataset.pct;
        if (pct === 'outro') {
          const resp = prompt('Desconto em % (ex.: 15):');
          if (resp === null) return;
          pct = Number(String(resp).replace(',', '.').replace('%', '').trim());
          if (!Number.isFinite(pct) || pct < 0 || pct >= 100) { alert('Digite um número de 0 a 99.'); return; }
        }
        const tabela = Number(menu.dataset.tabela);
        const novo = r2(tabela * (1 - Number(pct) / 100));
        const campo = campoAlvo;
        fecharMenu();
        campo.value = novo.toFixed(2);
        campo.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    campoAlvo = botao.closest('td').querySelector('.in-preco');
    if (!campoAlvo) return;
    const tabela = Number(botao.dataset.tabela);
    menu.dataset.tabela = tabela;
    menu.innerHTML = '<div class="ip-desc-tit">Desconto sobre a tabela (' + moeda(tabela) + ')</div>' +
      DESCONTOS.map((d) => '<button type="button" data-pct="' + d + '">−' + d + '%<small>' + moeda(r2(tabela * (1 - d / 100))) + '</small></button>').join('') +
      '<button type="button" data-pct="outro">Outro %</button>' +
      '<button type="button" data-pct="0" class="ip-desc-volta">Sem desconto<small>' + moeda(tabela) + '</small></button>';
    menu.hidden = false;
    const r = botao.getBoundingClientRect();
    const larg = menu.offsetWidth;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - larg - 8, r.left + window.scrollX - larg / 2 + r.width / 2)) + 'px';
    menu.style.top = (r.bottom + window.scrollY + 6) + 'px';
  }

  document.addEventListener('click', (e) => {
    const cod = e.target.closest('[data-info-peca]');
    if (cod) { e.preventDefault(); abrir(cod.dataset.infoPeca); return; }
    const bd = e.target.closest('.ip-desc-btn');
    if (bd) { e.preventDefault(); abrirMenu(bd); return; }
    if (menu && !menu.hidden && !e.target.closest('.ip-desc-menu')) fecharMenu();
  });
  window.addEventListener('scroll', fecharMenu, { passive: true });

  window.InfoPeca = { linhaBusca, codigo, local, abrir, desconto };
})();
