// ============================================================
// Aviso ANTES de deixar o estoque de um item negativo
// ============================================================
//
// Usado ao lançar peça (ou aumentar a quantidade) na OS, no serviço externo e
// na venda de balcão. O sistema continua PERMITINDO — às vezes a peça está na
// prateleira mas não foi cadastrada —, só que agora pergunta antes, em vez de
// avisar depois com uma mensagem que some sozinha.
//
// Uso:  if (!(await EstoqueAviso.confirmar(itemId, quantidadeQueVaiSair))) return;
(function () {
  async function confirmar(itemId, sai) {
    const qtd = Number(sai);
    if (!itemId || !(qtd > 0)) return true;
    let item;
    try {
      // Consulta o estoque na hora (outra pessoa pode ter vendido o mesmo item
      // há pouco); sem conexão, deixa seguir — o servidor avisa depois.
      const r = await fetch('/api/itens/' + encodeURIComponent(itemId), { cache: 'no-store' });
      if (!r.ok) return true;
      item = await r.json();
    } catch (e) {
      return true;
    }
    const estoque = Number(item.estoque);
    if (!Number.isFinite(estoque)) return true;
    const depois = estoque - qtd;
    if (depois >= 0) return true;
    return window.confirm(
      'ATENÇÃO: ESTOQUE INSUFICIENTE\n\n' +
      item.codigo + ' — ' + item.nome + '\n\n' +
      'No estoque: ' + estoque + '\n' +
      'Vai sair: ' + qtd + '\n' +
      'O saldo vai ficar: ' + depois + ' (NEGATIVO)\n\n' +
      'Se a peça está na prateleira mas não foi cadastrada, pode lançar e depois ' +
      'corrija o estoque do item na tabela de Itens.\n\n' +
      'Lançar mesmo assim?'
    );
  }

  window.EstoqueAviso = { confirmar };
})();
