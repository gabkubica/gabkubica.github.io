// ============================================================
// Cliente e carro dentro da OS (usado pela OS e pelo serviço externo; o
// campo de cliente, 1b, também pela venda de balcão, boletos e Nova OS)
// ============================================================
//
// 1) ClienteCarro.escolherCliente(opcoes)
//    Janela para escolher o cliente da OS: busca por nome, CPF/CNPJ ou
//    telefone (acha qualquer cliente, não só os 200 primeiros), cadastrar um
//    cliente novo ali mesmo, ou (no externo) usar um nome avulso.
//    Devolve uma promessa com:
//      { cliente_id }                 -> cliente escolhido ou recém-cadastrado
//      { cliente_id: null }           -> tirar o cliente da OS
//      { cliente_id: null, cliente_nome } -> nome avulso (só externo)
//      null                           -> pessoa cancelou
//
// 2) ClienteCarro.mostrarVinculo(os, container, aoMudar)
//    Quadro "o carro passou a ser deste cliente" com o botão Desfazer
//    vínculo (e Vincular de novo). aoMudar(osAtualizada) é chamado depois.
(function () {
  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  async function lerJson(resp) {
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.erro || 'Erro na operação.');
    return dados;
  }

  // ---------------------------------------------------------------
  // 1) Escolher cliente
  // ---------------------------------------------------------------
  let dialogo = null;
  let resolver = null;

  function montarDialogo() {
    if (dialogo) return dialogo;
    dialogo = document.createElement('dialog');
    dialogo.className = 'dialog-tipos dialog-escolher-cliente';
    dialogo.innerHTML =
      '<h3>Cliente da OS</h3>' +
      '<div data-etapa="buscar">' +
        '<label class="ec-rotulo">Buscar cliente cadastrado' +
          '<input type="search" class="ec-busca" placeholder="Nome, CPF/CNPJ ou telefone" autocomplete="off"></label>' +
        '<div class="ec-resultados" role="listbox" aria-label="Clientes encontrados"></div>' +
        '<div class="ec-acoes-extra">' +
          '<button type="button" class="sucesso" data-ec="novo">+ Cadastrar cliente novo</button>' +
          '<button type="button" class="secundario" data-ec="avulso">Nome avulso (sem cadastro)</button>' +
          '<button type="button" class="secundario" data-ec="remover">Tirar o cliente desta OS</button>' +
        '</div>' +
      '</div>' +
      '<div data-etapa="novo" hidden>' +
        '<p class="ec-dica">O cliente é cadastrado e já fica nesta OS.</p>' +
        '<div class="dialog-form">' +
          '<div><label>Nome / Razão social *<input type="text" data-campo="nome" maxlength="200" autocomplete="off"></label></div>' +
          '<div><label>Telefone<input type="text" data-campo="telefone" maxlength="40" autocomplete="off"></label></div>' +
          '<div><label>CPF/CNPJ<input type="text" data-campo="doc" maxlength="20" autocomplete="off"></label></div>' +
        '</div>' +
        '<div class="dialog-acoes"><button type="button" class="sucesso" data-ec="salvar-novo">Cadastrar e usar nesta OS</button>' +
        '<button type="button" class="secundario" data-ec="voltar">Voltar</button></div>' +
      '</div>' +
      '<div data-etapa="avulso" hidden>' +
        '<p class="ec-dica">Para quem não precisa de cadastro. O nome fica só nesta OS.</p>' +
        '<div class="dialog-form"><div><label>Nome *<input type="text" data-campo="avulso" maxlength="300" autocomplete="off"></label></div></div>' +
        '<div class="dialog-acoes"><button type="button" class="sucesso" data-ec="salvar-avulso">Usar este nome</button>' +
        '<button type="button" class="secundario" data-ec="voltar">Voltar</button></div>' +
      '</div>' +
      '<p class="erro-gerente ec-erro" role="alert"></p>' +
      '<div class="dialog-acoes" data-rodape><button type="button" class="secundario" data-ec="fechar">Fechar</button></div>';
    document.body.appendChild(dialogo);

    const busca = dialogo.querySelector('.ec-busca');
    let espera = null;
    busca.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(() => buscar(busca.value), 250);
    });
    busca.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const primeiro = dialogo.querySelector('.ec-cliente');
        if (primeiro) primeiro.click();
      }
    });
    dialogo.addEventListener('click', onClique);
    dialogo.addEventListener('cancel', () => fechar(null));
    return dialogo;
  }

  function etapa(nome) {
    dialogo.querySelectorAll('[data-etapa]').forEach((el) => { el.hidden = el.dataset.etapa !== nome; });
    dialogo.querySelector('[data-rodape]').hidden = nome !== 'buscar';
    dialogo.querySelector('.ec-erro').textContent = '';
    const foco = dialogo.querySelector('[data-etapa="' + nome + '"] input');
    if (foco) foco.focus();
  }

  let buscaAtual = 0;
  async function buscar(texto) {
    const alvo = dialogo.querySelector('.ec-resultados');
    const q = String(texto || '').trim();
    const minha = ++buscaAtual;
    let lista = [];
    try {
      lista = await lerJson(await fetch('/api/clientes' + (q ? '?q=' + encodeURIComponent(q) : '')));
    } catch (e) {
      alvo.innerHTML = '<p class="aviso-vazio">Falha ao buscar clientes.</p>';
      return;
    }
    if (minha !== buscaAtual) return; // chegou resposta de uma busca antiga
    if (!lista.length) {
      alvo.innerHTML = '<p class="aviso-vazio">Nenhum cliente encontrado' + (q ? ' para "' + esc(q) + '"' : '') +
        '. Use "+ Cadastrar cliente novo".</p>';
      return;
    }
    const limite = q ? 50 : 200;
    alvo.innerHTML = lista.map((c) =>
      '<button type="button" class="ec-cliente" role="option" data-id="' + c.id + '">' +
        '<strong>' + esc(c.nome_razao_social) + '</strong>' +
        '<span>' + [c.telefone, c.cpf_cnpj].filter(Boolean).map(esc).join(' · ') + '</span>' +
      '</button>'
    ).join('') + (lista.length >= limite ? '<p class="ec-dica">Mostrando os primeiros ' + limite + '. Digite para refinar.</p>' : '');
  }

  async function onClique(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const erroEl = dialogo.querySelector('.ec-erro');
    if (b.classList.contains('ec-cliente')) {
      return fechar({ cliente_id: Number(b.dataset.id), nome: b.querySelector('strong').textContent });
    }
    const acao = b.dataset.ec;
    if (acao === 'fechar') return fechar(null);
    if (acao === 'novo') return etapa('novo');
    if (acao === 'avulso') return etapa('avulso');
    if (acao === 'voltar') return etapa('buscar');
    if (acao === 'remover') return fechar({ cliente_id: null });
    if (acao === 'salvar-avulso') {
      const nome = dialogo.querySelector('[data-campo="avulso"]').value.trim();
      if (!nome) { erroEl.textContent = 'Informe o nome.'; return; }
      return fechar({ cliente_id: null, cliente_nome: nome });
    }
    if (acao === 'salvar-novo') {
      const nome = dialogo.querySelector('[data-campo="nome"]').value.trim();
      if (!nome) { erroEl.textContent = 'Informe o nome do cliente.'; return; }
      b.disabled = true;
      try {
        const novo = await lerJson(await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome_razao_social: nome,
            telefone: dialogo.querySelector('[data-campo="telefone"]').value.trim(),
            cpf_cnpj: dialogo.querySelector('[data-campo="doc"]').value.trim(),
          }),
        }));
        fechar({ cliente_id: novo.id, nome: novo.nome_razao_social, novo: true });
      } catch (err) {
        erroEl.textContent = err.message;
      } finally {
        b.disabled = false;
      }
    }
  }

  function fechar(resultado) {
    if (dialogo && dialogo.open) dialogo.close();
    if (resolver) { const r = resolver; resolver = null; r(resultado); }
  }

  // Textos que mudam conforme a tela (OS, venda, boleto...).
  function ajustarTextos(o) {
    const onde = o.onde || 'nesta OS';
    dialogo.querySelector('h3').textContent = o.titulo || 'Cliente da OS';
    dialogo.querySelector('[data-etapa="novo"] .ec-dica').textContent = 'O cliente é cadastrado e já fica ' + onde + '.';
    dialogo.querySelector('[data-ec="salvar-novo"]').textContent = 'Cadastrar e usar ' + onde;
    dialogo.querySelector('[data-ec="remover"]').textContent = 'Tirar o cliente ' + onde.replace(/^n/, 'd');
    dialogo.querySelector('[data-etapa="avulso"] .ec-dica').textContent =
      'Para quem não precisa de cadastro. O nome fica só ' + onde + '.';
  }

  function escolherCliente(opcoes) {
    const o = opcoes || {};
    montarDialogo();
    ajustarTextos(o);
    dialogo.querySelector('[data-ec="avulso"]').hidden = !o.permitirAvulso;
    dialogo.querySelector('[data-ec="remover"]').hidden = !o.temCliente;
    dialogo.querySelectorAll('input').forEach((i) => { i.value = ''; });
    dialogo.querySelector('.ec-resultados').innerHTML = '';
    etapa('buscar');
    dialogo.showModal();
    dialogo.querySelector('.ec-busca').focus();
    buscar('');
    return new Promise((res) => {
      if (resolver) resolver(null);
      resolver = res;
    });
  }

  // ---------------------------------------------------------------
  // 1b) Campo "cliente" para formulários (venda, boleto, cadastro de carro)
  // ---------------------------------------------------------------
  // Mostra o nome escolhido e um botão Escolher/Trocar que abre a busca
  // acima. Substitui as listas (select) com todos os clientes, que só
  // traziam os 200 primeiros em ordem alfabética: com a base real, quem
  // viesse depois (ex.: nomes com "M" em diante) nem aparecia para escolher.
  //   const campo = ClienteCarro.campoCliente(elemento, {
  //     titulo, onde, vazio,          // textos
  //     aoAvulso(nome),               // se informado, permite "nome avulso"
  //     aoMudar(id),                  // depois de escolher/trocar/tirar
  //   });
  //   campo.valor()  campo.definir(id, nome)  campo.habilitar(sim)
  function campoCliente(container, opcoes) {
    const o = opcoes || {};
    let id = null;
    let nome = '';
    container.classList.add('campo-cliente');
    container.innerHTML =
      '<span class="campo-cliente-nome"></span>' +
      '<button type="button" class="secundario campo-cliente-btn"></button>';
    const span = container.querySelector('.campo-cliente-nome');
    const botao = container.querySelector('button');

    function pintar() {
      span.textContent = id ? nome : (o.vazio || '— sem cliente —');
      span.classList.toggle('vazio', !id);
      botao.textContent = id ? 'Trocar' : 'Escolher';
    }
    function definir(novoId, novoNome) {
      id = novoId ? Number(novoId) : null;
      nome = id ? (novoNome || '') : '';
      pintar();
    }

    botao.addEventListener('click', async () => {
      const r = await escolherCliente({
        titulo: o.titulo, onde: o.onde, permitirAvulso: !!o.aoAvulso, temCliente: !!id,
      });
      if (!r) return;
      if (!r.cliente_id && r.cliente_nome) {
        definir(null);
        o.aoAvulso(r.cliente_nome);
      } else {
        definir(r.cliente_id, r.nome);
      }
      if (o.aoMudar) o.aoMudar(id);
    });

    pintar();
    return {
      valor: () => id,
      definir,
      habilitar(sim) { botao.hidden = !sim; },
    };
  }

  // ---------------------------------------------------------------
  // 2) Quadro do vínculo carro -> cliente
  // ---------------------------------------------------------------
  function mostrarVinculo(os, container, aoMudar) {
    if (!container) return;
    const placa = os.vinculo_placa || os.placa;
    let html = '';
    if (os.vinculo_status === 'vinculado') {
      html =
        '<div class="vinculo-carro vinculado">' +
          '<div class="vinculo-texto">🔗 O carro <strong>' + esc(placa) + '</strong> foi vinculado a <strong>' +
            esc(os.cliente_nome || 'este cliente') + '</strong> por esta OS' +
            ' <span class="vinculo-antes">(antes: ' + (os.vinculo_dono_anterior_nome ? esc(os.vinculo_dono_anterior_nome) : 'sem dono') + ')</span>.' +
            '<div class="vinculo-dica">O carro não é deste cliente (ex.: oficina parceira que terceiriza o serviço)? Desfaça o vínculo — a OS continua com o cliente.</div>' +
          '</div>' +
          '<button type="button" class="secundario" data-vinculo="desfazer">Desfazer vínculo</button>' +
        '</div>';
    } else if (os.vinculo_status === 'desfeito') {
      html =
        '<div class="vinculo-carro desfeito">' +
          '<div class="vinculo-texto">Vínculo desfeito: o carro <strong>' + esc(placa) + '</strong> continua ' +
            (os.carro_cliente_nome ? 'de <strong>' + esc(os.carro_cliente_nome) + '</strong>' : '<strong>sem dono</strong> no cadastro') +
            '. O cliente desta OS segue sendo ' + esc(os.cliente_nome || '—') + '.</div>' +
          '<button type="button" class="secundario" data-vinculo="refazer">Vincular de novo</button>' +
        '</div>';
    } else if (os.placa && os.carro_cliente_id && os.cliente_id && os.carro_cliente_id !== os.cliente_id) {
      // Ex.: OS antiga, de antes do vínculo automático, com dono diferente.
      html =
        '<div class="vinculo-carro desfeito">' +
          '<div class="vinculo-texto">O carro <strong>' + esc(os.placa) + '</strong> está cadastrado em nome de <strong>' +
            esc(os.carro_cliente_nome) + '</strong>.</div>' +
          '<button type="button" class="secundario" data-vinculo="refazer">Passar o carro para ' + esc(os.cliente_nome || 'este cliente') + '</button>' +
        '</div>';
    }
    container.innerHTML = html;
    const botao = container.querySelector('[data-vinculo]');
    if (!botao) return;
    botao.addEventListener('click', async () => {
      const desfazer = botao.dataset.vinculo === 'desfazer';
      botao.disabled = true;
      try {
        const osNova = await lerJson(await fetch('/api/ordens-servico/' + os.id + (desfazer ? '/desfazer-vinculo' : '/refazer-vinculo'), { method: 'POST' }));
        if (aoMudar) aoMudar(osNova, desfazer ? 'Vínculo desfeito: o carro voltou para o dono anterior.' : 'Carro vinculado ao cliente.');
      } catch (err) {
        if (aoMudar) aoMudar(null, err.message);
        botao.disabled = false;
      }
    });
  }

  window.ClienteCarro = { escolherCliente, campoCliente, mostrarVinculo };
})();
