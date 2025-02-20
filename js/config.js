const CONFIG = {
    WORLD_SIZE: 5000,
    CELL_SIZE: 20,
    PLAYER_SPEED: 1.5,
    BOT_SPEED: 4,
    BOOST_MULTIPLIER: 1.8,
    INITIAL_SNAKE_LENGTH: 10,
    BOT_COUNT: 100,
    FOOD_COUNT: 500,
    HEAD_TURN_SPEED: 0.05,
    EYE_TURN_SPEED: 0.3,
    SEGMENT_DISTANCE: 5,
    FOOD_SIZE: 2,
    COLORED_FOOD: false,
    SHOW_GRID: false,
    SAFE_WALL: false,
    WALL_COLOR: {
        NORMAL: '#ff0000',
        SAFE: '#00ff00'
    },
    COLORS: [
        '#ff0000', '#00ff00', '#0000ff', 
        '#ffff00', '#ff00ff', '#00ffff'
    ],
    MULTIPLAYER: {
        INTERPOLATION: true,
        UPDATE_RATE: 30,
        LERP_SPEED: 0.1,
        VIEW_DISTANCE: 1000
    },
    LASER_COLOR: '#00ff00',
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} 