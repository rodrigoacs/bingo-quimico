<script setup>
import { ref, reactive } from 'vue'
import { io } from 'socket.io-client'

// --- Estado da Aplicação ---
const socket = ref(null)
const view = ref('login')

// Login
const roomCode = ref('')
const playerName = ref('')

// Jogo
const currentHint = ref('')
const hostData = reactive({
  currentElement: null,
  remaining: 0,
  players: [],
  drawnElements: [] // Novo array para histórico
})
const bingoCard = ref([])

// --- Modal ---
const modal = reactive({
  visible: false,
  title: '',
  message: '',
  type: 'info',
  onConfirm: null
})

const showModal = (title, message, type = 'info', onConfirm = null) => {
  modal.title = title
  modal.message = message
  modal.type = type
  modal.onConfirm = onConfirm
  modal.visible = true
}

const closeModal = () => {
  modal.visible = false
  modal.onConfirm = null
}

const handleConfirm = () => {
  if (modal.onConfirm) modal.onConfirm()
  closeModal()
}

// --- Conexão ---
const connect = () => {
  const serverUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : `http://${window.location.hostname}:3000`

  socket.value = io(serverUrl, { transports: ['websocket', 'polling'] })

  socket.value.on('error', (msg) => {
    showModal('Erro', msg, 'error')
  })

  // Eventos Professor
  socket.value.on('room_created', ({ roomId }) => {
    view.value = 'teacher'
    roomCode.value = roomId
  })
  socket.value.on('player_joined', (p) => hostData.players.push(p))

  socket.value.on('host_update', (d) => {
    hostData.currentElement = d.currentElement
    hostData.remaining = d.remaining
    hostData.drawnElements = d.drawnElements // Atualiza histórico
  })

  socket.value.on('bingo_check_failed', (d) => {
    showModal('Bingo Inválido', `O jogador ${d.playerName} errou (${d.reason}). O jogo segue.`, 'error')
  })

  // Eventos Aluno
  socket.value.on('joined_success', ({ roomId, card }) => {
    view.value = 'student'
    bingoCard.value = card.map(el => ({ ...el, marked: false }))
  })
  socket.value.on('new_hint', (dica) => currentHint.value = dica)

  socket.value.on('notification', (msg) => {
    // Notificações via modal de erro acima
  })

  // GLOBAL
  socket.value.on('bingo_winner', (d) => {
    showModal('TEMOS UM VENCEDOR!', `O jogador ${d.playerName} completou o Bingo!`, 'success')
  })
}

// --- Ações ---
const createRoom = () => {
  if (!roomCode.value) return showModal('Atenção', 'Digite o nome da sala.', 'error')
  if (!socket.value) connect()
  setTimeout(() => socket.value.emit('create_room', roomCode.value), 100)
}

const joinRoom = () => {
  if (!roomCode.value || !playerName.value) return showModal('Atenção', 'Preencha Sala e Nome.', 'error')
  if (!socket.value) connect()
  setTimeout(() => socket.value.emit('join_room', { roomId: roomCode.value, playerName: playerName.value }), 100)
}

const drawNext = () => socket.value.emit('draw_next', roomCode.value)

const claimBingo = () => {
  const marcados = bingoCard.value.filter(c => c.marked).length
  const total = bingoCard.value.length

  if (marcados < total) {
    showModal(
      'Tem certeza?',
      `Você marcou apenas ${marcados} de ${total}. Se gritar errado, pode ser penalizado!`,
      'confirm',
      () => emitBingo()
    )
  } else {
    emitBingo()
  }
}

const emitBingo = () => {
  socket.value.emit('claim_bingo', { roomId: roomCode.value, card: bingoCard.value })
}

const toggleMark = (index) => {
  bingoCard.value[index].marked = !bingoCard.value[index].marked
}
</script>

<template>
  <div class="app-background">
    <div class="main-container">

      <transition name="fade">
        <div
          v-if="modal.visible"
          class="modal-overlay"
        >
          <div
            class="modal-box"
            :class="modal.type"
          >
            <div class="modal-icon">
              <span v-if="modal.type === 'error'">&#x26A0;&#xFE0F;</span>
              <span v-else-if="modal.type === 'success'">&#x1F3C6;</span>
              <span v-else-if="modal.type === 'confirm'">&#x1F914;</span>
              <span v-else>&#x2139;&#xFE0F;</span>
            </div>
            <h3>{{ modal.title }}</h3>
            <p>{{ modal.message }}</p>
            <div class="modal-actions">
              <button
                v-if="modal.type === 'confirm'"
                @click="closeModal"
                class="btn btn-outline"
              >Cancelar</button>
              <button
                @click="handleConfirm"
                class="btn btn-primary"
              >
                {{ modal.type === 'confirm' ? 'Confirmar' : 'Fechar' }}
              </button>
            </div>
          </div>
        </div>
      </transition>

      <div
        v-if="view === 'login'"
        class="card login-panel fade-in"
      >
        <div class="login-header">
          <div class="icon-flask">&#x2697;&#xFE0F;</div>
          <h1>Bingo Quimico</h1>
        </div>
        <div class="input-group">
          <label>Nome da Sala</label>
          <input
            v-model="roomCode"
            placeholder="Ex: AULA3"
            class="input-lg"
          />
        </div>
        <div class="login-actions">
          <div class="action-col student-col">
            <input
              v-model="playerName"
              placeholder="Seu Nome"
              class="input-lg"
            />
            <button
              @click="joinRoom"
              class="btn btn-primary btn-block"
            >Entrar como Aluno</button>
          </div>
          <div class="divider">ou</div>
          <div class="action-col teacher-col">
            <button
              @click="createRoom"
              class="btn btn-outline btn-block"
            >Criar Sala (Professor)</button>
          </div>
        </div>
      </div>

      <div
        v-if="view === 'teacher'"
        class="game-view fade-in"
      >
        <header class="top-bar">
          <div class="room-info">
            <span class="label">Sala</span> <span class="value">{{ roomCode }}</span>
          </div>
          <div class="player-count">
            <span class="value">{{ hostData.players.length }}</span> <span class="label">Online</span>
          </div>
        </header>

        <main class="teacher-layout">
          <div class="draw-section-fixed">
            <div class="card-stage-fixed">
              <div
                v-if="hostData.currentElement"
                class="element-card giant"
              >
                <span class="atomic-number">{{ hostData.currentElement.numeroAtomico }}</span>
                <span class="symbol">{{ hostData.currentElement.simbolo }}</span>
                <span class="name">{{ hostData.currentElement.nome }}</span>
                <div class="group-badge">Grupo {{ hostData.currentElement.grupo }}</div>
              </div>
              <div
                v-else
                class="placeholder-state"
              >
                <p>Aguardando inicio...</p>
              </div>
            </div>

            <div
              v-if="hostData.currentElement"
              class="hint-box-fixed"
            >
              <strong>Dica:</strong>
              <p>{{ hostData.currentElement.dica }}</p>
            </div>

            <button
              @click="drawNext"
              class="btn btn-primary btn-xl"
            >
              {{ hostData.currentElement ? 'Proximo' : 'Iniciar Sorteio' }}
            </button>
          </div>

          <div class="teacher-bottom-split">

            <div class="panel-column">
              <div class="panel-header">Alunos ({{ hostData.players.length }})</div>
              <div class="panel-content">
                <ul class="players-list-grid">
                  <li
                    v-for="player in hostData.players"
                    :key="player.id"
                  >
                    <span class="status-dot"></span> {{ player.name }}
                  </li>
                  <li
                    v-if="hostData.players.length === 0"
                    class="empty-list"
                  >Sala vazia</li>
                </ul>
              </div>
            </div>

            <div class="panel-column">
              <div class="panel-header">Sorteados ({{ hostData.drawnElements.length }})</div>
              <div class="panel-content history-content">
                <div class="history-grid">
                  <div
                    v-for="el in hostData.drawnElements.slice().reverse()"
                    :key="el.simbolo"
                    class="history-badge"
                  >
                    <span class="h-symbol">{{ el.simbolo }}</span>
                    <span class="h-number">{{ el.numeroAtomico }}</span>
                  </div>
                  <div
                    v-if="hostData.drawnElements.length === 0"
                    class="empty-list"
                  >
                    Nenhum elemento
                  </div>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>

      <div
        v-if="view === 'student'"
        class="game-view fade-in"
      >
        <header class="top-bar student-bar">
          <div class="user-id">
            <span class="label">Jogador</span> <strong>{{ playerName }}</strong>
          </div>
          <button
            @click="claimBingo"
            class="btn btn-bingo"
          >BINGO!</button>
        </header>

        <main class="student-main">
          <div
            class="hint-box-fixed student-hint"
            :class="{ 'updated': currentHint }"
          >
            <span class="hint-label">DICA DO MESTRE</span>
            <p class="hint-text">{{ currentHint || "Aguardando..." }}</p>
          </div>

          <div class="bingo-area">
            <div class="bingo-grid fixed-grid">
              <div
                v-for="(cell, index) in bingoCard"
                :key="cell.simbolo"
                class="bingo-cell"
                :class="{ marked: cell.marked }"
                @click="toggleMark(index)"
              >
                <div class="cell-inner">
                  <span class="cell-symbol">{{ cell.simbolo }}</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

    </div>
  </div>
</template>

<style>
/* --- VARIÁVEIS E RESET --- */
:root {
  --bg-body: #0f172a;
  --bg-card: #1e293b;
  --bg-overlay: rgba(15, 23, 42, 0.95);
  --primary: #6366f1;
  --accent: #10b981;
  --accent-dark: #059669;
  --danger: #ef4444;
  --warning: #f59e0b;
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --border: #334155;
  --header-height: 60px;
  --hint-height: 110px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  user-select: none;
}

body {
  font-family: 'Inter', sans-serif;
  background-color: var(--bg-body);
  color: var(--text-main);
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* --- GERAL --- */
.app-background {
  height: 100%;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px;
}

.main-container {
  width: 100%;
  max-width: 600px;
  height: 100%;
  max-height: 900px;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* --- MODAL --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-overlay);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--bg-card);
  padding: 2rem;
  border-radius: 1rem;
  width: 90%;
  max-width: 350px;
  text-align: center;
  border: 1px solid var(--border);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
}

.modal-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.modal-box h3 {
  color: white;
  margin-bottom: 0.5rem;
  font-size: 1.4rem;
}

.modal-box p {
  color: var(--text-muted);
  margin-bottom: 1.5rem;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

/* --- UI ELEMENTS --- */
.btn {
  border: none;
  border-radius: 0.6rem;
  font-weight: 700;
  font-size: 1rem;
  padding: 0.8rem;
  cursor: pointer;
  transition: transform 0.1s;
  width: 100%;
}

.btn:active {
  transform: scale(0.97);
}

.btn-primary {
  background-color: var(--primary);
  color: white;
}

.btn-outline {
  background: transparent;
  border: 2px solid var(--border);
  color: var(--text-main);
}

.btn-bingo {
  background: linear-gradient(135deg, #f43f5e, #e11d48);
  color: white;
  width: auto;
  padding: 0.4rem 1.2rem;
}

.input-lg {
  width: 100%;
  background: #020617;
  border: 2px solid var(--border);
  color: white;
  padding: 0.8rem;
  border-radius: 0.6rem;
  font-size: 1.1rem;
  text-align: center;
}

/* --- LOGIN --- */
.login-panel {
  background: var(--bg-card);
  border-radius: 1rem;
  padding: 2rem;
  border: 1px solid var(--border);
  text-align: center;
  margin: auto 0;
  width: 100%;
}

.login-header {
  margin-bottom: 2rem;
}

.icon-flask {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.login-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.divider {
  color: var(--text-muted);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.divider::before,
.divider::after {
  content: "";
  height: 1px;
  background: var(--border);
  flex: 1;
}

/* --- HEADER --- */
.top-bar {
  display: flex;
  justify-content: space-between;
  padding: 0.8rem;
  background: var(--bg-card);
  border-radius: 0.8rem;
  border: 1px solid var(--border);
  flex: 0 0 var(--header-height);
  align-items: center;
}

.label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: bold;
}

.value {
  font-size: 1.1rem;
  font-weight: bold;
  color: white;
}

/* --- LAYOUTS --- */
.game-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  gap: 10px;
}

.student-main,
.teacher-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

/* --- DICA --- */
.hint-box-fixed {
  background: #334155;
  border-left: 5px solid var(--warning);
  border-radius: 0.6rem;
  padding: 0.8rem;
  margin-bottom: 10px;
  flex: 0 0 var(--hint-height);
  height: var(--hint-height);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.hint-label {
  color: var(--warning);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
  display: block;
  flex-shrink: 0;
}

.hint-text {
  font-size: 1rem;
  line-height: 1.3;
  margin: 0;
  word-wrap: break-word;
}

/* --- BINGO GRID (ALUNO) --- */
.bingo-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 10px;
  overflow-y: auto;
}

.bingo-grid.fixed-grid {
  display: grid;
  gap: 6px;
  width: 90vw;
  max-width: 360px;
  grid-template-columns: repeat(3, 80px);
  grid-auto-rows: 80px;
  justify-content: center;
  align-content: center;
  background: rgba(15, 23, 42, 0.6);
  border: 2px solid var(--border);
  border-radius: 1rem;
  padding: 12px;
  margin: 0 auto;
}

@media (min-width: 500px) {
  .bingo-grid.fixed-grid {
    width: 100%;
    max-width: 480px;
    grid-template-columns: repeat(5, 80px);
    gap: 8px;
    padding: 16px;
  }
}

.bingo-cell {
  width: 80px;
  height: 80px;
  min-width: 80px;
  min-height: 80px;
  background: #f8fafc;
  border-radius: 0.6rem;
  cursor: pointer;
  box-shadow: 0 4px 0 #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.bingo-cell:active {
  transform: translateY(4px);
  box-shadow: none;
}

.bingo-cell.marked {
  background: var(--accent);
  box-shadow: 0 4px 0 var(--accent-dark);
}

.bingo-cell.marked .cell-symbol {
  color: white;
}

.cell-symbol {
  font-size: 1.8rem;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: -1px;
}

/* --- PROFESSOR TOP (SORTEIO) --- */
.draw-section-fixed {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 10px;
}

.card-stage-fixed {
  display: flex;
  justify-content: center;
  height: 180px;
  margin-bottom: 8px;
  width: 100%;
}

.element-card {
  background: #f8fafc;
  color: #1e293b;
  width: 140px;
  height: 180px;
  border-radius: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 4px solid var(--primary);
  box-shadow: 0 6px 0 rgba(99, 102, 241, 0.3);
}

.element-card.giant .symbol {
  font-size: 3.2rem;
  font-weight: 900;
  line-height: 1;
  color: #1e293b;
}

.element-card .atomic-number {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary);
  position: absolute;
  top: 8px;
  left: 10px;
}

.element-card .name {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  margin-top: 4px;
}

.element-card .group-badge {
  font-size: 0.6rem;
  font-weight: 700;
  color: white;
  background: var(--primary);
  padding: 2px 8px;
  border-radius: 999px;
  position: absolute;
  bottom: 8px;
}

.placeholder-state {
  width: 140px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--border);
  border-radius: 1rem;
  color: var(--text-muted);
  font-size: 0.9rem;
  text-align: center;
}

.draw-section-fixed .hint-box-fixed {
  width: 100%;
  max-width: 340px;
  margin-bottom: 0;
}

.btn-xl {
  padding: 0.9rem 1.6rem;
  font-size: 1.1rem;
  width: 100%;
  max-width: 340px;
}

/* --- PROFESSOR BOTTOM (LISTAS COM SCROLL) --- */
.teacher-bottom-split {
  flex: 1;
  /* Ocupa o restante da tela */
  display: flex;
  gap: 10px;
  min-height: 0;
  /* Permite encolher abaixo do conteúdo */
  overflow: hidden;
  /* Blinda o container */

  /* Se a tela for muito pequena, permite quebrar linha */
  flex-wrap: wrap;
}

.panel-column {
  /* Flex: cresce, encolhe, base de 200px */
  flex: 1 1 200px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 1rem;
  border: 2px solid var(--border);
  display: flex;
  flex-direction: column;

  /* CRUCIAL PARA SCROLL: Altura controlada pelo pai */
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* Ajuste quando empilha (Mobile) */
@media (max-width: 500px) {
  .teacher-bottom-split {
    flex-direction: column;
    /* Força coluna no mobile */
  }

  .panel-column {
    flex: 1 1 auto;
    /* Divide o espaço verticalmente */
    height: auto;
    max-height: 50%;
    /* Limita altura para forçar scroll interno */
  }
}

.panel-header {
  flex: 0 0 35px;
  /* Altura fixa cabeçalho */
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
}

.panel-content {
  flex: 1;
  /* Ocupa o resto do painel */
  overflow-y: auto;
  /* SCROLL AQUI */
  padding: 8px;
  min-height: 0;
  /* Permite scroll funcionar */

  /* Scrollbar Estilizada */
  scrollbar-width: thin;
  scrollbar-color: var(--primary) transparent;
}

/* Scrollbar Webkit (Chrome/Safari) */
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: 10px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--primary);
}

/* --- CONTEÚDO DAS LISTAS --- */
.players-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
  list-style: none;
  padding-bottom: 20px;
  /* Espaço extra no fim do scroll */
}

.players-list-grid li {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  height: 32px;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: var(--accent);
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 5px var(--accent-dark);
}

.empty-list {
  grid-column: 1 / -1;
  justify-content: center;
  font-style: italic;
  color: var(--text-muted);
  background: transparent !important;
  border: none !important;
}

/* Histórico */
.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
  padding-bottom: 20px;
}

.history-badge {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.h-symbol {
  font-weight: 800;
  font-size: 0.9rem;
  color: white;
  line-height: 1;
}

.h-number {
  font-size: 0.55rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ANIMAÇÕES */
.fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
