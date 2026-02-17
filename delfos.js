// =====================================
// IMPORTAÇÕES
// =====================================
require('dotenv').config();
const qrcode = require("qrcode-terminal");
const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");

// =====================================
// CONFIGURAÇÃO DO CLIENTE
// =====================================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  },
});

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
client.initialize();

// =====================================
// FUNÇÃO DE DELAY
// =====================================
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Estado para controlar quando um usuário deve escolher um serviço
const pendingSelection = new Map();

// Lista de serviços (conforme LeadFlow)
const services = [
  'Abertura de empresa',
  'Encerramento de empresa',
  'Contabilidade para pequena ou média empresa',
  'Suporte para MEI',
  'Alvará de funcionamento',
  'e-social'
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