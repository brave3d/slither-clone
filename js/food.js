class Food {
    constructor(x = null, y = null) {
        this.color = CONFIG.COLORED_FOOD ? 
            CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)] : 
            '#666666';
        this.size = CONFIG.FOOD_SIZE;
        if (x !== null && y !== null) {
            this.x = x;
            this.y = y;
        } else {
            this.respawn();
        }
    }

    respawn() {
        this.x = Math.random() * CONFIG.WORLD_SIZE - CONFIG.WORLD_SIZE/2;
        this.y = Math.random() * CONFIG.WORLD_SIZE - CONFIG.WORLD_SIZE/2;
    }

    updateColor() {
        this.color = CONFIG.COLORED_FOOD ? 
            CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)] : 
            '#666666';
    }

    updateSize() {
        this.size = CONFIG.FOOD_SIZE;
    }

    draw(ctx, viewX, viewY) {
        const screenX = this.x - viewX + window.innerWidth/2;
        const screenY = this.y - viewY + window.innerHeight/2;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
} 