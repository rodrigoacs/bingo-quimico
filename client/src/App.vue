<script setup>
import { ref, reactive } from 'vue'
import { io } from 'socket.io-client'

// --- Estado da Aplicação ---
const socket = ref(null)
const view = ref('login')

// Login
const roomCode = ref('')
const playerName = ref('')
const teacherPassword = ref('')

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
  if (!teacherPassword.value) return showModal('Atenção', 'A senha do professor é obrigatória.', 'error') // <--- NOVA VALIDAÇÃO

  if (!socket.value) connect()

  setTimeout(() => {
    socket.value.emit('create_room', {
      roomId: roomCode.value,
      password: teacherPassword.value
    })
  }, 100)
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
    <div
      class="main-container"
      :class="{ 'is-teacher': view === 'teacher' }"
    >

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
            <input
              v-model="teacherPassword"
              type="password"
              placeholder="Senha do Professor"
              class="input-lg"
            />
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
:root {
  --bg-body: #f8fafc;
  --bg-card: #ffffff;
  --primary: #6366f1;
  --primary-shadow: #4338ca;
  --accent: #10b981;
  --accent-shadow: #047857;
  --danger: #f43f5e;
  --danger-shadow: #be123c;
  --warning: #f59e0b;
  --warning-light: #fef3c7;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border: #cbd5e1;
  --radius-lg: 24px;
  --radius-md: 16px;
  --header-height: 68px;
  --card-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
}

.app-background {
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: radial-gradient(circle at top, #ffffff 0%, var(--bg-body) 100%);
  color: var(--text-main);
}

.main-container {
  width: 100%;
  max-width: 500px;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: max-width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.main-container.is-teacher {
  max-width: 1000px;
  padding: 16px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--bg-card);
  padding: 32px 24px;
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 340px;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  border: 2px solid var(--border);
  animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes bounceIn {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.modal-icon {
  font-size: 4rem;
  margin-bottom: 16px;
  display: block;
}

.modal-box h3 {
  font-size: 1.5rem;
  margin-bottom: 12px;
  color: var(--text-main);
}

.modal-box p {
  color: var(--text-muted);
  font-size: 1rem;
  margin-bottom: 24px;
  line-height: 1.4;
}

.btn {
  border: 2px solid transparent;
  border-radius: 14px;
  font-weight: 800;
  font-size: 1.1rem;
  padding: 0 24px;
  height: 54px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, box-shadow 0.1s, background-color 0.2s;
}

.btn-primary {
  background-color: var(--primary);
  color: white;
  border-color: var(--primary-shadow);
  box-shadow: 0 6px 0 var(--primary-shadow);
}

.btn-primary:active {
  transform: translateY(6px);
  box-shadow: 0 0px 0 var(--primary-shadow);
}

.btn-outline {
  background-color: white;
  color: var(--text-main);
  border-color: var(--border);
  box-shadow: 0 6px 0 var(--border);
}

.btn-outline:active {
  transform: translateY(6px);
  box-shadow: 0 0px 0 var(--border);
  background-color: #f8fafc;
}

.btn-bingo {
  background-color: var(--danger);
  color: white;
  border-color: var(--danger-shadow);
  box-shadow: 0 6px 0 var(--danger-shadow);
  font-size: 1.2rem;
  height: 48px;
  padding: 0 20px;
}

.btn-bingo:active {
  transform: translateY(6px);
  box-shadow: 0 0px 0 var(--danger-shadow);
}

.input-lg {
  width: 100%;
  background: #f8fafc;
  border: 2px solid var(--border);
  color: var(--text-main);
  height: 56px;
  border-radius: 14px;
  font-size: 1.1rem;
  font-weight: 600;
  text-align: center;
  outline: none;
  transition: all 0.2s;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
}

.input-lg:focus {
  border-color: var(--primary);
  background: white;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}

.login-panel {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  border: 2px solid var(--border);
  text-align: center;
  margin: auto 20px;
  box-shadow: var(--card-shadow);
}

.login-header {
  margin-bottom: 32px;
}

.login-header h1 {
  color: var(--primary);
}

.icon-flask {
  font-size: 4.5rem;
  margin-bottom: 8px;
  display: inline-block;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {

  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.login-actions {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 24px;
}

.action-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.divider {
  color: var(--text-muted);
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
}

.divider::before,
.divider::after {
  content: "";
  height: 2px;
  background: var(--border);
  flex: 1;
  border-radius: 2px;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-card);
  border-bottom: 2px solid var(--border);
  align-items: center;
  height: var(--header-height);
  z-index: 10;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.room-info,
.player-count,
.user-id {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.player-count {
  align-items: flex-end;
}

.label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 800;
  text-transform: uppercase;
}

.value,
.user-id strong {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--primary);
}

.game-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.student-main,
.teacher-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

.student-hint {
  background: var(--warning-light);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 20px;
  border: 2px solid var(--warning);
  display: flex;
  flex-direction: column;
  min-height: 100px;
  justify-content: center;
  box-shadow: 0 4px 0 var(--warning);
}

.hint-label {
  color: #b45309;
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.hint-text {
  font-size: 1.15rem;
  line-height: 1.3;
  font-weight: 700;
  color: #78350f;
}

.bingo-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow-y: auto;
  padding-bottom: 40px;
}

.bingo-grid.fixed-grid {
  display: grid;
  gap: 12px;
  width: 100%;
  max-width: 420px;
  grid-template-columns: repeat(3, 1fr);
}

@media (min-width: 500px) {
  .bingo-grid.fixed-grid {
    max-width: 600px;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
  }
}

.bingo-cell {
  aspect-ratio: 1 / 1;
  background: white;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 0 var(--border);
  transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.1s, background-color 0.2s;
}

.bingo-cell:active {
  transform: translateY(6px);
  box-shadow: 0 0px 0 var(--border);
  background: #f8fafc;
}

.bingo-cell.marked {
  background: var(--accent);
  border-color: var(--accent-shadow);
  box-shadow: 0 6px 0 var(--accent-shadow);
  color: white;
}

.bingo-cell.marked:active {
  transform: translateY(6px);
  box-shadow: 0 0px 0 var(--accent-shadow);
}

.cell-symbol {
  font-size: 2.2rem;
  font-weight: 800;
  color: var(--text-main);
  transition: color 0.2s;
}

.bingo-cell.marked .cell-symbol {
  color: white;
}

.teacher-layout {
  flex-direction: row;
  gap: 24px;
}

@media (max-width: 800px) {
  .teacher-layout {
    flex-direction: column;
  }
}

.draw-section-fixed {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-stage-fixed {
  width: 100%;
  margin-bottom: 24px;
}

.element-card {
  background: white;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  border: 4px solid var(--primary);
  box-shadow: 0 12px 0 var(--primary-shadow);
}

.element-card.giant .symbol {
  font-size: 5.5rem;
  font-weight: 900;
  color: var(--primary);
  line-height: 1;
}

.element-card .atomic-number {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-muted);
  position: absolute;
  top: 16px;
  left: 20px;
}

.element-card .name {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text-main);
  margin-top: 8px;
}

.element-card .group-badge {
  font-size: 0.85rem;
  font-weight: 800;
  color: white;
  background: var(--primary);
  padding: 6px 16px;
  border-radius: 20px;
  position: absolute;
  bottom: 20px;
}

.placeholder-state {
  width: 100%;
  aspect-ratio: 3 / 4;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  font-weight: 700;
  font-size: 1.2rem;
}

.teacher-bottom-split {
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
}

.panel-column {
  flex: 1;
  background: white;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border);
  box-shadow: var(--card-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 16px;
  background: var(--bg-body);
  border-bottom: 2px solid var(--border);
  font-size: 0.9rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-muted);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.players-list-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
}

.players-list-grid li {
  background: var(--bg-body);
  border-radius: 10px;
  padding: 12px 16px;
  border: 2px solid var(--border);
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-main);
}

.status-dot {
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--accent-shadow);
}

.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 12px;
}

.history-badge {
  background: white;
  border-radius: 12px;
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border);
  box-shadow: 0 4px 0 var(--border);
}

.h-symbol {
  font-weight: 800;
  font-size: 1.3rem;
  color: var(--primary);
}

.h-number {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 700;
}

/* Animações */
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
