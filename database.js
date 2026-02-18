// database.js
let db = null;

function initDatabase() {
  if (db) return db;

  try {
    const Database = require('better-sqlite3');
    db = new Database('conarte.db'); // Cria o arquivo do banco

    // Tabela de CLIENTES
    db.exec(`
      CREATE TABLE IF NOT EXISTS clientes (
        cpf_cnpj TEXT PRIMARY KEY,
        nome_empresa TEXT NOT NULL,
        telefone TEXT UNIQUE NOT NULL,
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de SERVIÇOS
    db.exec(`
      CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpf_cnpj_cliente TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pendente',
        tipo TEXT,
        valor REAL,
        descricao TEXT,
        FOREIGN KEY (cpf_cnpj_cliente) REFERENCES clientes(cpf_cnpj)
      )
    `);

    console.log('✅ Banco de dados inicializado com sucesso!');
    return db;
  } catch (err) {
    console.error('❌ Erro ao inicializar banco de dados:', err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = {
  getDb: initDatabase,
  prepare: (sql) => initDatabase().prepare(sql),
  exec: (sql) => initDatabase().exec(sql),
};