// ============================================================
// Listas no celular (2026-11-17, pedido do Gabriel: "melhore a visualização
// no celular")
// ============================================================
//
// No celular (até 700px) as tabelas viram cartões: o cabeçalho some e cada
// linha vira um bloco. Sem o cabeçalho, sobravam só valores soltos, um por
// linha ("R$ 22,00", "R$ 40,00", "Z-98"... qual é qual?), e cada cartão
// ficava enorme.
//
// Este script copia o nome da coluna (o <th>) para cada célula, em
// data-label, e marca a tabela com "cel-cartoes". O CSS mostra o nome
// pequeno em cima do valor e põe as células em 2 colunas; textos longos,
// campos e botões ocupam a linha inteira.
//
// Só roda no celular (no computador não faz nada). Tabelas que já têm um
// jeito próprio de aparecer no celular ficam de fora: as que já têm
// data-label/data-rot nas células, e as classes da lista PULAR.
(function () {
  const PULAR = '.cf-tabela, .patio-tabela, .er-tabela, .sem-cartoes';
  const celular = window.matchMedia('(max-width: 700px)');
  const feitas = new WeakSet();
  let agendado = false;

  function nomeDaColuna(th) {
    return (th.textContent || '').replace(/[▲▼↑↓⇅⇵]/g, '').replace(/\s+/g, ' ').trim();
  }

  function nomesDasColunas(tabela) {
    const cab = tabela.tHead;
    if (!cab || !cab.rows.length) return null;
    // Cabeçalho em mais de uma linha (ex.: Comissões: "Balcão" em cima de
    // "Vendido | % | Comissão"): monta a grade e junta os nomes, para virar
    // "Balcão · Vendido".
    const grade = [];
    Array.from(cab.rows).forEach((tr, l) => {
      grade[l] = grade[l] || [];
      let c = 0;
      for (const th of tr.cells) {
        while (grade[l][c] !== undefined) c++;
        const nome = nomeDaColuna(th);
        for (let dl = 0; dl < (th.rowSpan || 1); dl++) {
          grade[l + dl] = grade[l + dl] || [];
          for (let dc = 0; dc < (th.colSpan || 1); dc++) grade[l + dl][c + dc] = nome;
        }
        c += th.colSpan || 1;
      }
    });
    const colunas = Math.max(...grade.map((g) => g.length));
    const nomes = [];
    for (let c = 0; c < colunas; c++) {
      const partes = [];
      grade.forEach((g) => { const n = g[c]; if (n && partes[partes.length - 1] !== n) partes.push(n); });
      nomes.push(partes.join(' · '));
    }
    return nomes;
  }

  function celulaLarga(td) {
    if ((td.colSpan || 1) > 1) return true;
    if (td.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=number]), select, textarea')) return true;
    if (td.querySelectorAll('button, a.btn, .btn-mini').length > 1) return true;
    return (td.textContent || '').trim().length > 24;
  }

  function prepararTabela(tabela) {
    if (tabela.matches(PULAR) || tabela.closest('.sem-cartoes')) return;
    if (!tabela.classList.contains('cel-cartoes')) {
      // Tabela pensada à mão para o celular: não mexe.
      if (tabela.querySelector('td[data-label], td[data-rot]')) return;
      const nomes = nomesDasColunas(tabela);
      if (!nomes) return;
      tabela.classList.add('cel-cartoes');
      tabela._celNomes = nomes;
    }
    const nomes = tabela._celNomes;
    for (const corpo of tabela.tBodies) {
      for (const tr of corpo.rows) {
        if (feitas.has(tr)) continue;
        feitas.add(tr);
        let col = 0;
        let primeira = true;
        for (const td of tr.cells) {
          const nome = nomes[col] || '';
          col += td.colSpan || 1;
          if (td.tagName !== 'TD') continue;
          // 'Ações' em cima dos botões não diz nada: fica sem nome.
          if (nome && !/^a[çc][õo]es$/i.test(nome) && !td.hasAttribute('data-label')) td.setAttribute('data-label', nome);
          // Sem nome de coluna: largo, a não ser que seja um botão só (ex.: "Abrir").
          const umBotao = !nome && td.children.length === 1 && td.firstElementChild.matches('button, a');
          if ((!nome && !umBotao) || celulaLarga(td)) td.classList.add('cel-larga');
          if (primeira && getComputedStyle(td).display !== 'none') { td.classList.add('cel-titulo'); primeira = false; }
        }
      }
    }
  }

  function prepararTudo() {
    agendado = false;
    if (!celular.matches) return;
    document.querySelectorAll('table').forEach(prepararTabela);
  }

  function agendar() {
    if (agendado || !celular.matches) return;
    agendado = true;
    requestAnimationFrame(prepararTudo);
  }

  document.addEventListener('DOMContentLoaded', () => {
    prepararTudo();
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
  });
  // Girou o tablet / mudou o tamanho da janela para celular.
  if (celular.addEventListener) celular.addEventListener('change', agendar);
})();
