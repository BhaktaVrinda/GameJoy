const express = require('express');
const http = require('http');
const path = require('node:path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), {
    maxAge: '30d',
    immutable: true
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

require('./gamejoy-sessions')(io, app);
app.get('/gamejoy-health', (_req, res) => res.json({ protocol: 1 }));

// ==================== MULTIPLAYER GAME DATA ====================
// Almacena información de las salas: { roomId: { seed: number, players: { socketId: { index, color } } } }
const rooms = {};

// ==================== GAMEJOY GAMEPAD DATA ====================
// Almacena controladores y PCs conectados
const controllers = {}; // { socketId: { deviceId, deviceName } }
const pcs = {};         // { socketId: { pcId, pcName } }

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // ==================== GAMEJOY GAMEPAD EVENTS ====================
    
    // Registro de controlador móvil
    socket.on('register-controller', (data) => {
        const { deviceId, deviceName } = data;
        controllers[socket.id] = { deviceId, deviceName };
        console.log(`🎮 Controlador registrado: ${deviceName} (${socket.id})`);
        
        // Notificar a todos los PCs conectados
        for (const pcSocketId in pcs) {
            io.to(pcSocketId).emit('controller-connected', {
                deviceId,
                deviceName,
                socketId: socket.id
            });
        }
        
        // Enviar estado de conexión al controlador
        socket.emit('connection-status', {
            controllersOnline: Object.keys(controllers).length,
            pcsOnline: Object.keys(pcs).length
        });
    });

    // Registro de cliente PC
    socket.on('register-pc', (data) => {
        const { pcId, pcName } = data;
        pcs[socket.id] = { pcId, pcName };
        console.log(`💻 PC registrado: ${pcName} (${socket.id})`);
        
        // Notificar a todos los controladores conectados
        for (const controllerSocketId in controllers) {
            io.to(controllerSocketId).emit('pc-connected', {
                pcId,
                pcName,
                socketId: socket.id
            });
        }
        
        // Enviar estado de conexión al PC
        socket.emit('connection-status', {
            controllersOnline: Object.keys(controllers).length,
            pcsOnline: Object.keys(pcs).length
        });
    });

    // Movimiento del joystick
    socket.on('joystick-move', (data) => {
        const { x, y, timestamp } = data;
        
        // Retransmitir a todos los PCs conectados
        for (const pcSocketId in pcs) {
            io.to(pcSocketId).emit('joystick-move', {
                x,
                y,
                timestamp,
                controllerId: socket.id
            });
        }
    });

    // Botón presionado
    socket.on('button-press', (data) => {
        const { button, timestamp } = data;
        console.log(`🔘 Botón presionado: ${button} desde ${socket.id}`);
        
        // Retransmitir a todos los PCs conectados
        for (const pcSocketId in pcs) {
            io.to(pcSocketId).emit('button-press', {
                button,
                timestamp,
                controllerId: socket.id
            });
        }
    });

    // Botón soltado
    socket.on('button-release', (data) => {
        const { button, timestamp } = data;
        console.log(`🔘 Botón soltado: ${button} desde ${socket.id}`);
        
        // Retransmitir a todos los PCs conectados
        for (const pcSocketId in pcs) {
            io.to(pcSocketId).emit('button-release', {
                button,
                timestamp,
                controllerId: socket.id
            });
        }
    });

    // Actualización de estado del PC
    socket.on('status-update', (data) => {
        const { status, gamepadConnected } = data;
        if (pcs[socket.id]) {
            pcs[socket.id].status = status;
            pcs[socket.id].gamepadConnected = gamepadConnected;
        }
    });

    // ==================== MULTIPLAYER GAME EVENTS ====================

    socket.on('join-room', (data) => {
        const { roomId, seed, color, stats, isPublic } = data;
        socket.join(roomId);

        const initialPos = [1, 1]; // Posición inicial por defecto

        if (!rooms[roomId]) {
            rooms[roomId] = {
                seed: seed,
                isPublic: !!isPublic,
                players: { [socket.id]: { index: 0, color: color || '#25d1f4', stats: stats, pos: initialPos } }
            };
            socket.emit('joined-room', { playerIndex: 0 });
            console.log(`Sala ${roomId} creada por ${socket.id} (Pública: ${!!isPublic})`);
        } else {
            const index = Object.keys(rooms[roomId].players).length;
            rooms[roomId].players[socket.id] = { index, color: color || '#ff3f34', stats: stats, pos: initialPos };

            // Enviar estado de la sala al nuevo jugador (incluyendo posiciones)
            const existingPlayers = [];
            for (const id in rooms[roomId].players) {
                if (id !== socket.id) {
                    existingPlayers.push({ id, ...rooms[roomId].players[id] });
                }
            }

            socket.emit('joined-room', {
                playerIndex: index,
                existingPlayers: existingPlayers
            });
            socket.emit('sync-seed', { seed: rooms[roomId].seed });
            console.log(`Jugador ${socket.id} unido a sala ${roomId} con índice ${index}`);
        }

        // Notificar a los demás
        socket.to(roomId).emit('player-joined', {
            id: socket.id,
            index: rooms[roomId].players[socket.id].index,
            color: rooms[roomId].players[socket.id].color,
            stats: rooms[roomId].players[socket.id].stats,
            pos: initialPos
        });
    });

    socket.on('quick-play', (data) => {
        const { color, stats } = data;
        let foundRoomId = null;
        for (const id in rooms) {
            if (rooms[id].isPublic && Object.keys(rooms[id].players).length < 2 && id !== socket.lastRoomId) {
                foundRoomId = id;
                break;
            }
        }

        if (foundRoomId) {
            socket.emit('match-found', { roomId: foundRoomId });
        } else {
            const newRoomId = Math.random().toString(36).substring(7).toUpperCase();
            socket.emit('match-found', { roomId: newRoomId, isNew: true });
        }
    });

    socket.on('get-public-rooms', () => {
        const publicRooms = [];
        for (const id in rooms) {
            if (rooms[id].isPublic && Object.keys(rooms[id].players).length < 2) {
                publicRooms.push({
                    id: id,
                    playerCount: Object.keys(rooms[id].players).length
                });
            }
        }
        socket.emit('public-rooms-list', publicRooms);
    });

    socket.on('move', (data) => {
        const { roomId, direction, pos } = data;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            if (pos) rooms[roomId].players[socket.id].pos = pos;

            socket.to(roomId).emit('player-move', {
                id: socket.id,
                direction: direction,
                pos: pos,
                playerIndex: rooms[roomId].players[socket.id].index
            });
        }
    });

    socket.on('update-stats', (data) => {
        const { roomId, completed } = data;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].completed = completed;
            socket.to(roomId).emit('player-stats-update', {
                id: socket.id,
                completed: completed
            });
        }
    });

    socket.on('objective-collect', (data) => {
        const { roomId, row, col } = data;
        console.log(`🎯 Objetivo recogido en sala ${roomId} por ${socket.id} en posición [${row}, ${col}]`);
        // Retransmitir a TODOS los jugadores en la sala (incluyendo el emisor)
        io.to(roomId).emit('objective-collect', {
            row: row,
            col: col
        });
    });

    socket.on('request-sync-seed', (data) => {
        const { roomId, seed } = data;
        if (rooms[roomId]) {
            rooms[roomId].seed = seed;
            socket.to(roomId).emit('sync-seed', { seed: seed });
        }
    });

    socket.on('player-won', (data) => {
        const { roomId } = data;
        console.log(`Jugador ${socket.id} ganó en la sala ${roomId}`);
        socket.to(roomId).emit('game-over', { winnerId: socket.id });
    });

    socket.on('rematch-request', (data) => {
        const { roomId } = data;
        socket.to(roomId).emit('rematch-offered', { from: socket.id });
    });

    socket.on('rematch-accept', (data) => {
        const { roomId } = data;
        if (rooms[roomId]) {
            const newSeed = Math.floor(Math.random() * 10000);
            rooms[roomId].seed = newSeed;
            io.to(roomId).emit('rematch-start', { seed: newSeed });
            console.log(`Revancha iniciada en sala ${roomId} con semilla ${newSeed}`);
        }
    });

    socket.on('leave-room', (data) => {
        const { roomId } = data;
        socket.lastRoomId = roomId;
        socket.leave(roomId);
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            delete rooms[roomId].players[socket.id];
            socket.to(roomId).emit('opponent-left');
            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
            }
        }
    });

    // ==================== DISCONNECT HANDLING ====================

    socket.on('disconnecting', () => {
        // Limpiar salas de juego
        for (const roomId of socket.rooms) {
            if (rooms[roomId] && rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                }
            }
        }
        
        // Limpiar controladores
        if (controllers[socket.id]) {
            console.log(`🎮 Controlador desconectado: ${controllers[socket.id].deviceName}`);
            delete controllers[socket.id];
        }
        
        // Limpiar PCs
        if (pcs[socket.id]) {
            console.log(`💻 PC desconectado: ${pcs[socket.id].pcName}`);
            delete pcs[socket.id];
        }
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📡 Socket.IO listo para GameJoy y Multiplayer`);
});
