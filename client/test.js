import { io } from "socket.io-client"

// CONFIGURAÇÕES
const SERVER_URL = "http://localhost:3000"
const ROOM_ID = "AULA1" // O Professor DEVE criar a sala com este nome
const BOT_COUNT = 42    // Quantos alunos você quer simular
const CONNECT_DELAY = 100 // Delay em ms entre conexões (para não travar tudo de vez)

console.log(`🚀 Iniciando enxame de ${BOT_COUNT} bots para a sala "${ROOM_ID}"...`)

const createBot = (index) => {
  const socket = io(SERVER_URL, {
    transports: ["websocket"], // Força websocket para ser mais rápido
    forceNew: true             // Garante conexões distintas
  })

  const botName = `Aluno_Bot_${index + 1}`

  socket.on("connect", () => {
    // Assim que conectar, entra na sala
    socket.emit("join_room", {
      roomId: ROOM_ID,
      playerName: botName
    })
  })

  socket.on("joined_success", () => {
    console.log(`✅ ${botName} entrou na sala.`)
  })

  socket.on("new_hint", (dica) => {
    // Bot finge que leu a dica
    // console.log(`👀 ${botName} recebeu dica: "${dica.substring(0, 15)}..."`);
  })

  socket.on("bingo_winner", (data) => {
    console.log(`🏆 ${botName} viu que ${data.playerName} ganhou!`)
    // Opcional: desconectar bots após vitória
    // socket.disconnect();
  })

  socket.on("disconnect", () => {
    console.log(`❌ ${botName} desconectado.`)
  })

  // (Opcional) Fazer um bot gritar BINGO aleatoriamente para testar o modal de erro

  if (index === 0) {
    setTimeout(() => {
      console.log(`🤡 ${botName} vai gritar BINGO falso!`)
      socket.emit('claim_bingo', { roomId: ROOM_ID, card: [] })
    }, 10000)
  }

}

// Cria os bots com um pequeno intervalo para ser mais realista
for (let i = 0; i < BOT_COUNT; i++) {
  setTimeout(() => createBot(i), i * CONNECT_DELAY)
}