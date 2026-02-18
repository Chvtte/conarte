0.0.0.4
- primeira client run bem-sucedida
- .gitignore atualizado
- função de inicialização melhorada para lidar com erros de digitação e mais variações de mensssagem
- testes serão nescessários
0.1.0.0
- funcionalidade de menu interativo adicionado
- merge after 0.0.0.4 test runs
0.1.0.1
- run da feature da 0.0.0.4 bem sucedida
- correção de bugs da funcioonalidade de menu(nescessita de mais correções)
0.1.1.1
- Normalização e ampliação dos gatilhos de entrada (`isTrigger`) para cobrir variações e erros de digitação.
- Implementado menu interativo de serviços e controle de estado com `pendingSelection`.
- Tratamento robusto de `msg.getChat()` com validação, `try/catch` e timeout (5s) para evitar exceções.
- Proteções na simulação de "digitando..." e em chamadas `sendMessage()` (try/catch para evitar crashes).
- Inicialização do client com `startClient()` (retries + backoff) e handlers para `unhandledRejection` / `uncaughtException`.
- Ajustes no Puppeteer: remoção de `--single-process`, adição de flags mais estáveis; e `LocalAuth` com `dataPath` por processo para evitar conflito de sessões.
- Log do caminho da sessão adicionado e mensagens de erro mais informativas para facilitar debugging.
- coinflip branch sucefully merged
0.1.2.1
- lista de serviços atualizada
- biblioteca better-sqlite3 adicionada ao projeto
- funcionalidde de registro de leadsadicionado a delfos.js