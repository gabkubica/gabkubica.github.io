// ============================================================
// Exportar relatórios: PDF (pela impressão do navegador) e planilha (Excel)
// ============================================================
// Exportar.pdf('Relatorio de boletos 2026-11')
//   Abre a janela de imprimir; ali, em "Destino", escolha "Salvar como PDF".
//   O nome sugerido do arquivo é o texto passado (o navegador usa o título).
// Exportar.planilha('boletos-2026-11', [{ titulo, colunas: [...], linhas: [[...], ...] }, ...])
//   Baixa um .csv que o Excel abre direto (separador ";", vírgula nos
//   números, acentos certos). Várias seções saem uma embaixo da outra.
(function () {
  function celula(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
    const s = String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function planilha(nome, secoes) {
    const linhas = [];
    secoes.forEach((s, i) => {
      if (i) linhas.push('');
      if (s.titulo) linhas.push(celula(s.titulo));
      if (s.colunas) linhas.push(s.colunas.map(celula).join(';'));
      for (const l of s.linhas || []) linhas.push(l.map(celula).join(';'));
    });
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome.replace(/[\\/:*?"<>|]+/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function pdf(nome) {
    const titulo = document.title;
    if (nome) document.title = nome;
    window.print();
    setTimeout(() => { document.title = titulo; }, 500);
  }

  window.Exportar = { pdf, planilha };
})();
