// query.js - Utilitário para CONSULTAR e DELETAR do banco de dados
const Database = require('better-sqlite3');
const readline = require('readline');
const db = new Database('conarte.db');

// Enable foreign keys
db.pragma('journal_mode = wal');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const prompt = (question) => new Promise(resolve => rl.question(question, resolve));

const args = process.argv.slice(2);

async function executarQuery(query) {
  try {
    console.log(`\n📊 Executando: ${query}\n`);
    const stmt = db.prepare(query);
    const results = stmt.all();
    
    if (results.length === 0) {
      console.log('Nenhum resultado encontrado.\n');
    } else {
      console.table(results);
      console.log(`\n✅ ${results.length} registro(s) encontrado(s)\n`);
    }
  } catch (err) {
    console.error('❌ Erro ao executar query:', err.message);
  }
}

async function main() {
  // Se houver argumentos, executa a query direto
  if (args.length > 0) {
    const query = args.join(' ');
    await executarQuery(query);
    db.close();
    return;
  }

  // Sem argumentos: mostrar menu interativo com loop
  let continuar = true;
  
  while (continuar) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 GERENCIADOR DE BANCO DE DADOS');
    console.log('='.repeat(80) + '\n');

    console.log('Escolha uma opção:\n');
    console.log('1️⃣  Consultar clientes');
    console.log('2️⃣  Consultar serviços');
    console.log('3️⃣  Deletar cliente');
    console.log('4️⃣  Deletar serviço');
    console.log('5️⃣  Ver comandos disponíveis');
    console.log('0️⃣  Sair\n');

    const choice = await prompt('📌 Digite sua opção (0-5): ');

    switch (choice) {
      case '1':
        await executarQuery('SELECT * FROM clientes;');
        break;
      case '2':
        await executarQuery('SELECT * FROM servicos;');
        break;
      case '3':
        await deletarCliente();
        break;
      case '4':
        await deletarServico();
        break;
      case '5':
        await mostrarComandos();
        break;
      case '0':
        console.log('\n✅ Encerrando.\n');
        continuar = false;
        break;
      default:
        console.log('\n⚠️  Opção inválida. Digite um número de 0 a 5.\n');
        // Loop continua, retorna ao menu
        break;
    }
  }

  rl.close();
  db.close();
}

async function deletarCliente() {
  console.log('\nEscolha como identificar o cliente:\n');
  console.log('1. Por TELEFONE');
  console.log('2. Por CPF/CNPJ');
  console.log('0. Voltar ao menu\n');

  const tipo = await prompt('📌 Digite (0, 1 ou 2): ');

  if (tipo === '0') {
    return;
  }

  let cliente;
  let identificador;

  if (tipo === '1') {
    identificador = await prompt('\n📱 Digite o TELEFONE: ');
    cliente = db.prepare('SELECT * FROM clientes WHERE telefone = ?').get(identificador);
  } else if (tipo === '2') {
    identificador = await prompt('\n🆔 Digite o CPF/CNPJ: ');
    cliente = db.prepare('SELECT * FROM clientes WHERE cpf_cnpj = ?').get(identificador);
  } else {
    console.log('\n⚠️  Opção inválida. Digite 0, 1 ou 2.\n');
    return;
  }

  if (!cliente) {
    console.log('\n❌ Cliente não encontrado.\n');
    return;
  }

  console.log('\n📋 Cliente encontrado:');
  console.table([cliente]);

  const confirma = await prompt('\n⚠️  Deletar este cliente? (s/n): ');

  if (confirma.toLowerCase() === 's') {
    try {
      db.prepare(`DELETE FROM clientes WHERE ${tipo === '1' ? 'telefone' : 'cpf_cnpj'} = ?`).run(identificador);
      console.log('\n✅ Cliente deletado com sucesso.\n');
    } catch (err) {
      console.error('\n❌ Erro ao deletar:', err.message, '\n');
    }
  } else {
    console.log('\n❌ Cancelado.\n');
  }
}

async function deletarServico() {
  console.log('\nEscolha como deletar:\n');
  console.log('1. Por ID do serviço');
  console.log('2. Todos os serviços de um cliente');
  console.log('0. Voltar ao menu\n');

  const tipo = await prompt('📌 Digite (0, 1 ou 2): ');

  if (tipo === '0') {
    return;
  }

  if (tipo === '1') {
    const id = await prompt('\n🆔 Digite o ID do serviço: ');
    const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(id);

    if (!servico) {
      console.log('\n❌ Serviço não encontrado.\n');
      return;
    }

    console.log('\n📋 Serviço encontrado:');
    console.table([servico]);

    const confirma = await prompt('\n⚠️  Deletar este serviço? (s/n): ');

    if (confirma.toLowerCase() === 's') {
      try {
        db.prepare('DELETE FROM servicos WHERE id = ?').run(id);
        console.log('\n✅ Serviço deletado com sucesso.\n');
      } catch (err) {
        console.error('\n❌ Erro ao deletar:', err.message, '\n');
      }
    } else {
      console.log('\n❌ Cancelado.\n');
    }
  } else if (tipo === '2') {
    const cpfCnpj = await prompt('\n🆔 Digite o CPF/CNPJ do cliente: ');
    const cliente = db.prepare('SELECT * FROM clientes WHERE cpf_cnpj = ?').get(cpfCnpj);

    if (!cliente) {
      console.log('\n❌ Cliente não encontrado.\n');
      return;
    }

    const servicos = db.prepare('SELECT * FROM servicos WHERE cpf_cnpj_cliente = ?').all(cpfCnpj);

    if (servicos.length === 0) {
      console.log('\n❌ Este cliente não tem serviços registrados.\n');
      return;
    }

    console.log(`\n📋 Serviços encontrados (${servicos.length}):`);
    console.table(servicos);

    const confirma = await prompt('\n⚠️  Deletar TODOS os serviços deste cliente? (s/n): ');

    if (confirma.toLowerCase() === 's') {
      try {
        db.prepare('DELETE FROM servicos WHERE cpf_cnpj_cliente = ?').run(cpfCnpj);
        console.log(`\n✅ ${servicos.length} serviço(s) deletado(s).\n`);
      } catch (err) {
        console.error('\n❌ Erro ao deletar:', err.message, '\n');
      }
    } else {
      console.log('\n❌ Cancelado.\n');
    }
  } else {
    console.log('\n⚠️  Opção inválida. Digite 0, 1 ou 2.\n');
  }
}

async function mostrarComandos() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 COMANDOS DISPONÍVEIS (linha de comando):');
  console.log('='.repeat(80) + '\n');

  const commands = [
    {
      title: '🛢️  Ver todos os CLIENTES',
      cmd: 'node query.js SELECT * FROM clientes;'
    },
    {
      title: '📦 Ver todos os SERVIÇOS',
      cmd: 'node query.js SELECT * FROM servicos;'
    },
    {
      title: '⏳ Ver serviços PENDENTES / EM ANDAMENTO',
      cmd: "node query.js SELECT * FROM servicos WHERE status IN ('pendente', 'em_andamento');"
    },
    {
      title: '✅ Ver serviços CONCLUÍDOS',
      cmd: "node query.js SELECT * FROM servicos WHERE status = 'concluido';"
    },
    {
      title: '💳 Ver serviços AGUARDANDO PAGAMENTO',
      cmd: "node query.js SELECT * FROM servicos WHERE status = 'aguardando_pagamento';"
    },
    {
      title: '👤 Ver cliente ESPECÍFICO',
      cmd: "node query.js SELECT * FROM clientes WHERE nome_empresa LIKE '%Empresa%';"
    },
    {
      title: '📊 CONTAR total de clientes',
      cmd: 'node query.js SELECT COUNT(*) as total_clientes FROM clientes;'
    },
    {
      title: '📊 CONTAR total de serviços',
      cmd: 'node query.js SELECT COUNT(*) as total_servicos FROM servicos;'
    },
    {
      title: '🔗 Ver serviços de um CLIENTE específico',
      cmd: "node query.js SELECT s.* FROM servicos s INNER JOIN clientes c ON s.cpf_cnpj_cliente = c.cpf_cnpj WHERE c.nome_empresa = 'Nome da Empresa';"
    },
    {
      title: '💰 Ver serviços com VALOR maior que X',
      cmd: "node query.js SELECT * FROM servicos WHERE valor > 1000 ORDER BY valor DESC;"
    }
  ];

  commands.forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`);
    console.log(`   $ ${item.cmd}\n`);
  });

  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
