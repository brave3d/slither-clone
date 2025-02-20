class Snake {
    constructor(x, y, isPlayer = false) {
        this.segments = [];
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.targetAngle = 0;
        this.speed = isPlayer ? CONFIG.PLAYER_SPEED : CONFIG.BOT_SPEED;
        this.isPlayer = isPlayer;
        this.boosting = false;
        this.color = CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];
        this.score = 0;
        this.alive = true;
        this.lastAngle = this.angle;
        this.eyeAngle = this.angle; // Add eye angle tracking
        this.baseWidth = 20;  // Base thickness of the snake
        this.maxWidth = 28;   // Reduced maximum thickness
        this.showLaser = false;  // Track laser state for this snake
        
        // Initialize segments with proper spacing and angles
        let currentX = x;
        let currentY = y;
        for(let i = 0; i < CONFIG.INITIAL_SNAKE_LENGTH; i++) {
            this.segments.push({
                x: currentX,
                y: currentY,
                angle: this.angle // Store angle for each segment
            });
            currentX -= Math.cos(this.angle) * CONFIG.SEGMENT_DISTANCE;
            currentY -= Math.sin(this.angle) * CONFIG.SEGMENT_DISTANCE;
        }
    }

    updateSpeed() {
        this.speed = this.isPlayer ? CONFIG.PLAYER_SPEED : CONFIG.BOT_SPEED;
    }

    update(mouseX, mouseY) {
        if (!this.alive) return;

        if (this.isPlayer) {
            // Calculate distance from center to mouse
            const mouseWorldX = mouseX - window.innerWidth/2;
            const mouseWorldY = mouseY - window.innerHeight/2;
            const mouseDistanceFromCenter = Math.sqrt(mouseWorldX * mouseWorldX + mouseWorldY * mouseWorldY);
            
            if (CONFIG.SAFE_WALL) {
                // Calculate current distance from center
                const distanceFromCenter = Math.sqrt(this.x * this.x + this.y * this.y);
                const radius = CONFIG.WORLD_SIZE / 2;
                
                if (distanceFromCenter >= radius) {
                    // Snake is at border - make it follow the border
                    const currentAngle = Math.atan2(this.y, this.x);
                    const mouseAngle = Math.atan2(mouseWorldY, mouseWorldX);
                    
                    // Calculate direction to move along border
                    let angleDiff = mouseAngle - currentAngle;
                    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    // Set target angle tangent to border in the direction of mouse
                    this.targetAngle = currentAngle + (angleDiff > 0 ? Math.PI/2 : -Math.PI/2);
                    
                    // Keep snake on border
                    this.x = Math.cos(currentAngle) * radius;
                    this.y = Math.sin(currentAngle) * radius;
                } else {
                    // Normal mouse following inside border
                    this.targetAngle = Math.atan2(mouseWorldY, mouseWorldX);
                }
            } else {
                // Normal mouse following when safe wall is off
                this.targetAngle = Math.atan2(mouseWorldY, mouseWorldX);
            }
        }

        // Smooth angle change with angle wrapping for head
        let headAngleDiff = this.targetAngle - this.angle;
        // Normalize angle difference to be between -PI and PI
        if (headAngleDiff > Math.PI) headAngleDiff -= Math.PI * 2;
        if (headAngleDiff < -Math.PI) headAngleDiff += Math.PI * 2;
        
        // Store last angle before updating
        this.lastAngle = this.angle;
        this.angle += headAngleDiff * CONFIG.HEAD_TURN_SPEED;
        // Normalize the angle to stay between -PI and PI
        if (this.angle > Math.PI) this.angle -= Math.PI * 2;
        if (this.angle < -Math.PI) this.angle += Math.PI * 2;

        // Update eye angle separately (faster)
        let eyeAngleDiff = this.targetAngle - this.eyeAngle;
        // Normalize eye angle difference
        if (eyeAngleDiff > Math.PI) eyeAngleDiff -= Math.PI * 2;
        if (eyeAngleDiff < -Math.PI) eyeAngleDiff += Math.PI * 2;
        this.eyeAngle += eyeAngleDiff * CONFIG.EYE_TURN_SPEED;
        // Normalize the eye angle
        if (this.eyeAngle > Math.PI) this.eyeAngle -= Math.PI * 2;
        if (this.eyeAngle < -Math.PI) this.eyeAngle += Math.PI * 2;

        // Update speed based on boost
        let currentSpeed = this.boosting ? this.speed * CONFIG.BOOST_MULTIPLIER : this.speed;

        // Update head position
        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        // Update segments with smooth following
        let prevX = this.x;
        let prevY = this.y;
        let prevAngle = this.angle;
        
        this.segments[0] = { 
            x: this.x, 
            y: this.y,
            angle: this.angle 
        };

        // Smooth segment following with angle interpolation
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const dx = segment.x - prevX;
            const dy = segment.y - prevY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > CONFIG.SEGMENT_DISTANCE) {
                // Calculate new position
                const ratio = CONFIG.SEGMENT_DISTANCE / distance;
                const newX = prevX + dx * ratio;
                const newY = prevY + dy * ratio;
                
                // Smoothly interpolate angle
                let targetAngle = Math.atan2(newY - prevY, newX - prevX);
                let angleDiff = targetAngle - segment.angle;
                if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                segment.angle += angleDiff * 0.3; // Smooth angle transition

                segment.x = newX;
                segment.y = newY;
            }
            
            prevX = segment.x;
            prevY = segment.y;
            prevAngle = segment.angle;
        }
    }

    checkCollision(otherSnake) {
        if (!this.alive || !otherSnake.alive) return false;

        // Check head collision with other snake's body
        for (let i = 1; i < otherSnake.segments.length; i++) {
            const segment = otherSnake.segments[i];
            const dx = this.x - segment.x;
            const dy = this.y - segment.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 15) { // Collision threshold
                return true;
            }
        }
        return false;
    }

    die() {
        this.alive = false;
        // Convert each segment into a food dot with moderate randomness
        return this.segments.map(segment => {
            const spreadRadius = 15; // Reduced from 30 to 15 for less spread
            const randomAngle = Math.random() * Math.PI * 2;
            const randomDistance = Math.random() * spreadRadius;
            
            return {
                x: segment.x + Math.cos(randomAngle) * randomDistance,
                y: segment.y + Math.sin(randomAngle) * randomDistance
            };
        });
    }

    draw(ctx, viewX, viewY, scale) {
        if (!this.alive) return;

        this.scale = scale;  // Store scale for laser drawing

        // Calculate snake width based on score with a very subtle growth and max limit
        const scoreMultiplier = 1 + (this.score * 0.005); // Increase by 0.5% per food eaten (reduced from 1%)
        const snakeWidth = Math.min(this.baseWidth * scoreMultiplier, this.maxWidth);
        
        ctx.beginPath();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = snakeWidth;
        ctx.lineCap = 'round';

        // Draw snake body with curved interpolation
        ctx.beginPath();
        const firstSegment = this.segments[0];
        const screenX = firstSegment.x - viewX + window.innerWidth/2;
        const screenY = firstSegment.y - viewY + window.innerHeight/2;
        ctx.moveTo(screenX, screenY);

        // Use quadratic curves to smooth the path
        for (let i = 1; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const nextSegment = this.segments[i + 1];
            const currentScreenX = segment.x - viewX + window.innerWidth/2;
            const currentScreenY = segment.y - viewY + window.innerHeight/2;

            if (i === this.segments.length - 1) {
                ctx.lineTo(currentScreenX, currentScreenY);
            } else {
                const nextScreenX = nextSegment.x - viewX + window.innerWidth/2;
                const nextScreenY = nextSegment.y - viewY + window.innerHeight/2;
                const cpX = (currentScreenX + nextScreenX) / 2;
                const cpY = (currentScreenY + nextScreenY) / 2;
                ctx.quadraticCurveTo(currentScreenX, currentScreenY, cpX, cpY);
            }
        }
        ctx.stroke();

        // Draw eyes with size proportional to snake width
        const headScreenX = this.segments[0].x - viewX + window.innerWidth/2;
        const headScreenY = this.segments[0].y - viewY + window.innerHeight/2;
        const eyeSpacing = 0.45;
        const eyeDistance = snakeWidth * 0.4; // Scale eye distance with snake width
        const eyeSize = snakeWidth * 0.25;    // Scale eye size with snake width
        const pupilSize = eyeSize * 0.6;      // Keep pupil proportional to eye

        // Draw white part of eyes
        ctx.fillStyle = 'white';
        ctx.beginPath();
        // Right eye
        ctx.arc(
            headScreenX + Math.cos(this.angle + eyeSpacing) * eyeDistance,
            headScreenY + Math.sin(this.angle + eyeSpacing) * eyeDistance,
            eyeSize, 0, Math.PI * 2
        );
        // Left eye
        ctx.arc(
            headScreenX + Math.cos(this.angle - eyeSpacing) * eyeDistance,
            headScreenY + Math.sin(this.angle - eyeSpacing) * eyeDistance,
            eyeSize, 0, Math.PI * 2
        );
        ctx.fill();

        // Draw pupils (black dots that follow mouse/movement direction)
        if (this.isPlayer) {
            // For player snake, pupils follow mouse position
            const pupilOffset = 2;
            
            ctx.fillStyle = 'black';
            ctx.beginPath();
            // Right eye pupil
            ctx.arc(
                headScreenX + Math.cos(this.angle + eyeSpacing) * eyeDistance + Math.cos(this.eyeAngle) * pupilOffset,
                headScreenY + Math.sin(this.angle + eyeSpacing) * eyeDistance + Math.sin(this.eyeAngle) * pupilOffset,
                pupilSize, 0, Math.PI * 2
            );
            // Left eye pupil
            ctx.arc(
                headScreenX + Math.cos(this.angle - eyeSpacing) * eyeDistance + Math.cos(this.eyeAngle) * pupilOffset,
                headScreenY + Math.sin(this.angle - eyeSpacing) * eyeDistance + Math.sin(this.eyeAngle) * pupilOffset,
                pupilSize, 0, Math.PI * 2
            );
            ctx.fill();
        } else {
            // For bot snakes, pupils follow movement direction
            const pupilOffset = 2;
            ctx.fillStyle = 'black';
            ctx.beginPath();
            // Right eye pupil
            ctx.arc(
                headScreenX + Math.cos(this.angle + eyeSpacing) * eyeDistance + Math.cos(this.angle) * pupilOffset,
                headScreenY + Math.sin(this.angle + eyeSpacing) * eyeDistance + Math.sin(this.angle) * pupilOffset,
                pupilSize, 0, Math.PI * 2
            );
            // Left eye pupil
            ctx.arc(
                headScreenX + Math.cos(this.angle - eyeSpacing) * eyeDistance + Math.cos(this.angle) * pupilOffset,
                headScreenY + Math.sin(this.angle - eyeSpacing) * eyeDistance + Math.sin(this.angle) * pupilOffset,
                pupilSize, 0, Math.PI * 2
            );
            ctx.fill();
        }

        // Draw laser if enabled and this is player snake
        if (this.isPlayer && (CONFIG.SHOW_LASER || this.showLaser)) {
            // Convert mouse coordinates to world space
            const mouseWorldX = this.mouseX / this.scale - window.innerWidth/(2 * this.scale) + viewX;
            const mouseWorldY = this.mouseY / this.scale - window.innerHeight/(2 * this.scale) + viewY;
            
            // Draw laser line
            ctx.beginPath();
            ctx.strokeStyle = CONFIG.LASER_COLOR;
            ctx.lineWidth = 2;
            ctx.moveTo(headScreenX, headScreenY);
            ctx.lineTo(
                mouseWorldX - viewX + window.innerWidth/2,
                mouseWorldY - viewY + window.innerHeight/2
            );
            ctx.stroke();

            // Draw glow effect
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    }
} 