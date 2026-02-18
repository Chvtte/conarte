// =====================================
// IMPORTAÇÕES
// =====================================
require('dotenv').config();
const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");
const path = require('path');
const db = require('./database.js');

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
// Use a per-process session directory to avoid collisions with other running instances
const sessionPath = process.env.WEBJS_SESSION_PATH || path.join(process.cwd(), `.wwebjs_auth_${process.pid}`);
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: sessionPath }),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--disable-extensions",
    ],
  },
});

console.log('Session data path:', sessionPath);

// =====================================
// QR CODE
// =====================================
client.on("qr", (qr) => {
  console.log("📲 Escaneie o QR Code abaixo:");
  qrcode.generate(qr, { small: true });
});

// =====================================
// WHATSAPP CONECTADO
// =====================================
client.on("ready", () => {
  console.log("✅ Tudo certo! WhatsApp conectado.");
});

// =====================================
// DESCONEXÃO
// =====================================
client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
});

// =====================================
// INICIALIZA
// =====================================
// Tratamento mais robusto da inicialização do client com tentativas
const startClient = async (retries = 3, delayMs = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Iniciando client (tentativa ${attempt}/${retries})`);
      await client.initialize();
      console.log('Client inicializado com sucesso.');
      return;
    } catch (err) {
      console.error(`Falha ao inicializar client (tentativa ${attempt}):`, err && err.message ? err.message : err);
      if (attempt < retries) {
        await delay(delayMs);
      } else {
        console.error('Não foi possível inicializar o client após várias tentativas.');
        throw err;
      }
    }
  }
};

// evitamos rejeições não capturadas travarem o processo
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

startClient().catch((e) => {
  console.error('Erro crítico na inicialização do bot:', e);
  // opcional: process.exit(1);
});

// =====================================
// FUNÇÃO DE DELAY
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Estado para controlar quando um usuário deve escolher um serviço
const pendingSelection = new Map();
// Um objeto simples para armazenar estados temporários de leads (ex: aguardando_cpf, aguardando_nome)
const conversationState = {};

// Lista de serviços (conforme LeadFlow)
const services = [
  'Legalização de empresa',
  'Terceiro setor',
  'Contabilidade mensal',
  'Sou MEI',
  'Alvará de funcionamento',
  'imposto de renda pessoa física',
  'outros'
];

// =====================================
// FUNIL DE MENSAGENS (SOMENTE PRIVADO)
// =====================================
client.on("message", async (msg) => {
  try {
    // ❌ VALIDA MENSAGEM BÁSICA
    if (!msg || !msg.from || !msg.body) return;
    
    // Ignora status e broadcasts
    if (msg.from === "status@broadcast" || msg.from.endsWith("@status")) return;
    
    // Ignora grupos
    if (msg.from.endsWith("@g.us")) return;

    let chat;
    try {
      // Adiciona timeout e validação mais robusta
      const chatPromise = msg.getChat();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao obter chat")), 5000)
      );
      chat = await Promise.race([chatPromise, timeoutPromise]);
    } catch (err) {
      // Ignora mensagens que não conseguem retornar chat válido
      // Isso pode ser status, broadcast, ou erro de conexão temporário
      return;
    }

    // Validação dupla do objeto chat
    if (!chat || typeof chat !== 'object' || chat.isGroup) return;

    const texto = msg.body.trim().toLowerCase();

    // Função de digitação (com proteção contra erros)
    const typing = async () => {
      try {
        await delay(2000);
        if (chat && typeof chat.sendStateTyping === 'function') {
          await chat.sendStateTyping();
        }
        await delay(2000);
      } catch (err) {
        // Ignora silenciosamente erros na simulação de digitação
      }
    };

    // ======= ALGORITMO DO CHATBOT =======
    try {
      const telefone = msg.from;
      const rawText = msg.body.trim();

      // Estado conversacional do lead
      const estado = conversationState[telefone];

      // ETAPA 1: Pedir CPF/CNPJ
      if (!estado) {
        conversationState[telefone] = { etapa: 'aguardando_cpf' };
        await typing();
        await client.sendMessage(telefone, '📋 Olá! Para começar, qual seu CPF ou CNPJ?');
        return;
      }

      // ETAPA 1b: Validar CPF/CNPJ
      if (estado.etapa === 'aguardando_cpf') {
        const cpfCnpj = rawText.replace(/[^0-9]/g, '');
        if (cpfCnpj.length < 11) {
          await typing();
          await client.sendMessage(telefone, '❌ CPF/CNPJ inválido. Por favor envie apenas números (mínimo 11 dígitos).');
          return;
        }

        // ETAPA 2: Buscar na tabela clientes
        let cliente = null;
        if (typeof db.prepare === 'function') {
          try {
            cliente = db.prepare('SELECT * FROM clientes WHERE cpf_cnpj = ?').get(cpfCnpj);
          } catch (err) {
            console.error('❌ Erro ao buscar cliente:', err && err.message ? err.message : err);
          }
        }

        // ETAPA 3a: Novo lead - pedir nome
        if (!cliente) {
          conversationState[telefone] = { etapa: 'aguardando_nome_novo', cpfCnpj };
          await typing();
          await client.sendMessage(telefone, '✏️ Ótimo! Qual seu nome ou nome da empresa?');
          return;
        }

        // ETAPA 3b: Lead existente - verificar serviços
        conversationState[telefone] = { etapa: 'cliente_existente', cpfCnpj, nomeCliente: cliente.nome_empresa };
        
        let servicosAtivos = [];
        let servicosPendentes = [];
        let servicosEmAndamento = [];
        
        if (typeof db.prepare === 'function') {
          try {
            servicosAtivos = db.prepare(`
              SELECT * FROM servicos 
              WHERE cpf_cnpj_cliente = ? AND status IN ('pendente', 'em_andamento', 'aguardando_pagamento')
            `).all(cpfCnpj);

            servicosPendentes = servicosAtivos.filter(s => s.status === 'aguardando_pagamento');
            servicosEmAndamento = servicosAtivos.filter(s => s.status === 'em_andamento');
          } catch (err) {
            console.error('❌ Erro ao buscar serviços:', err && err.message ? err.message : err);
          }
        }

        // ETAPA 4ba: Lembrar de pagamento pendente
        let msg_pendencia = '';
        if (servicosPendentes.length > 0) {
          msg_pendencia = `\n💳 **PAGAMENTO PENDENTE:**\n`;
          servicosPendentes.forEach((s) => {
            msg_pendencia += `• ${s.tipo} - R$ ${s.valor || '---'}\n`;
          });
        }

        // ETAPA 4bb: Oferecer agendamento se em andamento
        let msg_agendamento = '';
        if (servicosEmAndamento.length > 0) {
          msg_agendamento += `\n⏳ Você tem ${servicosEmAndamento.length} serviço(s) em andamento. Quer um agendamento para saber como está? 📅`;
        }

        // ETAPA 5: Mensagem de boas-vindas + menu
        await typing();
        await client.sendMessage(
          telefone,
          `👋 Bem vindo de volta *${cliente.nome_empresa}*!${msg_pendencia}${msg_agendamento}\n\nQual serviço você precisa?`
        );

        // Mostrar menu de serviços
        await delay(500);
        let menuText = '\n📋 Digite o número:\n\n';
        services.forEach((service, idx) => {
          menuText += `${idx + 1}. ${service}\n`;
        });
        
        await client.sendMessage(telefone, menuText);
        pendingSelection.set(telefone, true);
        delete conversationState[telefone];
        return;
      }

      // ETAPA 4a: Novo lead - registro completo
      if (estado.etapa === 'aguardando_nome_novo') {
        const nome = rawText;
        const cpfCnpj = estado.cpfCnpj;

        try {
          if (typeof db.prepare === 'function') {
            db.prepare('INSERT INTO clientes (cpf_cnpj, nome_empresa, telefone) VALUES (?, ?, ?)')
              .run(cpfCnpj, nome, telefone);
          } else {
            console.error('❌ db.prepare não é uma função');
            await client.sendMessage(telefone, '❌ Erro: banco de dados não disponível.');
            delete conversationState[telefone];
            return;
          }

          await typing();
          await client.sendMessage(telefone, `✅ Cadastro concluído com sucesso!\n\n👋 Bem vindo *${nome}*! 🎉`);
          
          // Apresentar menu de serviços
          await delay(500);
          let menuText = '\n📋 Qual serviço você precisa? Digite o número:\n\n';
          services.forEach((service, idx) => {
            menuText += `${idx + 1}. ${service}\n`;
          });
          
          await client.sendMessage(telefone, menuText);
          pendingSelection.set(telefone, true);
          delete conversationState[telefone];
        } catch (err) {
          console.error('❌ Erro ao inserir cliente:', err && err.message ? err.message : err);
          await client.sendMessage(telefone, '❌ Erro ao salvar cadastro. Tente novamente.');
          delete conversationState[telefone];
        }
        return;
      }

    } catch (err) {
      console.error('❌ Erro ao processar lead/cliente:', err && err.message ? err.message : err);
    }

    // Se o chat está aguardando a seleção de serviço, trata a resposta aqui
    if (pendingSelection.get(msg.from)) {
      // normaliza texto para comparação
      const norm = texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      // tenta extrair número
      const num = texto.replace(/[^0-9]/g, '').trim();
      let idx = -1;
      if (num) {
        idx = parseInt(num, 10) - 1;
      } else {
        // tenta casar por palavras-chave com cada serviço
        idx = services.findIndex((s) => {
          const sNorm = s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
          return norm.includes(sNorm.split(' ')[0]) || norm.includes(sNorm);
        });
      }

      if (idx >= 0 && idx < services.length) {
        const chosen = services[idx];
        pendingSelection.delete(msg.from);
        await typing();
        try {
          await client.sendMessage(
            msg.from,
            `Você escolheu: ${chosen} \n\nEm breve um atendente entrará em contato. Se quiser outro serviço, digite 'menu'.`
          );
        } catch (err) {
          console.error("❌ Erro ao enviar confirmação de serviço:", err.message);
        }
      } else {
        try {
          await client.sendMessage(
            msg.from,
            `Desculpe, não entendi. Digite o número da opção (1-${services.length}) ou o nome do serviço.`
          );
        } catch (err) {
          console.error("❌ Erro ao enviar mensagem de ajuda:", err.message);
        }
      }
      return;
    }

    // =====================================
    // MENSAGEM INICIAL
    // =====================================
    // lista ampliada de gatilhos (inclui variações e erros comuns)
    const isTrigger = (t) => {
      if (!t) return false;
      // normaliza: remove acentos, pontuação e espaço duplicado, em lowercase
      const norm = t
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const triggers = [
        'menu','mneu','menú',
        'oi','oie','oiee','oii','oiii','oiao',
        'ola','olaa','olaaa','olá',
        'bom dia','bomdia','bomdiaa','bomm dia','bomidia',
        'boa tarde','boatarde',
        'boa noite','boanoite','boanoit',
        'start','/start','iniciar','inicio','comecar','comecar',
        'ajuda','help','socorro','comando','comandos','comamd','comand',
        'hello','hi','hey','hola','salve','fala','eae','e ai',
        'tudo bem','tudobem','td bem','tdbem','blz'
      ];

      // verifica se algum gatilho aparece no texto normalizado
      return triggers.some((s) => norm === s || norm.startsWith(s + ' ') || norm.endsWith(' ' + s) || norm.includes(' ' + s + ' ') || norm.includes(s));
    };

    if (isTrigger(texto)) {

      await typing();

      const hora = new Date().getHours();
      let saudacao = "Olá";

      if (hora >= 5 && hora < 12) saudacao = "Bom dia";
      else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
      else saudacao = "Boa noite";

      try {
        await client.sendMessage(
          msg.from,
          `${saudacao}! 👋\n\n` +
          `Essa mensagem foi enviada automaticamente pelo robô 🤖\n\n` +
          `Na versão PRO você vai além: desbloqueie tudo!.\n\n` +
          '✍️ Envio de textos\n' +
              '🎙️ Áudios\n' +
              '🖼️ Imagens\n' +
              '🎥 Vídeos\n' +
              '📂 Arquivos\n\n' +
              '💡 Simulação de "digitando..." e "gravando áudio"\n' +
              '🚀 Envio de mensagens em massa\n' +
              '📇 Captura automática de contatos\n' +
              '💻 Aprenda como deixar o robô funcionando 24 hrs, com o PC desligado\n' +
              '✅ E 3 Bônus exclusivos\n\n' +
              '🔥 Adquira a versão PRO agora: https://pay.kiwify.com.br/FkTOhRZ?src=pro');

        // Exibe o menu de serviços
        await delay(1000);
        let menuText = `\n\nQual serviço você precisa? Digite o número:\n\n`;
        services.forEach((service, idx) => {
          menuText += `${idx + 1}. ${service}\n`;
        });
        
        await client.sendMessage(msg.from, menuText);
        pendingSelection.set(msg.from, true);
      } catch (err) {
        console.error("❌ Erro ao enviar menu inicial:", err.message);
      }
    }


  } catch (error) {
    console.error("❌ Erro no processamento da mensagem:", error);
  }
});