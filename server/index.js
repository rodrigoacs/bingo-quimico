import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PORT = process.env.PORT || 3000

const app = express()
app.use(express.json())
app.use(cors())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      process.env.CORS_ORIGIN
    ].filter(Boolean),
    methods: ["GET", "POST"],
    credentials: true
  }
})

const rooms = {}

const loadElementsData = () => {
  try {
    const csvPath = path.join(__dirname, 'data', 'elementos.csv')
    const fileContent = fs.readFileSync(csvPath, 'utf-8')
    const lines = fileContent.split('\n').filter(line => line.trim() !== '')
    lines.shift()
    return lines.map(line => {
      const values = line.split(',')
      return {
        simbolo: values[0].trim(),
        numeroAtomico: parseInt(values[1].trim()),
        nome: values[2].trim(),
        dica: values[3].trim(),
        grupo: values[4].trim()
      }
    })
  } catch (error) {
    console.error("Erro ao carregar CSV:", error)
    return []
  }
}

const allElements = loadElementsData()

const shuffle = (array) => {
  const newArr = [...array]
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]]
  }
  return newArr
}

const createPatternDeck = () => {
  const g1 = shuffle(allElements.filter(e => e.grupo === '1'))
  const g2 = shuffle(allElements.filter(e => e.grupo === '2'))
  const g3 = shuffle(allElements.filter(e => e.grupo === '3'))
  let orderedDeck = []
  while (g1.length > 0 || g2.length > 0 || g3.length > 0) {
    orderedDeck.push(...g1.splice(0, 5))
    orderedDeck.push(...g2.splice(0, 2))
    orderedDeck.push(...g3.splice(0, 3))
  }
  return orderedDeck.reverse()
}

const generatePlayerCard = () => {
  const pool = [...allElements]
  const shuffled = shuffle(pool)
  return shuffled.slice(0, 15)
}

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`)

  // Localize este trecho no seu server/index.js:
  socket.on('create_room', (data) => {
    const { roomId, senha } = data

    const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD

    if (senha !== TEACHER_PASSWORD) {
      socket.emit('error', 'Senha incorreta! Acesso negado para criar sala.')
      return
    }

    if (rooms[roomId]) {
      socket.emit('error', 'Sala já existe')
      return
    }

    const drawPile = createPatternDeck()
    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      drawPile: drawPile,
      drawnElements: [],
      currentData: null,
      players: []
    }

    socket.join(roomId)
    socket.emit('room_created', { roomId })
  })

  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms[roomId]
    if (!room) {
      socket.emit('error', 'Sala não encontrada')
      return
    }
    const player = { id: socket.id, name: playerName }
    room.players.push(player)
    socket.join(roomId)
    const playerCard = generatePlayerCard()
    socket.emit('joined_success', { roomId, card: playerCard })
    io.to(room.hostId).emit('player_joined', player)
    if (room.currentData) {
      socket.emit('new_hint', room.currentData.dica)
    }
  })

  socket.on('draw_next', (roomId) => {
    const room = rooms[roomId]
    if (!room || room.hostId !== socket.id) return
    if (room.drawPile.length === 0) {
      io.to(roomId).emit('game_over', 'Fim do Sorteio!')
      return
    }
    const nextElement = room.drawPile.pop()
    room.drawnElements.push(nextElement)
    room.currentData = nextElement
    io.to(roomId).emit('new_hint', nextElement.dica)

    // ATUALIZAÇÃO: Envia também o histórico (drawnElements)
    socket.emit('host_update', {
      currentElement: nextElement,
      remaining: room.drawPile.length,
      drawnElements: room.drawnElements // <--- NOVO
    })
  })

  socket.on('claim_bingo', ({ roomId, card }) => {
    const room = rooms[roomId]
    if (room) {
      const playerObj = room.players.find(p => p.id === socket.id)
      const playerName = playerObj ? playerObj.name : "Jogador Desconhecido"

      const markedItems = card.filter(c => c.marked)
      const hasFullCard = markedItems.length === card.length

      if (!hasFullCard) {
        io.to(room.hostId).emit('bingo_check_failed', {
          playerName,
          isValid: false,
          reason: "Cartela incompleta"
        })
        socket.emit('notification', `Você marcou apenas ${markedItems.length} de ${card.length}. Complete a cartela!`)
        return
      }

      const allMarkedAreDrawn = markedItems.every(playerItem =>
        room.drawnElements.some(drawnItem => drawnItem.simbolo === playerItem.simbolo)
      )

      if (allMarkedAreDrawn) {
        io.to(roomId).emit('bingo_winner', {
          playerName,
          isValid: true
        })
      } else {
        io.to(room.hostId).emit('bingo_check_failed', {
          playerName,
          isValid: false,
          reason: "Itens não sorteados marcados"
        })
        socket.emit('notification', 'Bingo Inválido! Você marcou elementos que não foram sorteados.')
      }
    }
  })

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId]

      if (room.hostId === socket.id) {
        io.to(roomId).emit('error', 'O professor foi desconectado. A sala foi encerrada.')
        delete rooms[roomId]
        console.log(`Sala ${roomId} destruída.`)
        return
      }

      const playerIndex = room.players.findIndex(p => p.id === socket.id)
      if (playerIndex !== -1) {
        const player = room.players[playerIndex]
        room.players.splice(playerIndex, 1)
        console.log(`Aluno ${player.name} saiu da sala ${roomId}`)
      }
    }
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})