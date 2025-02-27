function startGame(mode) {
    if (mode === 'normal') {
        const connectionStatus = document.getElementById('connectionStatus');
        connectionStatus.style.display = 'block';
        connectionStatus.style.color = 'yellow';
        connectionStatus.textContent = 'Connecting to server...';
        
        // Get the current hostname and determine if we're in development
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const isDev = host === 'localhost' || host === '127.0.0.1';
        
        // Construct WebSocket URL based on environment
        let wsUrl;
        if (host.includes('ngrok')) {
            wsUrl = `${protocol}//${host}`; // ngrok URLs
        } else if (isDev) {
            wsUrl = `${protocol}//${host}:8080`; // Local development
        } else {
            wsUrl = `${protocol}//${host}:80`; // Production with explicit port 80
        }
        
        // Create temporary WebSocket to test connection
        const testSocket = new WebSocket(wsUrl);
        
        testSocket.onopen = () => {
            testSocket.close();
            document.getElementById('startScreen').style.display = 'none';
            document.getElementById('gameCanvas').style.display = 'block';
            connectionStatus.style.display = 'none';
            
            game.resetGame();
            game.setGameMode(mode);
        };
        
        testSocket.onerror = () => {
            connectionStatus.style.color = 'red';
            connectionStatus.textContent = 'Could not connect to server. Please try again later.';
        };
    } else {
        document.getElementById('startScreen').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'block';
        
        // Reset game before starting new mode
        game.resetGame();
        game.setGameMode(mode);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();

        this.mouseX = 0;
        this.mouseY = 0;
        this.gameMode = 'normal';
        this.scale = 1.0;
        this.minScale = 0.5;
        this.maxScale = 2.0;
        
        this.player = new Snake(0, 0, true);
        this.bots = [];
        this.foods = [];
        
        this.multiplayer = null;
        this.playerId = null;
        this.otherPlayers = new Map();
        
        this.loadConfig();  // Load saved configurations
        this.setupEventListeners();
        this.setupConfigMenu();  // Setup config menu before initializing game
        this.initializeGame();
        this.gameLoop();
        
        // Simpler interpolation setup
        this.lastUpdateTime = performance.now();
        this.previousStates = new Map(); // Store just previous state
        this.currentStates = new Map();  // Store current state
        this.interpolationAlpha = 0;     // Interpolation progress
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resize());
        
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        window.addEventListener('mousedown', () => {
            this.player.boosting = true;
        });

        window.addEventListener('mouseup', () => {
            this.player.boosting = false;
        });

        window.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const newScale = this.scale - Math.sign(e.deltaY) * zoomSpeed;
            this.scale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
        }, { passive: false });

        // Update laser toggle behavior - single press of Shift to toggle
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Shift' && !e.repeat) {  // Only trigger on first press, not hold
                CONFIG.SHOW_LASER = !CONFIG.SHOW_LASER;  // Toggle laser state
                this.player.showLaser = CONFIG.SHOW_LASER;  // Update player's laser state
                const showLaser = document.getElementById('showLaser');
                showLaser.checked = CONFIG.SHOW_LASER;   // Update checkbox in config menu
            }
        });

        // Add mouse click handler for permanent laser toggle
        window.addEventListener('click', (e) => {
            if (e.shiftKey) {
                CONFIG.SHOW_LASER = !CONFIG.SHOW_LASER;  // Toggle permanent laser state
                const showLaser = document.getElementById('showLaser');
                showLaser.checked = CONFIG.SHOW_LASER;   // Update checkbox in config menu
            }
        });

        // Add safe wall toggle
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'w' && !e.repeat) {
                CONFIG.SAFE_WALL = !CONFIG.SAFE_WALL;
                const safeWall = document.getElementById('safeWall');
                safeWall.checked = CONFIG.SAFE_WALL;
            }
        });

        window.addEventListener('keydown', (e) => {
            if (!e.repeat) {
                switch (e.key) {
                    case '1':
                        // Decrease player speed
                        CONFIG.PLAYER_SPEED = Math.max(1, CONFIG.PLAYER_SPEED - 0.1);
                        const speedSliderDown = document.getElementById('playerSpeed');
                        const speedValueDown = document.getElementById('playerSpeedValue');
                        speedSliderDown.value = CONFIG.PLAYER_SPEED;
                        speedValueDown.textContent = CONFIG.PLAYER_SPEED.toFixed(1);
                        this.player.updateSpeed();
                        this.saveConfig();
                        break;
                    case '2':
                        // Increase player speed
                        CONFIG.PLAYER_SPEED = Math.min(4, CONFIG.PLAYER_SPEED + 0.1);
                        const speedSlider = document.getElementById('playerSpeed');
                        const speedValue = document.getElementById('playerSpeedValue');
                        speedSlider.value = CONFIG.PLAYER_SPEED;
                        speedValue.textContent = CONFIG.PLAYER_SPEED.toFixed(1);
                        this.player.updateSpeed();
                        this.saveConfig();
                        break;
                    case '3':
                        CONFIG.COLORED_FOOD = !CONFIG.COLORED_FOOD;
                        const coloredFoodCheckbox = document.getElementById('coloredFood');
                        coloredFoodCheckbox.checked = CONFIG.COLORED_FOOD;
                        this.foods.forEach(food => food.updateColor());
                        this.saveConfig();
                        break;
                    case '4':
                        CONFIG.FOOD_SIZE += 1;
                        if (CONFIG.FOOD_SIZE > 10) CONFIG.FOOD_SIZE = 2;
                        const foodSizeSlider = document.getElementById('foodSize');
                        const foodSizeValue = document.getElementById('foodSizeValue');
                        foodSizeSlider.value = CONFIG.FOOD_SIZE;
                        foodSizeValue.textContent = CONFIG.FOOD_SIZE;
                        this.foods.forEach(food => food.updateSize());
                        this.saveConfig();
                        break;
                    case 'g':
                    case 'G':
                        CONFIG.SHOW_GRID = !CONFIG.SHOW_GRID;
                        const showGridCheckbox = document.getElementById('showGrid');
                        showGridCheckbox.checked = CONFIG.SHOW_GRID;
                        this.saveConfig();
                        break;
                    // ... other key handlers ...
                }
            }
        });

        window.addEventListener('beforeunload', () => {
            this.saveConfig();  // Save configurations before leaving the page
        });
    }

    initializeGame() {
        // Create bots
        for(let i = 0; i < CONFIG.BOT_COUNT; i++) {
            const x = Math.random() * CONFIG.WORLD_SIZE - CONFIG.WORLD_SIZE/2;
            const y = Math.random() * CONFIG.WORLD_SIZE - CONFIG.WORLD_SIZE/2;
            this.bots.push(new Snake(x, y));
        }

        // Create food
        for(let i = 0; i < CONFIG.FOOD_COUNT; i++) {
            this.foods.push(new Food());
        }
    }

    update() {
        if (!this.player.alive) return;

        const scaledMouseX = (this.mouseX - window.innerWidth/2) / this.scale + window.innerWidth/2;
        const scaledMouseY = (this.mouseY - window.innerHeight/2) / this.scale + window.innerHeight/2;
        this.player.update(scaledMouseX, scaledMouseY);

        // Check for wall collision
        const distanceFromCenter = Math.sqrt(this.player.x ** 2 + this.player.y ** 2);
        if (distanceFromCenter > CONFIG.WORLD_SIZE / 2 && !CONFIG.SAFE_WALL) {
            // Player hit the wall and safe wall is not active, handle it like hitting another player
            const foodPositions = this.player.die();
            if (this.multiplayer?.readyState === WebSocket.OPEN) {
                this.multiplayer.send(JSON.stringify({
                    type: 'died',
                    foodPositions
                }));
            }
            
            // Show death message
            const deathMessage = document.createElement('div');
            deathMessage.className = 'death-message';
            deathMessage.innerHTML = `You died!<br>Returning to menu in 3 seconds...`;
            document.body.appendChild(deathMessage);
            
            // Return to menu after 3 seconds and reset game
            setTimeout(() => {
                document.body.removeChild(deathMessage);
                document.getElementById('gameCanvas').style.display = 'none';
                document.getElementById('startScreen').style.display = 'block';
                this.multiplayer?.close();
                this.resetGame();
            }, 3000);
        }

        // Update bots
        if (this.gameMode === 'bot') {
            this.bots.forEach((bot, index) => {
                if (bot.alive) {
                    // Calculate distance from center for bot
                    const botDistanceFromCenter = Math.sqrt(bot.x ** 2 + bot.y ** 2);
                    const borderProximity = CONFIG.WORLD_SIZE / 2 - botDistanceFromCenter;
                    
                    // Default to random movement
                    let shouldTurn = Math.random() < 0.02;
                    let turnAngle = (Math.random() - 0.5) * 0.5;

                    // Check for nearby bots and player to avoid collisions
                    for (let otherBot of this.bots) {
                        if (otherBot !== bot && otherBot.alive) {
                            const dx = bot.x - otherBot.x;
                            const dy = bot.y - otherBot.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance < 100) { // Avoidance radius
                                shouldTurn = true;
                                turnAngle = Math.atan2(dy, dx);
                                break;
                            }
                        }
                    }

                    // Avoid player snake
                    if (this.player.alive) {
                        // Check distance to player's head
                        const dxHead = bot.x - this.player.x;
                        const dyHead = bot.y - this.player.y;
                        const distanceToHead = Math.sqrt(dxHead * dxHead + dyHead * dyHead);
                        
                        if (distanceToHead < 150) { // Larger avoidance radius for player
                            shouldTurn = true;
                            turnAngle = Math.atan2(dyHead, dxHead);
                        }

                        // Check distance to player's body segments
                        for (let i = 1; i < this.player.segments.length; i++) {
                            const segment = this.player.segments[i];
                            const dx = bot.x - segment.x;
                            const dy = bot.y - segment.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance < 100) {
                                shouldTurn = true;
                                turnAngle = Math.atan2(dy, dx);
                                break;
                            }
                        }
                    }

                    // If bot is too close to border, turn away from it
                    if (borderProximity < 200) {
                        shouldTurn = true;
                        turnAngle = Math.atan2(-bot.y, -bot.x);
                    }

                    // Look for nearby food
                    let closestFood = null;
                    let closestDistance = 150; // Food detection radius
                    
                    this.foods.forEach((food, foodIndex) => {
                        const dx = food.x - bot.x;
                        const dy = food.y - bot.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestFood = { food, index: foodIndex };
                        }

                        // Check if bot can eat the food
                        if (distance < 20) {
                            this.foods.splice(foodIndex, 1);
                            bot.score += 1;
                            bot.segments.push({
                                x: bot.segments[bot.segments.length - 1].x,
                                y: bot.segments[bot.segments.length - 1].y
                            });
                            this.spawnNewFood(); // Spawn new food to maintain count
                        }
                    });

                    // If food is found and no immediate danger, go for it
                    if (closestFood && borderProximity > 200) {
                        shouldTurn = true;
                        turnAngle = Math.atan2(
                            closestFood.food.y - bot.y,
                            closestFood.food.x - bot.x
                        );
                    }

                    // Apply the calculated turn
                    if (shouldTurn) {
                        bot.targetAngle = turnAngle;
                    }

                    bot.update();

                    // Check if bot hits border
                    if (botDistanceFromCenter > CONFIG.WORLD_SIZE / 2) {
                        const foodPositions = bot.die();
                        foodPositions.forEach(pos => {
                            this.foods.push(new Food(pos.x, pos.y));
                        });
                        // Spawn new bot
                        const angle = Math.random() * Math.PI * 2;
                        const distance = CONFIG.WORLD_SIZE / 3;
                        const x = Math.cos(angle) * distance;
                        const y = Math.sin(angle) * distance;
                        this.bots[index] = new Snake(x, y);
                    }

                    // Check collisions with other bots
                    for (let otherBot of this.bots) {
                        if (otherBot !== bot && otherBot.alive) {
                            if (bot.checkCollision(otherBot)) {
                                const foodPositions = bot.die();
                                foodPositions.forEach(pos => {
                                    this.foods.push(new Food(pos.x, pos.y));
                                });
                                // Spawn new bot
                                const angle = Math.random() * Math.PI * 2;
                                const distance = CONFIG.WORLD_SIZE / 3;
                                const x = Math.cos(angle) * distance;
                                const y = Math.sin(angle) * distance;
                                this.bots[index] = new Snake(x, y);
                                break;
                            }
                        }
                    }

                    // Check collision between player and bot
                    if (this.player.checkCollision(bot)) {
                        const foodPositions = this.player.die();
                        foodPositions.forEach(pos => {
                            this.foods.push(new Food(pos.x, pos.y));
                        });
                    }

                    if (bot.checkCollision(this.player)) {
                        const foodPositions = bot.die();
                        foodPositions.forEach(pos => {
                            this.foods.push(new Food(pos.x, pos.y));
                        });
                        // Spawn new bot
                        const angle = Math.random() * Math.PI * 2;
                        const distance = CONFIG.WORLD_SIZE / 3;
                        const x = Math.cos(angle) * distance;
                        const y = Math.sin(angle) * distance;
                        this.bots[index] = new Snake(x, y);
                    }
                }
            });
        }

        // Check collisions with food
        this.foods.forEach((food, index) => {
            const dx = this.player.x - food.x;
            const dy = this.player.y - food.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Add magnetic effect when food is close
            const magnetRadius = 50; // Distance at which food starts getting attracted
            if (distance < magnetRadius) {
                // Calculate attraction strength (stronger as food gets closer)
                const attraction = (1 - distance / magnetRadius) * 2;
                // Move food towards snake head
                food.x += dx * attraction * 0.1;
                food.y += dy * attraction * 0.1;
            }

            if (distance < 20) {
                this.foods.splice(index, 1);
                this.player.score += 1;
                this.player.segments.push({
                    x: this.player.segments[this.player.segments.length - 1].x,
                    y: this.player.segments[this.player.segments.length - 1].y
                });
                this.spawnNewFood();
            }
        });

        // Also add the same effect for bot snakes:
        if (this.gameMode === 'bot') {
            this.bots.forEach(bot => {
                if (bot.alive) {
                    this.foods.forEach((food, foodIndex) => {
                        const dx = bot.x - food.x;
                        const dy = bot.y - food.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        // Add magnetic effect when food is close
                        const magnetRadius = 50;
                        if (distance < magnetRadius) {
                            const attraction = (1 - distance / magnetRadius) * 2;
                            food.x += dx * attraction * 0.1;
                            food.y += dy * attraction * 0.1;
                        }

                        if (distance < 20) {
                            this.foods.splice(foodIndex, 1);
                            bot.score += 1;
                            bot.segments.push({
                                x: bot.segments[bot.segments.length - 1].x,
                                y: bot.segments[bot.segments.length - 1].y
                            });
                            this.spawnNewFood();
                        }
                    });
                }
            });
        }

        // Store mouse position for laser drawing
        if (this.player.isPlayer) {
            this.player.mouseX = this.mouseX;
            this.player.mouseY = this.mouseY;
        }

        if (this.gameMode === 'normal' && this.multiplayer?.readyState === WebSocket.OPEN) {
            // Send player state to server
            this.multiplayer.send(JSON.stringify({
                type: 'update',
                x: this.player.x,
                y: this.player.y,
                angle: this.player.angle,
                segments: this.player.segments,
                score: this.player.score
            }));
        }

        // Update other players in multiplayer mode
        if (this.gameMode === 'normal') {
            this.otherPlayers.forEach(snake => {
                if (snake.alive) {
                    snake.update();
                    
                    // Check collisions with other players
                    if (this.player.checkCollision(snake)) {
                        const foodPositions = this.player.die();
                        if (this.multiplayer?.readyState === WebSocket.OPEN) {
                            this.multiplayer.send(JSON.stringify({
                                type: 'died',
                                foodPositions
                            }));
                        }
                        
                        // Show death message
                        const deathMessage = document.createElement('div');
                        deathMessage.className = 'death-message';
                        deathMessage.innerHTML = `You died!<br>Returning to menu in 3 seconds...`;
                        document.body.appendChild(deathMessage);
                        
                        // Return to menu after 3 seconds and reset game
                        setTimeout(() => {
                            document.body.removeChild(deathMessage);
                            document.getElementById('gameCanvas').style.display = 'none';
                            document.getElementById('startScreen').style.display = 'block';
                            this.multiplayer?.close();
                            this.resetGame();
                        }, 3000);
                    }
                }
            });
        }
    }

    drawMiniMap() {
        const miniMapSize = 150;
        const miniMapScale = miniMapSize / CONFIG.WORLD_SIZE;
        const playerX = (this.player.x + CONFIG.WORLD_SIZE / 2) * miniMapScale;
        const playerY = (this.player.y + CONFIG.WORLD_SIZE / 2) * miniMapScale;
        const centerX = 85;
        const centerY = 125;

        // Create clipping path for circular mini-map
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, miniMapSize / 2, 0, Math.PI * 2);
        this.ctx.clip();

        // Draw mini-map background
        this.ctx.fillStyle = '#333';
        this.ctx.fill();

        // Draw food positions as tiny gray dots
        this.ctx.fillStyle = '#666666';
        this.foods.forEach(food => {
            const foodX = (food.x + CONFIG.WORLD_SIZE / 2) * miniMapScale;
            const foodY = (food.y + CONFIG.WORLD_SIZE / 2) * miniMapScale;
            
            // Check if food dot is within the circular boundary
            const dx = 10 + foodX - centerX;
            const dy = 50 + foodY - centerY;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
            
            if (distanceFromCenter <= miniMapSize / 2) {
                this.ctx.beginPath();
                this.ctx.arc(10 + foodX, 50 + foodY, 0.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Draw other players' positions and segments in blue
        if (this.gameMode === 'normal') {
            this.ctx.fillStyle = '#0088ff';
            this.otherPlayers.forEach(otherPlayer => {
                if (otherPlayer.alive) {
                    // Draw all segments as small dots
                    otherPlayer.segments.forEach((segment, index) => {
                        const segX = (segment.x + CONFIG.WORLD_SIZE / 2) * miniMapScale;
                        const segY = (segment.y + CONFIG.WORLD_SIZE / 2) * miniMapScale;
                        this.ctx.beginPath();
                        // Head is slightly larger than body segments
                        const radius = index === 0 ? 2 : 1;
                        this.ctx.arc(10 + segX, 50 + segY, radius, 0, Math.PI * 2);
                        this.ctx.fill();
                    });
                }
            });
        }

        // Draw player's segments in white
        if (this.player.alive) {
            this.ctx.fillStyle = 'white';
            // Draw all player segments as small dots
            this.player.segments.forEach((segment, index) => {
                const segX = (segment.x + CONFIG.WORLD_SIZE / 2) * miniMapScale;
                const segY = (segment.y + CONFIG.WORLD_SIZE / 2) * miniMapScale;
                this.ctx.beginPath();
                // Head is slightly larger than body segments
                const radius = index === 0 ? 2 : 1;
                this.ctx.arc(10 + segX, 50 + segY, radius, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }

        // Restore the context state (removes clipping)
        this.ctx.restore();
    }

    draw() {
        this.ctx.fillStyle = '#121212';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Save the context state before applying transformations
        this.ctx.save();
        
        // Apply scaling transformation
        this.ctx.translate(this.canvas.width/2, this.canvas.height/2);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.translate(-this.canvas.width/2, -this.canvas.height/2);

        // Only draw grid if enabled
        if (CONFIG.SHOW_GRID) {
            this.drawGrid();
        }

        // Draw all game elements with proper scaling
        this.foods.forEach(food => food.draw(this.ctx, this.player.x, this.player.y));

        if (this.gameMode === 'bot') {
            this.bots.forEach(bot => bot.draw(this.ctx, this.player.x, this.player.y, this.scale));
        } else if (this.gameMode === 'normal') {
            const currentTime = performance.now();
            
            // Update interpolation alpha
            this.interpolationAlpha = Math.min(1, this.interpolationAlpha + 0.1);

            this.otherPlayers.forEach((snake, playerId) => {
                if (snake.alive) {
                    const prevState = this.previousStates.get(playerId);
                    const currentState = this.currentStates.get(playerId);

                    if (prevState && currentState) {
                        // Linear interpolation
                        snake.x = prevState.x + (currentState.x - prevState.x) * this.interpolationAlpha;
                        snake.y = prevState.y + (currentState.y - prevState.y) * this.interpolationAlpha;
                        
                        // Angle interpolation
                        let angleDiff = currentState.angle - prevState.angle;
                        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        snake.angle = prevState.angle + angleDiff * this.interpolationAlpha;

                        // Segment interpolation
                        snake.segments = prevState.segments.map((seg, i) => {
                            const targetSeg = currentState.segments[i];
                            if (!targetSeg) return seg;

                            return {
                                x: seg.x + (targetSeg.x - seg.x) * this.interpolationAlpha,
                                y: seg.y + (targetSeg.y - seg.y) * this.interpolationAlpha,
                                angle: seg.angle + (targetSeg.angle - seg.angle) * this.interpolationAlpha
                            };
                        });
                    } else if (currentState) {
                        // If no previous state, use current state directly
                        Object.assign(snake, currentState);
                    }

                    snake.draw(this.ctx, this.player.x, this.player.y, this.scale);
                }
            });
        }

        this.player.draw(this.ctx, this.player.x, this.player.y, this.scale);

        // Draw border with appropriate color
        this.ctx.strokeStyle = CONFIG.SAFE_WALL ? CONFIG.WALL_COLOR.SAFE : CONFIG.WALL_COLOR.NORMAL;
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        const borderX = -this.player.x + window.innerWidth/2;
        const borderY = -this.player.y + window.innerHeight/2;
        this.ctx.arc(borderX, borderY, CONFIG.WORLD_SIZE / 2, 0, Math.PI * 2);
        this.ctx.stroke();

        // Restore the context state
        this.ctx.restore();

        // Draw UI elements (not affected by game world scaling)
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.fillText(`Score: ${this.player.score}`, 20, 30);

        this.drawMiniMap();
    }

    drawGrid() {
        const gridSize = 50;
        const offsetX = this.player.x % gridSize;
        const offsetY = this.player.y % gridSize;

        // Make grid lines a lighter color
        this.ctx.strokeStyle = '#222222';
        this.ctx.lineWidth = 1;

        // Calculate extra grid cells needed based on zoom level
        const extraCells = Math.ceil(this.canvas.width / (gridSize * this.scale));
        const visibleWidth = this.canvas.width / this.scale;
        const visibleHeight = this.canvas.height / this.scale;

        // Draw vertical lines
        for(let x = -offsetX - (extraCells * gridSize); x < visibleWidth + (extraCells * gridSize); x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, -extraCells * gridSize);
            this.ctx.lineTo(x, visibleHeight + (extraCells * gridSize));
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for(let y = -offsetY - (extraCells * gridSize); y < visibleHeight + (extraCells * gridSize); y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(-extraCells * gridSize, y);
            this.ctx.lineTo(visibleWidth + (extraCells * gridSize), y);
            this.ctx.stroke();
        }
    }

    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    setGameMode(mode) {
        this.gameMode = mode;
        
        // Reset player position
        const x = (Math.random() - 0.5) * CONFIG.WORLD_SIZE;
        const y = (Math.random() - 0.5) * CONFIG.WORLD_SIZE;
        this.player.x = x;
        this.player.y = y;
        this.player.angle = Math.random() * Math.PI * 2;
        this.player.score = 0;
        this.player.alive = true;
        this.player.segments = [];
        
        // Initialize segments
        let currentX = x;
        let currentY = y;
        for(let i = 0; i < CONFIG.INITIAL_SNAKE_LENGTH; i++) {
            this.player.segments.push({
                x: currentX,
                y: currentY,
                angle: this.player.angle
            });
            currentX -= Math.cos(this.player.angle) * CONFIG.SEGMENT_DISTANCE;
            currentY -= Math.sin(this.player.angle) * CONFIG.SEGMENT_DISTANCE;
        }
        
        if (mode === 'normal') {
            this.setupMultiplayer();
        }
    }

    setupConfigMenu() {
        const configButton = document.getElementById('configButton');
        const configMenu = document.getElementById('configMenu');
        const coloredFood = document.getElementById('coloredFood');
        const showGrid = document.getElementById('showGrid');
        const foodSize = document.getElementById('foodSize');
        const botCount = document.getElementById('botCount');
        const foodSizeValue = document.getElementById('foodSizeValue');
        const botCountValue = document.getElementById('botCountValue');
        const playerSpeed = document.getElementById('playerSpeed');
        const botSpeed = document.getElementById('botSpeed');
        const playerSpeedValue = document.getElementById('playerSpeedValue');
        const botSpeedValue = document.getElementById('botSpeedValue');
        const headTurnSpeed = document.getElementById('headTurnSpeed');
        const eyeTurnSpeed = document.getElementById('eyeTurnSpeed');
        const headTurnSpeedValue = document.getElementById('headTurnSpeedValue');
        const eyeTurnSpeedValue = document.getElementById('eyeTurnSpeedValue');
        const showLaser = document.getElementById('showLaser');
        const safeWall = document.getElementById('safeWall');
        const foodCount = document.getElementById('foodCount');
        const foodCountValue = document.getElementById('foodCountValue');

        configButton.addEventListener('click', () => {
            configMenu.style.display = configMenu.style.display === 'none' ? 'block' : 'none';
        });

        coloredFood.addEventListener('change', (e) => {
            CONFIG.COLORED_FOOD = e.target.checked;
            this.foods.forEach(food => food.updateColor());
            this.saveConfig();
        });

        showGrid.addEventListener('change', (e) => {
            CONFIG.SHOW_GRID = e.target.checked;
            this.saveConfig();
        });

        foodSize.addEventListener('input', (e) => {
            CONFIG.FOOD_SIZE = parseInt(e.target.value);
            foodSizeValue.textContent = e.target.value;
            this.foods.forEach(food => food.updateSize());
            this.saveConfig();
        });

        botCount.addEventListener('input', (e) => {
            CONFIG.BOT_COUNT = parseInt(e.target.value);
            botCountValue.textContent = e.target.value;
            this.saveConfig();
            // Update bots array
            while (this.bots.length > CONFIG.BOT_COUNT) {
                this.bots.pop();
            }
            while (this.bots.length < CONFIG.BOT_COUNT) {
                const x = Math.random() * CONFIG.WORLD_SIZE - CONFIG.WORLD_SIZE/2;
                const y = Math.random() * CONFIG.WORLD_SIZE - CONFIG.WORLD_SIZE/2;
                this.bots.push(new Snake(x, y));
            }
        });

        playerSpeed.addEventListener('input', (e) => {
            CONFIG.PLAYER_SPEED = parseFloat(e.target.value);
            playerSpeedValue.textContent = e.target.value;
            this.player.updateSpeed();
            this.saveConfig();
        });

        botSpeed.addEventListener('input', (e) => {
            CONFIG.BOT_SPEED = parseFloat(e.target.value);
            botSpeedValue.textContent = e.target.value;
            this.bots.forEach(bot => bot.updateSpeed());
            this.saveConfig();
        });

        headTurnSpeed.addEventListener('input', (e) => {
            CONFIG.HEAD_TURN_SPEED = parseFloat(e.target.value);
            headTurnSpeedValue.textContent = e.target.value;
            this.saveConfig();
        });

        eyeTurnSpeed.addEventListener('input', (e) => {
            CONFIG.EYE_TURN_SPEED = parseFloat(e.target.value);
            eyeTurnSpeedValue.textContent = e.target.value;
            this.saveConfig();
        });

        showLaser.addEventListener('change', (e) => {
            CONFIG.SHOW_LASER = e.target.checked;
            this.saveConfig();
        });

        safeWall.addEventListener('change', (e) => {
            CONFIG.SAFE_WALL = e.target.checked;
            this.saveConfig();
        });

        foodCount.addEventListener('input', (e) => {
            CONFIG.FOOD_COUNT = parseInt(e.target.value);
            foodCountValue.textContent = e.target.value;
            this.adjustFoodCount();
            this.saveConfig();
        });
    }

    adjustFoodCount() {
        while (this.foods.length < CONFIG.FOOD_COUNT) {
            this.foods.push(new Food());
        }
        while (this.foods.length > CONFIG.FOOD_COUNT) {
            this.foods.pop();
        }
    }

    spawnNewFood() {
        while (this.foods.length < CONFIG.FOOD_COUNT) {
            this.foods.push(new Food());
        }
    }

    loadConfig() {
        const configKeys = Object.keys(CONFIG);
        configKeys.forEach(key => {
            const storedValue = localStorage.getItem(key);
            if (storedValue !== null) {
                CONFIG[key] = JSON.parse(storedValue);
            }
        });

        // Update UI elements to reflect loaded configurations
        document.getElementById('coloredFood').checked = CONFIG.COLORED_FOOD;
        document.getElementById('showGrid').checked = CONFIG.SHOW_GRID;
        document.getElementById('foodSize').value = CONFIG.FOOD_SIZE;
        document.getElementById('foodSizeValue').textContent = CONFIG.FOOD_SIZE;
        document.getElementById('botCount').value = CONFIG.BOT_COUNT;
        document.getElementById('botCountValue').textContent = CONFIG.BOT_COUNT;
        document.getElementById('playerSpeed').value = CONFIG.PLAYER_SPEED;
        document.getElementById('playerSpeedValue').textContent = CONFIG.PLAYER_SPEED;
        document.getElementById('botSpeed').value = CONFIG.BOT_SPEED;
        document.getElementById('botSpeedValue').textContent = CONFIG.BOT_SPEED;
        document.getElementById('headTurnSpeed').value = CONFIG.HEAD_TURN_SPEED;
        document.getElementById('headTurnSpeedValue').textContent = CONFIG.HEAD_TURN_SPEED;
        document.getElementById('eyeTurnSpeed').value = CONFIG.EYE_TURN_SPEED;
        document.getElementById('eyeTurnSpeedValue').textContent = CONFIG.EYE_TURN_SPEED;
        document.getElementById('showLaser').checked = CONFIG.SHOW_LASER;
        document.getElementById('safeWall').checked = CONFIG.SAFE_WALL;
        document.getElementById('foodCount').value = CONFIG.FOOD_COUNT;
        document.getElementById('foodCountValue').textContent = CONFIG.FOOD_COUNT;
    }

    saveConfig() {
        const configKeys = Object.keys(CONFIG);
        configKeys.forEach(key => {
            localStorage.setItem(key, JSON.stringify(CONFIG[key]));
        });
    }

    setupMultiplayer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const isDev = host === 'localhost' || host === '127.0.0.1';
        
        // Construct WebSocket URL based on environment
        let wsUrl;
        if (host.includes('ngrok')) {
            wsUrl = `${protocol}//${host}`; // ngrok URLs
        } else if (isDev) {
            wsUrl = `${protocol}//${host}:8080`; // Local development
        } else {
            wsUrl = `${protocol}//${host}:80`; // Production with explicit port 80
        }
        
        console.log('Connecting to:', wsUrl);
        this.multiplayer = new WebSocket(wsUrl);
        
        this.multiplayer.onopen = () => {
            console.log('Connected to server');
        };

        this.multiplayer.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Show error message to user
            const connectionStatus = document.getElementById('connectionStatus');
            connectionStatus.style.display = 'block';
            connectionStatus.style.color = 'red';
            connectionStatus.textContent = 'Connection error. Please try again.';
        };
        
        this.multiplayer.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleServerMessage(message);
        };

        this.multiplayer.onclose = () => {
            console.log('Disconnected from server');
            // Implement reconnection logic
            setTimeout(() => {
                if (this.gameMode === 'normal') {
                    console.log('Attempting to reconnect...');
                    this.setupMultiplayer();
                }
            }, 3000);
        };
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'init':
                this.playerId = message.playerId;
                this.foods = message.foods.map(f => new Food(f.x, f.y));
                message.players.forEach(p => {
                    if (p.id !== this.playerId) {
                        this.otherPlayers.set(p.id, new Snake(p.x, p.y));
                    }
                });
                break;

            case 'gameState':
                const currentTime = performance.now();
                
                message.players.forEach(p => {
                    if (p.id !== this.playerId) {
                        let snake = this.otherPlayers.get(p.id);
                        if (!snake) {
                            snake = new Snake(p.x, p.y);
                            this.otherPlayers.set(p.id, snake);
                        }

                        // Store previous state
                        const currentState = this.currentStates.get(p.id);
                        if (currentState) {
                            this.previousStates.set(p.id, { ...currentState });
                        }

                        // Update current state
                        this.currentStates.set(p.id, {
                            x: p.x,
                            y: p.y,
                            angle: p.angle,
                            segments: p.segments.map(seg => ({ ...seg })),
                            timestamp: currentTime
                        });

                        // Reset interpolation
                        this.interpolationAlpha = 0;
                    }
                });
                break;

            case 'playerJoined':
                if (message.player.id !== this.playerId) {
                    this.otherPlayers.set(
                        message.player.id,
                        new Snake(message.player.x, message.player.y)
                    );
                }
                break;

            case 'playerLeft':
                this.otherPlayers.delete(message.playerId);
                break;

            case 'foodUpdate':
                // Remove eaten food
                if (message.eatenFood) {
                    const index = this.foods.findIndex(f => 
                        f.x === message.eatenFood.x && f.y === message.eatenFood.y
                    );
                    if (index !== -1) {
                        this.foods.splice(index, 1);
                    }
                }
                
                // Update food list with server state
                this.foods = message.foods.map(f => new Food(f.x, f.y));
                break;

            case 'playerDied':
                const deadSnake = this.otherPlayers.get(message.playerId);
                if (deadSnake) {
                    deadSnake.alive = false;
                    // Add new food from dead snake
                    if (message.newFoods) {
                        message.newFoods.forEach(foodPos => {
                            this.foods.push(new Food(foodPos.x, foodPos.y));
                        });
                    }
                }
                break;
        }
    }

    resetGame() {
        // Reset player
        this.player = new Snake(0, 0, true);
        
        // Reset game state
        this.gameMode = null;
        this.scale = 1.0;
        this.foods = [];
        this.bots = [];
        this.otherPlayers = new Map();
        this.multiplayer = null;
        this.playerId = null;
        
        // Reset canvas transform
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Reinitialize game
        this.initializeGame();
    }
}

const game = new Game(); 