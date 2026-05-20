const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── CONSTANTS ───
const COLORS = [
  { id: 'verde_oscuro', name: 'Verde Oscuro', hex: '#2d6a4f' },
  { id: 'verde_claro', name: 'Verde Claro', hex: '#52b788' },
  { id: 'azul_oscuro', name: 'Azul Oscuro', hex: '#1d3557' },
  { id: 'celeste', name: 'Celeste', hex: '#48cae4' },
  { id: 'rojo', name: 'Rojo', hex: '#e63946' },
  { id: 'naranja', name: 'Naranja', hex: '#f77f00' },
  { id: 'amarillo', name: 'Amarillo', hex: '#fcbf49' },
  { id: 'magenta', name: 'Magenta', hex: '#e040fb' }
];
const VALUES = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, -1];
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const TOTAL_ROUNDS = 3;

const SPECIAL_CARDS = [
  { type: 'dynamite', count: 4, name: '🧨 Dinamita' },
  { type: 'color_change', count: 4, name: '🎨 Cambio Color' },
  { type: 'blind', count: 2, name: '👁️ Ojo Cerrado' },
  { type: 'swap', count: 4, name: '🔄 Intercambio' }
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const deck = [];
  let id = 0;
  for (const color of COLORS) {
    for (const value of VALUES) {
      deck.push({ id: id++, color: color.id, colorHex: color.hex, colorName: color.name, value, special: null });
    }
  }
  for (const spec of SPECIAL_CARDS) {
    for (let i = 0; i < spec.count; i++) {
      deck.push({ id: id++, special: spec.type, specialName: spec.name, color: null, value: null });
    }
  }
  return shuffle(deck);
}

const rooms = new Map();
let roomCounter = 0;

function findAvailableRoom() {
  for (const [id, room] of rooms) {
    if (room.state === 'waiting' && room.players.length < MAX_PLAYERS) {
      return room;
    }
  }
  return null;
}

function createRoom() {
  const id = `room_${++roomCounter}`;
  const room = {
    id, state: 'waiting', players: [], deck: [], discardPile: [],
    currentPlayerIndex: 0, currentRound: 1, roundScores: [], turnPhase: 'draw',
    drawnCard: null, roundEnder: null, flippedCount: {}, readyForGame: new Set(),
  };
  rooms.set(id, room);
  return room;
}

function getPlayerMatrix(player) {
  return player.matrix.map(row =>
    row.map(cell => cell ? { card: cell.faceUp ? cell.card : null, faceUp: cell.faceUp, hasCard: true } : { hasCard: false })
  );
}

function getPlayerPublicData(player) {
  return { id: player.id, nickname: player.nickname, age: player.age, matrix: getPlayerMatrix(player), matrixRows: player.matrixRows, matrixCols: player.matrixCols };
}

function getFullPlayerData(player) {
  return {
    id: player.id, nickname: player.nickname, age: player.age,
    matrix: player.matrix.map(row => row.map(cell => cell ? { card: cell.card, faceUp: cell.faceUp, hasCard: true } : { hasCard: false })),
    matrixRows: player.matrixRows, matrixCols: player.matrixCols
  };
}

function getRoomState(room, forPlayerId) {
  const players = room.players.map(p => p.id === forPlayerId ? getFullPlayerData(p) : getPlayerPublicData(p));
  return {
    roomId: room.id, state: room.state, players, currentPlayerIndex: room.currentPlayerIndex,
    currentPlayerId: room.players[room.currentPlayerIndex]?.id, currentRound: room.currentRound,
    discardTop: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
    deckCount: room.deck.length, turnPhase: room.turnPhase, drawnCard: room.drawnCard, roundScores: room.roundScores, totalRounds: TOTAL_ROUNDS
  };
}

function dealCards(room) {
  room.deck = createDeck(); room.discardPile = []; room.drawnCard = null; room.turnPhase = 'draw'; room.roundEnder = null; room.flippedCount = {};
  for (const player of room.players) {
    player.matrixRows = 3; player.matrixCols = 3; player.matrix = [];
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) row.push({ card: room.deck.pop(), faceUp: false });
      player.matrix.push(row);
    }
    room.flippedCount[player.id] = 0;
  }
  room.discardPile.push(room.deck.pop());
  room.state = 'flipping';
}

function determineFirstPlayer(room) {
  let bestSum = -Infinity, bestPlayer = null, bestAge = Infinity;
  for (const player of room.players) {
    let sum = 0;
    for (const row of player.matrix) {
      for (const cell of row) {
        if (cell && cell.faceUp) sum += cell.card.value || 0;
      }
    }
    if (sum > bestSum || (sum === bestSum && player.age < bestAge)) {
      bestSum = sum; bestPlayer = player; bestAge = player.age;
    }
  }
  room.currentPlayerIndex = room.players.indexOf(bestPlayer);
  room.state = 'playing'; room.turnPhase = 'draw';
}

function checkLineElimination(player) {
  const m = player.matrix, rows = player.matrixRows, cols = player.matrixCols, eliminations = [];
  for (let r = 0; r < rows; r++) {
    if (cols >= 3) {
      const cells = []; let allFaceUp = true, allSameColor = true, firstColor = null;
      for (let c = 0; c < cols; c++) {
        if (!m[r][c] || !m[r][c].faceUp || m[r][c].card.special) { allFaceUp = false; break; }
        if (firstColor === null) firstColor = m[r][c].card.color;
        else if (m[r][c].card.color !== firstColor) allSameColor = false;
        cells.push({ r, c });
      }
      if (allFaceUp && allSameColor && cells.length >= 3) eliminations.push({ type: 'horizontal', row: r, cells });
    }
  }
  for (let c = 0; c < cols; c++) {
    if (rows >= 3) {
      const cells = []; let allFaceUp = true, allSameColor = true, firstColor = null;
      for (let r = 0; r < rows; r++) {
        if (!m[r][c] || !m[r][c].faceUp || m[r][c].card.special) { allFaceUp = false; break; }
        if (firstColor === null) firstColor = m[r][c].card.color;
        else if (m[r][c].card.color !== firstColor) allSameColor = false;
        cells.push({ r, c });
      }
      if (allFaceUp && allSameColor && cells.length >= 3) eliminations.push({ type: 'vertical', col: c, cells });
    }
  }
  if (rows === 3 && cols === 3) {
    let cells = [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }];
    let allFaceUp = cells.every(({ r, c }) => m[r][c] && m[r][c].faceUp && !m[r][c].card.special);
    let allSameColor = allFaceUp && cells.every(({ r, c }) => m[r][c].card.color === m[cells[0].r][cells[0].c].card.color);
    if (allFaceUp && allSameColor) eliminations.push({ type: 'diagonal', direction: 'main', cells });
    cells = [{ r: 0, c: 2 }, { r: 1, c: 1 }, { r: 2, c: 0 }];
    allFaceUp = cells.every(({ r, c }) => m[r][c] && m[r][c].faceUp && !m[r][c].card.special);
    allSameColor = allFaceUp && cells.every(({ r, c }) => m[r][c].card.color === m[cells[0].r][cells[0].c].card.color);
    if (allFaceUp && allSameColor) eliminations.push({ type: 'diagonal', direction: 'anti', cells });
  }
  return eliminations;
}

function performElimination(room, player, elimination) {
  const cards = elimination.cells.map(({ r, c }) => player.matrix[r][c].card);
  cards.sort((a, b) => a.value - b.value);
  for (const card of cards) room.discardPile.push(card);
  for (const { r, c } of elimination.cells) player.matrix[r][c] = null;
  if (elimination.type === 'horizontal') { player.matrix.splice(elimination.row, 1); player.matrixRows--; }
  else if (elimination.type === 'vertical') { for (let r = 0; r < player.matrix.length; r++) player.matrix[r].splice(elimination.col, 1); player.matrixCols--; }
  return cards;
}

function performDiagonalElimination(room, player, elimination, choice) {
  const cards = elimination.cells.map(({ r, c }) => player.matrix[r][c].card);
  cards.sort((a, b) => a.value - b.value);
  for (const card of cards) room.discardPile.push(card);
  for (const { r, c } of elimination.cells) player.matrix[r][c] = null;
  const remaining = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (player.matrix[r][c] !== null) remaining.push(player.matrix[r][c]);
  if (choice === '2x3') { player.matrixRows = 2; player.matrixCols = 3; player.matrix = [[remaining[0], remaining[1], remaining[2]], [remaining[3], remaining[4], remaining[5]]]; }
  else { player.matrixRows = 3; player.matrixCols = 2; player.matrix = [[remaining[0], remaining[1]], [remaining[2], remaining[3]], [remaining[4], remaining[5]]]; }
  return cards;
}

function countRemainingCards(player) {
  let count = 0;
  for (const row of player.matrix) for (const cell of row) if (cell !== null) count++;
  return count;
}

function allCardsFaceUp(player) {
  for (const row of player.matrix) for (const cell of row) if (cell !== null && !cell.faceUp) return false;
  return true;
}

function calculateScore(player) {
  let sum = 0;
  for (const row of player.matrix) for (const cell of row) if (cell !== null && !cell.card.special) sum += cell.card.value;
  return sum;
}

function endRound(room) {
  room.state = 'roundEnd';
  for (const player of room.players) for (const row of player.matrix) for (const cell of row) if (cell !== null) cell.faceUp = true;
  const scores = room.players.map(p => ({ playerId: p.id, nickname: p.nickname, rawScore: calculateScore(p), cardsLeft: countRemainingCards(p) }));
  const enderId = room.roundEnder, lowestScore = Math.min(...scores.map(s => s.rawScore));
  for (const s of scores) {
    if (s.playerId === enderId && s.rawScore > lowestScore) { s.finalScore = s.rawScore * 2; s.penalty = true; }
    else { s.finalScore = s.rawScore; s.penalty = false; }
  }
  for (const s of scores) {
    let entry = room.roundScores.find(e => e.playerId === s.playerId);
    if (!entry) { entry = { playerId: s.playerId, nickname: s.nickname, scores: [] }; room.roundScores.push(entry); }
    entry.scores.push(s.finalScore);
  }
  return scores;
}

function nextTurn(room) {
  room.drawnCard = null; room.turnPhase = 'draw'; room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  let currentRoom = null;

  socket.on('joinGame', ({ nickname, age }) => {
    const player = { id: socket.id, nickname: nickname.substring(0, 15), age: parseInt(age) || 18, matrix: [], matrixRows: 3, matrixCols: 3 };
    let room = findAvailableRoom();
    if (!room) room = createRoom();
    room.players.push(player); currentRoom = room; socket.join(room.id);
    console.log(`${nickname} joined ${room.id} (${room.players.length} players)`);
    io.to(room.id).emit('lobbyUpdate', { roomId: room.id, players: room.players.map(p => ({ id: p.id, nickname: p.nickname, age: p.age })), minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, canStart: room.players.length >= MIN_PLAYERS });
  });

  socket.on('startGame', () => {
    if (!currentRoom || currentRoom.players.length < MIN_PLAYERS || currentRoom.state !== 'waiting') return;
    const isInRoom = currentRoom.players.some(p => p.id === socket.id);
    if (!isInRoom) return;
    dealCards(currentRoom);
    for (const player of currentRoom.players) {
      const sock = io.sockets.sockets.get(player.id);
      if (sock) sock.emit('gameStarted', getRoomState(currentRoom, player.id));
    }
  });

  socket.on('flipCard', ({ row, col }) => {
    if (!currentRoom || currentRoom.state !== 'flipping') return;
    const player = currentRoom.players.find(p => p.id === socket.id);
    if (!player) return;
    const flipped = currentRoom.flippedCount[player.id] || 0;
    if (flipped >= 2) return;
    if (row < 0 || row >= player.matrixRows || col < 0 || col >= player.matrixCols) return;
    const cell = player.matrix[row][col];
    if (!cell || cell.faceUp) return;
    cell.faceUp = true; currentRoom.flippedCount[player.id] = flipped + 1;
    for (const p of currentRoom.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('cardFlipped', { playerId: player.id, row, col, card: cell.card, flippedCount: currentRoom.flippedCount[player.id] });
    }
    const allFlipped = currentRoom.players.every(p => (currentRoom.flippedCount[p.id] || 0) >= 2);
    if (allFlipped) {
      determineFirstPlayer(currentRoom);
      for (const p of currentRoom.players) {
        const sock = io.sockets.sockets.get(p.id);
        if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id));
      }
    }
  });

  socket.on('drawFromDeck', () => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'draw') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id) return;
    if (currentRoom.deck.length === 0) {
      const topCard = currentRoom.discardPile.pop();
      currentRoom.deck = shuffle(currentRoom.discardPile);
      currentRoom.discardPile = topCard ? [topCard] : [];
    }
    const card = currentRoom.deck.pop();
    currentRoom.drawnCard = card;
    currentRoom.turnPhase = card.special ? 'useSpecial' : 'place';
    io.to(currentRoom.id).emit('cardDrawn', { playerId: player.id, card, source: 'deck', deckCount: currentRoom.deck.length });
  });

  socket.on('drawFromDiscard', () => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'draw') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || currentRoom.discardPile.length === 0) return;
    const card = currentRoom.discardPile.pop();
    currentRoom.drawnCard = card;
    currentRoom.turnPhase = card.special ? 'useSpecial' : 'place';
    io.to(currentRoom.id).emit('cardDrawn', { playerId: player.id, card, source: 'discard', discardTop: currentRoom.discardPile[currentRoom.discardPile.length - 1] || null, deckCount: currentRoom.deck.length });
  });

  socket.on('placeCard', ({ row, col }) => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'place') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || !currentRoom.drawnCard) return;
    if (row < 0 || row >= player.matrixRows || col < 0 || col >= player.matrixCols) return;
    const cell = player.matrix[row][col];
    if (!cell) return;
    const oldCard = cell.card, wasFaceUp = cell.faceUp;
    cell.card = currentRoom.drawnCard; cell.faceUp = true; currentRoom.discardPile.push(oldCard);
    const placeData = { playerId: player.id, row, col, newCard: cell.card, discardedCard: oldCard, wasFaceUp, discardTop: oldCard };
    const eliminations = checkLineElimination(player);
    if (eliminations.length > 0) {
      const elim = eliminations[0];
      if (elim.type === 'diagonal') { io.to(currentRoom.id).emit('cardPlaced', placeData); socket.emit('chooseDiagonalLayout', { elimination: elim, options: ['2x3', '3x2'] }); return; }
      const eliminatedCards = performElimination(currentRoom, player, elim);
      placeData.elimination = { type: elim.type, cells: elim.cells, cards: eliminatedCards };
    }
    io.to(currentRoom.id).emit('cardPlaced', placeData);
    const hasNoCards = countRemainingCards(player) === 0, allFaceUp = !hasNoCards && allCardsFaceUp(player);
    if (hasNoCards || allFaceUp) {
      currentRoom.roundEnder = player.id;
      const scores = endRound(currentRoom);
      for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('roundEnded', { scores, roundEnder: player.id, reason: hasNoCards ? 'allEliminated' : 'allFaceUp', gameState: getRoomState(currentRoom, p.id) }); }
      return;
    }
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('useSpecialDynamite', ({ orientation, index }) => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'useSpecial') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || !currentRoom.drawnCard || currentRoom.drawnCard.special !== 'dynamite') return;
    const cells = [];
    if (orientation === 'row' && index < player.matrixRows) {
      for (let c = 0; c < player.matrixCols; c++) if (player.matrix[index][c]) cells.push({ r: index, c, card: player.matrix[index][c].card });
    } else if (orientation === 'col' && index < player.matrixCols) {
      for (let r = 0; r < player.matrixRows; r++) if (player.matrix[r][index]) cells.push({ r, c: index, card: player.matrix[r][index].card });
    }
    for (const { card } of cells) currentRoom.discardPile.push(card);
    if (orientation === 'row') { player.matrix.splice(index, 1); player.matrixRows--; }
    else { for (let r = 0; r < player.matrix.length; r++) player.matrix[r].splice(index, 1); player.matrixCols--; }
    io.to(currentRoom.id).emit('specialUsed', { type: 'dynamite', playerId: player.id, orientation, index, cells });
    const hasNoCards = countRemainingCards(player) === 0;
    if (hasNoCards) { currentRoom.roundEnder = player.id; const scores = endRound(currentRoom); for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('roundEnded', { scores, roundEnder: player.id, reason: 'allEliminated', gameState: getRoomState(currentRoom, p.id) }); } return; }
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('useSpecialColorChange', ({ targetPlayer, row, col, newColor }) => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'useSpecial') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || !currentRoom.drawnCard || currentRoom.drawnCard.special !== 'color_change') return;
    const target = currentRoom.players.find(p => p.id === targetPlayer);
    if (!target || row < 0 || row >= target.matrixRows || col < 0 || col >= target.matrixCols) return;
    const cell = target.matrix[row][col];
    if (!cell || !cell.faceUp || cell.card.special) return;
    const colorObj = COLORS.find(c => c.id === newColor);
    if (!colorObj) return;
    cell.card.color = colorObj.id; cell.card.colorHex = colorObj.hex; cell.card.colorName = colorObj.name;
    io.to(currentRoom.id).emit('specialUsed', { type: 'color_change', playerId: player.id, targetPlayer, row, col, newColor: colorObj });
    const eliminations = checkLineElimination(target);
    if (eliminations.length > 0) {
      const elim = eliminations[0];
      if (elim.type === 'diagonal') { socket.emit('chooseDiagonalLayout', { elimination: elim, options: ['2x3', '3x2'], targetPlayer }); return; }
      const eliminatedCards = performElimination(currentRoom, target, elim);
      io.to(currentRoom.id).emit('lineEliminated', { type: elim.type, cells: elim.cells, cards: eliminatedCards, playerId: targetPlayer });
    }
    const hasNoCards = countRemainingCards(target) === 0;
    if (hasNoCards) { currentRoom.roundEnder = target.id; const scores = endRound(currentRoom); for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('roundEnded', { scores, roundEnder: target.id, reason: 'allEliminated', gameState: getRoomState(currentRoom, p.id) }); } return; }
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('useSpecialBlind', ({ targetPlayer }) => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'useSpecial') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || !currentRoom.drawnCard || currentRoom.drawnCard.special !== 'blind') return;
    const target = currentRoom.players.find(p => p.id === targetPlayer);
    if (!target || target.id === player.id) return;
    const cards = [];
    for (const row of target.matrix) for (const cell of row) if (cell) { cards.push(cell.card); cell.faceUp = false; }
    const shuffled = shuffle(cards);
    let idx = 0;
    for (const row of target.matrix) for (const cell of row) if (cell) { cell.card = shuffled[idx++]; cell.faceUp = false; }
    io.to(currentRoom.id).emit('specialUsed', { type: 'blind', playerId: player.id, targetPlayer });
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('useSpecialSwap', ({ myRow, myCol, targetPlayer, targetRow, targetCol }) => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'useSpecial') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || !currentRoom.drawnCard || currentRoom.drawnCard.special !== 'swap') return;
    const target = currentRoom.players.find(p => p.id === targetPlayer);
    if (!target || myRow < 0 || myRow >= player.matrixRows || myCol < 0 || myCol >= player.matrixCols) return;
    if (targetRow < 0 || targetRow >= target.matrixRows || targetCol < 0 || targetCol >= target.matrixCols) return;
    const myCell = player.matrix[myRow][myCol], targetCell = target.matrix[targetRow][targetCol];
    if (!myCell || !targetCell) return;
    const temp = myCell.card; myCell.card = targetCell.card; targetCell.card = temp;
    io.to(currentRoom.id).emit('specialUsed', { type: 'swap', playerId: player.id, myRow, myCol, targetPlayer, targetRow, targetCol, myCard: myCell.card, targetCard: targetCell.card });
    const myElim = checkLineElimination(player), targetElim = checkLineElimination(target);
    if (myElim.length > 0) { const elim = myElim[0]; if (elim.type !== 'diagonal') { const cards = performElimination(currentRoom, player, elim); io.to(currentRoom.id).emit('lineEliminated', { type: elim.type, cells: elim.cells, cards, playerId: player.id }); } }
    if (targetElim.length > 0) { const elim = targetElim[0]; if (elim.type !== 'diagonal') { const cards = performElimination(currentRoom, target, elim); io.to(currentRoom.id).emit('lineEliminated', { type: elim.type, cells: elim.cells, cards, playerId: targetPlayer }); } }
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('diagonalChoice', ({ choice }) => {
    if (!currentRoom || currentRoom.state !== 'playing') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id) return;
    const eliminations = checkLineElimination(player);
    const diagElim = eliminations.find(e => e.type === 'diagonal');
    if (!diagElim) return;
    const eliminatedCards = performDiagonalElimination(currentRoom, player, diagElim, choice);
    io.to(currentRoom.id).emit('diagonalEliminated', { playerId: player.id, elimination: { type: 'diagonal', cells: diagElim.cells, cards: eliminatedCards }, choice, newMatrixRows: player.matrixRows, newMatrixCols: player.matrixCols });
    const hasNoCards = countRemainingCards(player) === 0, allFUp = !hasNoCards && allCardsFaceUp(player);
    if (hasNoCards || allFUp) { currentRoom.roundEnder = player.id; const scores = endRound(currentRoom); for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('roundEnded', { scores, roundEnder: player.id, reason: hasNoCards ? 'allEliminated' : 'allFaceUp', gameState: getRoomState(currentRoom, p.id) }); } return; }
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('discardDrawn', () => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'place') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || !currentRoom.drawnCard) return;
    currentRoom.discardPile.push(currentRoom.drawnCard); currentRoom.drawnCard = null; currentRoom.turnPhase = 'mustFlip';
    io.to(currentRoom.id).emit('cardDiscarded', { playerId: player.id, discardTop: currentRoom.discardPile[currentRoom.discardPile.length - 1] }); socket.emit('mustFlipCard');
  });

  socket.on('flipOwnCard', ({ row, col }) => {
    if (!currentRoom || currentRoom.state !== 'playing' || currentRoom.turnPhase !== 'mustFlip') return;
    const player = currentRoom.players[currentRoom.currentPlayerIndex];
    if (player.id !== socket.id || row < 0 || row >= player.matrixRows || col < 0 || col >= player.matrixCols) return;
    const cell = player.matrix[row][col];
    if (!cell || cell.faceUp) return;
    cell.faceUp = true;
    const flipData = { playerId: player.id, row, col, card: cell.card };
    const eliminations = checkLineElimination(player);
    if (eliminations.length > 0) { const elim = eliminations[0]; if (elim.type === 'diagonal') { io.to(currentRoom.id).emit('ownCardFlipped', flipData); socket.emit('chooseDiagonalLayout', { elimination: elim, options: ['2x3', '3x2'] }); return; } const eliminatedCards = performElimination(currentRoom, player, elim); flipData.elimination = { type: elim.type, cells: elim.cells, cards: eliminatedCards }; }
    io.to(currentRoom.id).emit('ownCardFlipped', flipData);
    const hasNoCards = countRemainingCards(player) === 0, allFUp = !hasNoCards && allCardsFaceUp(player);
    if (hasNoCards || allFUp) { currentRoom.roundEnder = player.id; const scores = endRound(currentRoom); for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('roundEnded', { scores, roundEnder: player.id, reason: hasNoCards ? 'allEliminated' : 'allFaceUp', gameState: getRoomState(currentRoom, p.id) }); } return; }
    nextTurn(currentRoom);
    for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameState', getRoomState(currentRoom, p.id)); }
  });

  socket.on('nextRound', () => {
    if (!currentRoom || currentRoom.state !== 'roundEnd') return;
    currentRoom.readyForGame.add(socket.id);
    if (currentRoom.readyForGame.size >= currentRoom.players.length) {
      currentRoom.readyForGame.clear();
      if (currentRoom.currentRound >= TOTAL_ROUNDS) { currentRoom.state = 'gameEnd'; const finalScores = currentRoom.roundScores.map(entry => ({ ...entry, total: entry.scores.reduce((a, b) => a + b, 0) })); finalScores.sort((a, b) => a.total - b.total); io.to(currentRoom.id).emit('gameOver', { finalScores }); }
      else { currentRoom.currentRound++; dealCards(currentRoom); for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameStarted', getRoomState(currentRoom, p.id)); } }
    }
  });

  socket.on('playAgain', () => {
    if (!currentRoom || currentRoom.state !== 'gameEnd') return;
    currentRoom.readyForGame.add(socket.id);
    if (currentRoom.readyForGame.size >= currentRoom.players.length) { currentRoom.readyForGame.clear(); currentRoom.currentRound = 1; currentRoom.roundScores = []; dealCards(currentRoom); for (const p of currentRoom.players) { const sock = io.sockets.sockets.get(p.id); if (sock) sock.emit('gameStarted', getRoomState(currentRoom, p.id)); } }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (currentRoom) {
      currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id); currentRoom.readyForGame.delete(socket.id);
      if (currentRoom.players.length === 0) rooms.delete(currentRoom.id);
      else {
        if (currentRoom.state === 'waiting') io.to(currentRoom.id).emit('lobbyUpdate', { roomId: currentRoom.id, players: currentRoom.players.map(p => ({ id: p.id, nickname: p.nickname, age: p.age })), minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, canStart: currentRoom.players.length >= MIN_PLAYERS });
        else { if (currentRoom.currentPlayerIndex >= currentRoom.players.length) currentRoom.currentPlayerIndex = 0; io.to(currentRoom.id).emit('playerLeft', { playerId: socket.id, remainingPlayers: currentRoom.players.length }); if (currentRoom.players.length < MIN_PLAYERS) { currentRoom.state = 'waiting'; io.to(currentRoom.id).emit('gameCancelled', { reason: 'No hay suficientes jugadores' }); } }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Cambiazo! server running on port ${PORT}`));
