const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

let gameServer;

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Basic static file server
    let filePath = req.url;
    
    // Remove query parameters for file lookup
    filePath = filePath.split('?')[0];

    // Default to index.html
    if (filePath === '/') {
        filePath = '/index.html';
    }

    // Remove leading slash and make path relative to current directory
    filePath = filePath.replace(/^\//, '');
    filePath = path.join(__dirname, filePath);

    console.log('Attempting to serve:', filePath); // Debug log

    const extname = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.wav': 'audio/wav',
    }[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            console.error(`Error serving ${filePath}:`, error);
            if(error.code === 'ENOENT') {
                res.writeHead(404);
                res.end(`File not found: ${req.url}`);
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

class GameServer {
    constructor(server) {
        // Create WebSocket server with proper options for ngrok
        this.wss = new WebSocket.Server({ 
            server,
            // Allow connections from any origin
            verifyClient: ({ origin }, callback) => {
                callback(true); // Accept all connections
            }
        });
        this.clients = new Map(); // Map of WebSocket -> Player data
        this.foods = [];
        this.lastUpdateTime = performance.now();
        this.tickRate = 30; // Reduced update rate
        this.tickInterval = 1000 / this.tickRate;
        
        this.setupServer();
        this.initializeFood();
        this.startGameLoop();
        
        console.log('Game server initialized');
    }

    setupServer() {
        this.wss.on('connection', (ws) => {
            const playerId = this.generatePlayerId();
            const playerData = this.createNewPlayer(playerId);
            this.clients.set(ws, playerData);

            // Send initial game state
            ws.send(JSON.stringify({
                type: 'init',
                playerId: playerId,
                foods: this.foods,
                players: Array.from(this.clients.values())
            }));

            // Broadcast new player to others
            this.broadcast({
                type: 'playerJoined',
                player: playerData
            }, ws);

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleMessage(ws, data);
                } catch (e) {
                    console.error('Invalid message format:', e);
                }
            });

            ws.on('close', () => {
                const playerData = this.clients.get(ws);
                this.broadcast({
                    type: 'playerLeft',
                    playerId: playerData.id
                });
                this.clients.delete(ws);
            });
        });
    }

    handleMessage(ws, message) {
        const player = this.clients.get(ws);
        if (!player) return;

        switch (message.type) {
            case 'update':
                // Update player position and state
                Object.assign(player, {
                    x: message.x,
                    y: message.y,
                    angle: message.angle,
                    segments: message.segments,
                    score: message.score
                });
                break;

            case 'died':
                // Handle player death
                player.alive = false;
                
                // Create food from dead snake segments
                const newFoods = message.foodPositions.map(pos => ({
                    x: pos.x,
                    y: pos.y,
                    fromDeadSnake: true  // Mark food as coming from dead snake
                }));
                this.foods.push(...newFoods);
                
                // Broadcast death and new food positions
                this.broadcast({
                    type: 'playerDied',
                    playerId: player.id,
                    newFoods: newFoods
                });
                
                // Close connection after 3 seconds
                setTimeout(() => {
                    ws.close();
                }, 3000);
                break;

            case 'ateFood':
                // Handle food consumption
                const foodIndex = this.foods.findIndex(f => 
                    f.x === message.food.x && f.y === message.food.y
                );
                if (foodIndex !== -1) {
                    this.foods.splice(foodIndex, 1);
                    
                    // Only spawn new food if the eaten food wasn't from a dead snake
                    if (!this.foods[foodIndex]?.fromDeadSnake) {
                        this.spawnNewFood();
                    }
                    
                    // Broadcast food update to all clients
                    this.broadcast({
                        type: 'foodUpdate',
                        foods: this.foods,
                        eatenFood: message.food
                    });
                }
                break;
        }
    }

    broadcast(message, exclude = null) {
        const messageStr = JSON.stringify(message);
        this.wss.clients.forEach(client => {
            if (client !== exclude && client.readyState === WebSocket.OPEN) {
                client.send(messageStr);
            }
        });
    }

    createNewPlayer(id) {
        const x = (Math.random() - 0.5) * CONFIG.WORLD_SIZE;
        const y = (Math.random() - 0.5) * CONFIG.WORLD_SIZE;
        return {
            id,
            x,
            y,
            angle: Math.random() * Math.PI * 2,
            segments: [],
            score: 0,
            alive: true,
            color: CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)]
        };
    }

    generatePlayerId() {
        return `player-${Math.random().toString(36).substr(2, 9)}`;
    }

    initializeFood() {
        for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
            this.spawnNewFood();
        }
    }

    spawnNewFood() {
        this.foods.push({
            x: (Math.random() - 0.5) * CONFIG.WORLD_SIZE,
            y: (Math.random() - 0.5) * CONFIG.WORLD_SIZE
        });
    }

    startGameLoop() {
        setInterval(() => {
            const currentTime = performance.now();
            
            // Send updates to all clients
            this.wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    const playerData = this.clients.get(client);
                    if (!playerData) return;

                    // Send only nearby players to reduce network traffic
                    const nearbyPlayers = Array.from(this.clients.values())
                        .filter(p => {
                            if (p.id === playerData.id) return false;
                            const dx = p.x - playerData.x;
                            const dy = p.y - playerData.y;
                            return dx * dx + dy * dy < 1000000; // Only players within 1000 units
                        })
                        .map(p => ({
                            id: p.id,
                            x: p.x,
                            y: p.y,
                            angle: p.angle,
                            segments: p.segments,
                            isOtherPlayer: true // Add flag to identify other players
                        }));

                    // Add current player to the game state with their own flag
                    const gameState = {
                        type: 'gameState',
                        currentPlayer: {
                            ...playerData,
                            isCurrentPlayer: true
                        },
                        players: nearbyPlayers,
                        timestamp: currentTime
                    };

                    client.send(JSON.stringify(gameState));
                }
            });
        }, this.tickInterval);
    }
}

// Load shared configuration
let CONFIG;
try {
    CONFIG = require('./js/config.js');
} catch (e) {
    console.error('Error loading config:', e);
    // Fallback to direct import if module require fails
    CONFIG = {
        WORLD_SIZE: 5000,
        FOOD_COUNT: 500,
        COLORS: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']
    };
}

// Graceful shutdown handler
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    if (gameServer) {
        // Close all WebSocket connections
        gameServer.wss.clients.forEach(client => {
            client.close();
        });
        gameServer.wss.close();
    }
    server.close(() => {
        console.log('Server shut down complete');
        process.exit(0);
    });
});

// Start server on port 80 for production, 8080 for development
const PORT = process.env.NODE_ENV === 'production' ? 80 : 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    gameServer = new GameServer(server);
}); 