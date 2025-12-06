Dependências
- npm install

Configurar .env
- preencha o .env com as informações
- Preencha ISCHOLAR_SCHOOL_CODE, ISCHOLAR_TOKEN e demais variáveis sensíveis
- Configure catracas no .env (sem cadastro via dashboard):
  - Opção 1: CONTROLID_DEVICES=ip1,ip2,ip3
  - Opção 2: DEVICE_1_IP=192.168.0.10, DEVICE_1_PORT=80; DEVICE_2_IP=...

Inicializar banco # não precisa mais o sistema faz sozinho.
- node bancoinicial.js

Iniciar servidor
- node server.js

PM2 (Ubuntu)
- sudo apt-get install -y nodejs npm
- sudo npm i -g pm2
- pm2 start ecosystem.config.js
- pm2 save
- pm2 startup

PM2 (Windows)
- Instale Node.js
- npm i -g pm2
- pm2 start ecosystem.config.js
- Para serviço: npm i -g pm2-windows-service && pm2-service-install
- inicia o serviço pm2 start ecosystem.config.js
- pm2 save
- Reiniciar o windows 
- CMD > pm2 monit para ver serviços online ( se reiniciar o computador ou algo do tipo o servidor da catraca inicia sozinho )

Comandos úteis
- pm2 logs
- pm2 monit
- pm2 restart catraserver
- pm2 stop catraserver
- pm2 delete catraserver

Testes
- Token iScholar: /api/dashboard/status deve mostrar OK só com token válido
- Catracas online: o dashboard lê do .env; apenas exibe. Sem cadastro web
- Dashboard: http://localhost:SERVER_PORT/dashboard http://localhost:8000/dashboard/
- Health push: Toggle/Test via botões na tabela de catracas

DB
- SQLite padrão em SQLITE_PATH (./DATA/catraca.db)
- Sem DB remoto.

Observações
- Verifique portas (SERVER_PORT, porta dos devices)
- Certificados: se usar HTTPS no push health, configure URLs válidas
- Versão SDK Control iD: siga os modelos de integração Control iD
 - Erros comuns:
   - DB OFFLINE: liberar sqlite3 no Windows ou usar somente leitura de status
   - SEM TOKEN: iScholar mostra “SEM TOKEN” até preencher ISCHOLAR_TOKEN
   - Catraca OFFLINE: ver IP/porta, autenticação e rede
