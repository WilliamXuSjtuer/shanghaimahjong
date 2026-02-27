const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();

// 启用 gzip 压缩
app.use(compression());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // 性能优化配置
    pingTimeout: 30000,        // 30秒无响应视为断开
    pingInterval: 10000,       // 10秒心跳间隔
    upgradeTimeout: 15000,     // 升级超时
    maxHttpBufferSize: 1e6,    // 限制消息大小 1MB
    perMessageDeflate: {       // 启用消息压缩
        threshold: 512,        // 超过512字节才压缩
        zlibDeflateOptions: {
            chunkSize: 16 * 1024
        },
        zlibInflateOptions: {
            windowBits: 15
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true
    },
    transports: ['websocket', 'polling'],  // 优先使用 WebSocket
    allowUpgrades: true
});

// 禁用 HTML 文件缓存，确保客户端获取最新代码
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || req.path.endsWith('/')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 提供麻将牌图片
// 优先从本地 img 目录加载，如果不存在则从单人版目录加载
const localImgPath = path.join(__dirname, 'img');
const fallbackImgPath = path.join(__dirname, '../mahjong/img');
const fs = require('fs');

if (fs.existsSync(localImgPath)) {
    app.use('/img', express.static(localImgPath));
} else {
    app.use('/img', express.static(fallbackImgPath));
}

// 游戏常量
const TILE_TYPES = ['wan', 'tiao', 'tong']; // 万、条、筒
const TILE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const WINDS = ['dong', 'nan', 'xi', 'bei']; // 东南西北
const WIND_NAMES = { dong: '东', nan: '南', xi: '西', bei: '北' };
// 花牌
const FLOWERS = ['chun', 'xia', 'qiu', 'dong_hua', 'mei', 'lan', 'zhu', 'ju']; // 春夏秋冬梅兰竹菊
const FLOWER_NAMES = {
    chun: '春', xia: '夏', qiu: '秋', dong_hua: '冬',
    mei: '梅', lan: '兰', zhu: '竹', ju: '菊'
};

// ==================== 游戏超时配置 ====================
const GAME_TIMEOUT_CONFIG = {
    // 出牌超时（毫秒）
    DISCARD_TIMEOUT_MS: 60000,
    // 动作超时（毫秒）
    ACTION_TIMEOUT_MS: 60000,
    // 下一局倒计时（秒）
    NEXT_ROUND_COUNTDOWN_SECONDS: 30,
    // AI思考延迟范围（毫秒）
    AI_THINK_DELAY_MIN: 500,
    AI_THINK_DELAY_MAX: 1000,
};

// 房间管理
const gameRooms = new Map();
const playerSockets = new Map();

// 生成6位房间号
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// 创建一副麻将牌（含花牌、中发白和东南西北）
function createDeck() {
    const deck = [];
    // 万、条、筒各4张
    for (const type of TILE_TYPES) {
        for (const value of TILE_VALUES) {
            for (let i = 0; i < 4; i++) {
                deck.push({ type, value, id: `${type}_${value}_${i}` });
            }
        }
    }
    // 中发白各4张（honor类型）
    const HONORS = ['zhong', 'fa', 'bai'];
    for (const honor of HONORS) {
        for (let i = 0; i < 4; i++) {
            deck.push({ type: 'honor', value: honor, id: `honor_${honor}_${i}` });
        }
    }
    // 东南西北各4张（wind类型）
    for (const wind of WINDS) {
        for (let i = 0; i < 4; i++) {
            deck.push({ type: 'wind', value: wind, id: `wind_${wind}_${i}` });
        }
    }
    // 花牌各1张
    for (const flower of FLOWERS) {
        deck.push({ type: 'flower', value: flower, id: `flower_${flower}` });
    }
    return deck;
}

// 检查是否是花牌（上海敲麻：中发白也算花牌）
function isFlowerTile(tile) {
    if (tile && tile.type === 'flower') return true;
    // 中发白也算花牌
    if (tile && tile.type === 'honor' && ['zhong', 'fa', 'bai'].includes(tile.value)) {
        return true;
    }
    return false;
}

// 获取花牌名称
function getFlowerName(tile) {
    return FLOWER_NAMES[tile.value] || tile.value;
}

// 洗牌
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 麻将牌排序
function sortTiles(tiles) {
    const typeOrder = { wan: 0, tiao: 1, tong: 2, wind: 3, honor: 4 };
    const windOrder = { dong: 0, nan: 1, xi: 2, bei: 3 };
    const honorOrder = { zhong: 0, fa: 1, bai: 2 };

    return [...tiles].sort((a, b) => {
        const typeA = typeOrder[a.type] ?? 99;
        const typeB = typeOrder[b.type] ?? 99;

        if (typeA !== typeB) {
            return typeA - typeB;
        }

        // 同类型内按value排序
        if (a.type === 'wind') {
            return (windOrder[a.value] ?? 0) - (windOrder[b.value] ?? 0);
        } else if (a.type === 'honor') {
            return (honorOrder[a.value] ?? 0) - (honorOrder[b.value] ?? 0);
        }
        return a.value - b.value;
    });
}

// 获取牌的显示名称
function getTileName(tile) {
    const typeNames = { wan: '万', tiao: '条', tong: '筒' };
    const numNames = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const windNames = { dong: '东', nan: '南', xi: '西', bei: '北' };
    const honorNames = { zhong: '中', fa: '发', bai: '白' };
    const flowerNames = {
        chun: '春', xia: '夏', qiu: '秋', dong_hua: '冬',
        mei: '梅', lan: '兰', zhu: '竹', ju: '菊'
    };

    if (tile.type === 'wind') {
        return windNames[tile.value] || tile.value;
    } else if (tile.type === 'honor') {
        return honorNames[tile.value] || tile.value;
    } else if (tile.type === 'flower') {
        return flowerNames[tile.value] || tile.value;
    }
    return numNames[tile.value] + typeNames[tile.type];
}

// 麻将房间类
class MahjongRoom {
    constructor(code, hostId, hostName) {
        this.code = code;
        this.hostId = hostId;
        this.players = [];
        this.gameState = null;
        this.gameRunning = false;
        this.createdAt = Date.now();
        
        // 计分系统属性
        this.totalRounds = 10;           // 总局数
        this.currentRound = 0;           // 当前局数
        this.matchScores = [0, 0, 0, 0]; // 四个玩家的累计积分
        this.roundHistory = [];          // 每局历史记录
        this.matchStarted = false;       // 比赛是否开始
        this.lastWinnerIndex = -1;       // 上局赢家（用于确定庄家）
        
        // 暂停功能属性
        this.isPaused = false;           // 游戏是否暂停
        this.pausePlayer = null;         // 暂停的玩家
        this.pauseStartTime = null;      // 暂停开始时间
        this.pauseCountdown = null;      // 取消暂停的倒计时
        this.dissolveRequest = null;     // 解散游戏请求
        this.dissolveVotes = {};         // 解散投票
        
        console.log(`房间 ${code} 已创建，房主: ${hostName}`);
    }

    // 添加玩家
    addPlayer(socket, username, avatar, voice = 'female01') {
        if (this.players.length >= 4) {
            return null;
        }
        
        // 检查是否是重连（相同用户名的离线玩家）
        const offlinePlayer = this.players.find(p => !p.isBot && p.offline && p.username === username);
        if (offlinePlayer) {
            // 重连：恢复玩家状态
            offlinePlayer.id = socket.id;
            offlinePlayer.socket = socket;
            offlinePlayer.offline = false;
            offlinePlayer.offlineTime = null;
            playerSockets.set(socket.id, this);
            
            console.log(`玩家 ${username} 重连房间 ${this.code}，座位: ${offlinePlayer.seatIndex}`);
            
            // 【新增】如果有自动解散计时器，取消它
            if (this.autoDissolveTimer) {
                clearTimeout(this.autoDissolveTimer);
                this.autoDissolveTimer = null;
                console.log(`玩家 ${username} 重连，取消房间自动解散`);
                
                // 广播取消自动解散
                this.broadcast('room_auto_dissolve_cancelled', {
                    message: '有玩家重连，房间自动解散已取消'
                });
            }
            
            // 广播玩家重连
            this.broadcast('player_reconnected', { 
                username: username, 
                seatIndex: offlinePlayer.seatIndex 
            });
            this.broadcastRoomUpdate();
            
            // 如果游戏正在进行，发送当前游戏状态并恢复控制权
            if (this.gameRunning) {
                socket.emit('game_started', {
                    gameState: this.getPlayerGameState(socket.id),
                    dealerIndex: this.gameState.dealerIndex,
                    yourSeat: offlinePlayer.seatIndex,
                    currentRound: this.currentRound,
                    totalRounds: this.totalRounds,
                    matchScores: this.matchScores,
                    isReconnect: true
                });
                
                // 【重连恢复控制权】检查是否轮到该玩家
                if (this.gameState.currentPlayerIndex === offlinePlayer.seatIndex) {
                    console.log(`玩家 ${username} 重连，正好轮到他，恢复控制权`);
                    
                    if (this.gameState.turnPhase === 'discard') {
                        // 出牌阶段：重新设置超时，给玩家时间操作
                        if (this.gameState.discardTimeout) {
                            clearTimeout(this.gameState.discardTimeout);
                        }
                        this.setDiscardTimeout(offlinePlayer);
                        
                        // 通知玩家轮到他出牌（延迟发送确保socket稳定）
                        setTimeout(() => {
                            socket.emit('your_turn', {
                                phase: 'discard',
                                message: '轮到你出牌了！'
                            });
                            // 重新发送倒计时
                            socket.emit('discard_countdown', { seconds: GAME_TIMEOUT_CONFIG.DISCARD_TIMEOUT_MS / 1000 });
                        }, 200);
                    } else if (this.gameState.turnPhase === 'draw') {
                        // 摸牌阶段：通知玩家可以摸牌
                        socket.emit('your_turn', {
                            phase: 'draw',
                            message: '轮到你摸牌了！'
                        });
                    }
                }
                
                // 检查是否有待处理的碰/杠/胡动作
                const pendingAction = this.gameState.pendingActions?.find(a => a.playerId === socket.id);
                if (pendingAction && !pendingAction.resolved) {
                    console.log(`玩家 ${username} 重连，有待处理的动作:`, pendingAction.actions);
                    socket.emit('action_available', {
                        actions: pendingAction.actions,
                        tile: pendingAction.tile
                    });
                }
            }
            
            return offlinePlayer;
        }
        
        const seatIndex = this.players.length;
        const player = {
            id: socket.id,
            username: username,
            avatar: avatar || '👤',
            voice: voice || 'female01',  // 语音类型
            socket: socket,
            ready: false,
            seatIndex: seatIndex,
            wind: WINDS[seatIndex],
            isHost: this.players.length === 0,
            isBot: false,
            hand: [],
            melds: [],
            discards: [],
            flowers: [],
            score: 0,
            isTing: false,
            isQiao: false,
            offline: false,
            offlineTime: null
        };
        
        this.players.push(player);
        playerSockets.set(socket.id, this);
        
        console.log(`玩家 ${username} 加入房间 ${this.code}，座位: ${seatIndex}`);
        this.broadcastRoomUpdate();
        
        return player;
    }

    // 添加AI玩家
    addAIPlayer() {
        if (this.players.length >= 4) return null;
        
        const seatIndex = this.players.length;
        const aiNames = ['AI小明', 'AI小红', 'AI小刚', 'AI小丽'];
        const aiAvatars = ['🤖', '🎮', '💻', '🎯'];
        
        // 动态分配 AI 语音，避开已有玩家的语音
        const allVoices = ['female01', 'female02', 'male', 'male02'];
        const usedVoices = this.players.map(p => p.voice);
        const availableVoices = allVoices.filter(v => !usedVoices.includes(v));
        // 如果没有可用的就按顺序分配
        const aiVoice = availableVoices.length > 0 
            ? availableVoices[0] 
            : allVoices[seatIndex % 4];
        
        const aiPlayer = {
            id: 'ai_' + Date.now() + '_' + seatIndex,
            username: aiNames[seatIndex] || 'AI玩家',
            avatar: aiAvatars[seatIndex] || '🤖',
            voice: aiVoice,  // 动态分配的 AI 语音
            socket: null,
            ready: true,
            seatIndex: seatIndex,
            wind: WINDS[seatIndex],
            isHost: false,
            isBot: true,
            hand: [],
            melds: [],
            discards: [],
            flowers: [],
            score: 0,
            isTing: false,
            isQiao: false
        };
        
        this.players.push(aiPlayer);
        console.log(`AI玩家 ${aiPlayer.username} 加入房间 ${this.code}`);
        this.broadcastRoomUpdate();
        
        return aiPlayer;
    }

    // 移除玩家
    removePlayer(socketId) {
        const playerIndex = this.players.findIndex(p => p.id === socketId);
        if (playerIndex !== -1) {
            const player = this.players[playerIndex];
            playerSockets.delete(socketId);
            
            // 如果游戏正在进行，只标记离线，不真正移除
            if (this.gameRunning && !player.isBot) {
                player.offline = true;
                player.offlineTime = Date.now();
                player.socket = null;
                console.log(`玩家 ${player.username} 断线，等待重连 (房间 ${this.code})`);
                
                // 广播玩家离线状态
                this.broadcast('player_offline', { 
                    username: player.username, 
                    seatIndex: player.seatIndex 
                });
                this.broadcastRoomUpdate();
                
                // 【新增】如果正好轮到断线玩家，AI立即接管
                if (this.gameState.currentPlayerIndex === player.seatIndex) {
                    console.log(`玩家 ${player.username} 断线时正好轮到他，AI接管`);
                    
                    // 清除可能存在的超时计时器
                    if (this.gameState.discardTimeout) {
                        clearTimeout(this.gameState.discardTimeout);
                        this.gameState.discardTimeout = null;
                    }
                    
                    // 延迟一点执行AI动作，给广播时间
                    setTimeout(() => {
                        if (this.gameRunning && player.offline) {
                            this.aiAction(player);
                        }
                    }, 500);
                }
                
                // 【新增】检查是否所有真人玩家都已离线
                const realPlayers = this.players.filter(p => !p.isBot);
                const onlineRealPlayers = realPlayers.filter(p => !p.offline);
                
                console.log(`房间 ${this.code} 真人玩家状态: 在线${onlineRealPlayers.length}人, 离线${realPlayers.length - onlineRealPlayers.length}人`);
                
                // 如果所有真人玩家都离线了，设置自动解散计时器
                if (onlineRealPlayers.length === 0 && !this.autoDissolveTimer) {
                    console.log(`所有真人玩家离线，房间 ${this.code} 将在30秒后自动解散`);
                    
                    // 广播房间即将解散的消息
                    this.broadcast('room_auto_dissolve_warning', {
                        countdown: 30,
                        message: '所有玩家已离线，房间将在30秒后自动解散'
                    });
                    
                    // 设置30秒自动解散计时器
                    this.autoDissolveTimer = setTimeout(() => {
                        // 检查是否已有玩家重连
                        const currentRealPlayers = this.players.filter(p => !p.isBot);
                        const currentOnlinePlayers = currentRealPlayers.filter(p => !p.offline);
                        
                        if (currentOnlinePlayers.length === 0) {
                            console.log(`房间 ${this.code} 无人重连，自动解散`);
                            this.endGameForDissolve();
                            this.cleanup();
                            gameRooms.delete(this.code);
                        } else {
                            console.log(`房间 ${this.code} 有玩家重连，取消自动解散`);
                        }
                        this.autoDissolveTimer = null;
                    }, 30000);
                }
                
                return;
            }
            
            // 游戏未开始时，真正移除玩家
            this.players.splice(playerIndex, 1);
            console.log(`玩家 ${player.username} 离开房间 ${this.code}`);
            
            // 重新分配座位
            this.players.forEach((p, idx) => {
                p.seatIndex = idx;
                p.wind = WINDS[idx];
            });
            
            // 如果房主离开，转移房主
            if (player.isHost && this.players.length > 0) {
                const newHost = this.players.find(p => !p.isBot);
                if (newHost) {
                    newHost.isHost = true;
                    this.hostId = newHost.id;
                }
            }
            
            if (this.players.filter(p => !p.isBot).length === 0) {
                this.cleanup();
                gameRooms.delete(this.code);
                console.log(`房间 ${this.code} 已解散（无真人玩家）`);
            } else {
                this.broadcastRoomUpdate();
            }
        }
    }

    // 设置玩家准备状态
    setPlayerReady(socketId, ready) {
        const player = this.players.find(p => p.id === socketId);
        if (player) {
            player.ready = ready;
            player.aiTakeover = false; // 玩家主动准备，取消AI接管标记
            
            // 如果在倒计时中，广播准备状态
            if (this.nextRoundTimer) {
                this.broadcastReadyStatus();
                
                // 检查是否全员准备
                const allReady = this.players.every(p => p.ready);
                if (allReady) {
                    console.log(`房间 ${this.code} 全员准备，立即开始`);
                    clearInterval(this.nextRoundTimer);
                    this.nextRoundTimer = null;
                    
                    setTimeout(() => {
                        if (!this.gameRunning) {
                            this.startGame();
                        }
                    }, 500);
                }
            } else {
                // 非倒计时状态（首局开始前）
                this.broadcastRoomUpdate();
                this.checkCanStart();
            }
        }
    }

    // 填充AI玩家到4人
    fillWithAI() {
        while (this.players.length < 4) {
            this.addAIPlayer();
        }
    }

    // 检查是否可以开始游戏
    checkCanStart() {
        const realPlayers = this.players.filter(p => !p.isBot);
        const allReady = realPlayers.every(p => p.ready);
        
        if (allReady && realPlayers.length >= 1 && !this.gameRunning) {
            // 填充AI到4人
            this.fillWithAI();
            
            // 延迟1秒开始游戏
            setTimeout(() => {
                if (!this.gameRunning) {
                    this.startGame();
                }
            }, 1000);
        }
    }

    // 开始游戏
    startGame() {
        if (this.gameRunning) return;
        
        // 增加局数
        this.currentRound++;
        if (!this.matchStarted) {
            this.matchStarted = true;
            this.matchScores = [0, 0, 0, 0];
            this.roundHistory = [];
        }
        
        console.log(`房间 ${this.code} 开始第 ${this.currentRound}/${this.totalRounds} 局`);
        this.gameRunning = true;
        
        // 创建并洗牌
        let deck = shuffleDeck(createDeck());
        
        // 随机庄家（第一局）或根据上局赢家确定庄家
        let dealerIndex;
        if (this.currentRound === 1) {
            dealerIndex = Math.floor(Math.random() * 4);
        } else if (this.lastWinnerIndex >= 0 && this.lastWinnerIndex < 4) {
            dealerIndex = this.lastWinnerIndex;
        } else {
            dealerIndex = Math.floor(Math.random() * 4);
        }
        
        // 初始化游戏状态
        this.gameState = {
            deck: deck,
            dealerIndex: dealerIndex,
            currentPlayerIndex: dealerIndex,
            turnPhase: 'draw', // draw, discard, action
            lastDiscard: null,
            lastDiscardPlayer: -1,
            pendingActions: [], // 等待响应的动作（碰、杠、胡）
            actionTimeout: null,
            discardTimeout: null,    // 【新增】出牌超时计时器
            lastDrawnTile: null,     // 【新增】记录最后摸的牌（用于超时自动出牌）
            roundNumber: 1,
            gameOver: false,
            waitingForQiao: false    // 【新增】是否等待敲牌确认
        };
        
        // 发牌：每人13张，庄家14张（花牌自动补花）
        this.players.forEach((player, index) => {
            player.hand = [];
            player.melds = [];
            player.discards = [];
            player.flowers = [];
            player.isTing = false;
            player.isQiao = false;
            
            // 根据庄家位置动态计算风牌（庄家为东，顺时针确定其他风牌）
            player.wind = WINDS[(index - dealerIndex + 4) % 4];
            
            const cardCount = index === dealerIndex ? 14 : 13;
            for (let i = 0; i < cardCount; i++) {
                this.drawTileForPlayer(player, true); // 发牌阶段
            }
            player.hand = sortTiles(player.hand);
        });
        
        // 广播游戏开始（包含花牌信息）
        this.broadcastGameStart();
        
        // 庄家先出牌
        this.gameState.turnPhase = 'discard';
        this.notifyCurrentPlayer();
    }

    // 广播游戏开始
    broadcastGameStart() {
        this.players.forEach(player => {
            if (player.socket) {
                player.socket.emit('game_started', {
                    gameState: this.getPlayerGameState(player.id),
                    dealerIndex: this.gameState.dealerIndex,
                    yourSeat: player.seatIndex,
                    // 计分系统信息
                    currentRound: this.currentRound,
                    totalRounds: this.totalRounds,
                    matchScores: this.matchScores
                });
            }
        });
    }

    // 获取玩家视角的游戏状态（隐藏其他玩家手牌）- 优化版
    getPlayerGameState(playerId, lightweight = false) {
        const viewingPlayer = this.players.find(p => p.id === playerId);
        
        // 轻量模式：只发送关键变化数据
        if (lightweight) {
            return {
                p: this.players.map(p => ({
                    s: p.seatIndex,           // seat
                    h: p.hand.length,         // handCount
                    d: p.discards.length,     // discardsCount
                    m: p.melds.length,        // meldsCount
                    f: p.flowers?.length || 0, // flowersCount
                    o: p.offline || false     // offline
                })),
                c: this.gameState.currentPlayerIndex,  // current
                t: this.gameState.turnPhase,           // phase
                r: this.gameState.deck.length          // remaining
            };
        }
        
        // 完整模式：初始化或需要完整数据时
        return {
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                avatar: p.avatar,
                voice: p.voice || 'female01',  // 语音类型
                seatIndex: p.seatIndex,
                wind: p.wind,
                windName: WIND_NAMES[p.wind],
                isBot: p.isBot,
                isHost: p.isHost,
                offline: p.offline || false,
                aiTakeover: p.aiTakeover || false,  // AI接管状态
                handCount: p.hand.length,
                hand: p.id === playerId ? p.hand : null,
                melds: p.melds,
                discards: p.discards,
                flowers: p.flowers,
                isTing: p.isTing,
                isQiao: p.isQiao
            })),
            currentPlayerIndex: this.gameState.currentPlayerIndex,
            turnPhase: this.gameState.turnPhase,
            lastDiscard: this.gameState.lastDiscard,
            lastDiscardPlayer: this.gameState.lastDiscardPlayer,
            deckRemaining: this.gameState.deck.length,
            dealerIndex: this.gameState.dealerIndex,
            roundNumber: this.gameState.roundNumber
        };
    }

    // 通知当前玩家行动
    notifyCurrentPlayer() {
        // 如果游戏暂停，停止通知当前玩家
        if (this.isPaused) {
            console.log(`房间 ${this.code} 游戏暂停中，停止通知当前玩家`);
            return;
        }
        
        const currentPlayer = this.players[this.gameState.currentPlayerIndex];
        
        // 清除之前的出牌超时计时器
        if (this.gameState.discardTimeout) {
            clearTimeout(this.gameState.discardTimeout);
            this.gameState.discardTimeout = null;
        }
        
        if (currentPlayer.isBot) {
            // AI玩家自动行动（无需等待）
            setTimeout(() => this.aiAction(currentPlayer), GAME_TIMEOUT_CONFIG.AI_THINK_DELAY_MIN + Math.random() * (GAME_TIMEOUT_CONFIG.AI_THINK_DELAY_MAX - GAME_TIMEOUT_CONFIG.AI_THINK_DELAY_MIN));
        } else if (currentPlayer.offline || currentPlayer.aiTakeover) {
            // 离线玩家或被AI接管的玩家当作AI处理
            setTimeout(() => this.aiAction(currentPlayer), GAME_TIMEOUT_CONFIG.AI_THINK_DELAY_MIN);
        } else {
            // 真人玩家：如果是出牌阶段，设置15秒超时
            if (this.gameState.turnPhase === 'discard') {
                this.setDiscardTimeout(currentPlayer);
            }
            // 通知真人玩家
            this.broadcastGameState();
        }
    }
    
    // 【新增】设置出牌超时
    setDiscardTimeout(player) {
        this.gameState.discardTimeout = setTimeout(() => {
            if (!this.gameRunning) return;
            if (this.gameState.turnPhase !== 'discard') return;
            if (this.gameState.currentPlayerIndex !== player.seatIndex) return;
            
            console.log(`玩家 ${player.username} 出牌超时，自动出牌`);
            this.autoDiscard(player);
        }, GAME_TIMEOUT_CONFIG.DISCARD_TIMEOUT_MS);
        
        // 通知玩家开始倒计时
        if (player.socket) {
            player.socket.emit('discard_countdown', { seconds: GAME_TIMEOUT_CONFIG.DISCARD_TIMEOUT_MS / 1000 });
        }
    }
    
    // 【新增】自动出牌（打出最后摸的牌，如果没有则打第一张）
    autoDiscard(player) {
        if (!this.gameRunning) {
            console.log('autoDiscard: 游戏未运行，跳过');
            return;
        }
        
        if (player.hand.length === 0) {
            console.log(`autoDiscard: 玩家 ${player.username} 手牌为空，可能流局`);
            // 手牌为空可能是异常情况，检查是否应该结束游戏
            if (this.gameState.deck.length === 0) {
                this.endRound('draw', -1, -1, false, false);
            }
            return;
        }
        
        // 优先打出刚摸的牌
        let tileToDiscard = this.gameState.lastDrawnTile;
        
        // 检查这张牌是否还在手牌中
        if (tileToDiscard) {
            const stillInHand = player.hand.find(t => t.id === tileToDiscard.id);
            if (!stillInHand) {
                tileToDiscard = null;
            }
        }
        
        // 如果没有记录或已不在手牌，打最后一张（刚摸的牌排序后可能在最后）
        if (!tileToDiscard) {
            tileToDiscard = player.hand[player.hand.length - 1];
        }
        
        // 执行出牌
        const tileIndex = player.hand.findIndex(t => t.id === tileToDiscard.id);
        if (tileIndex === -1) {
            console.log(`autoDiscard: 找不到要出的牌，尝试出第一张`);
            tileToDiscard = player.hand[0];
            if (!tileToDiscard) return;
        }
        
        const tile = player.hand.splice(tileIndex, 1)[0];
        player.discards.push(tile);
        player.hand = sortTiles(player.hand);
        
        this.gameState.lastDiscard = tile;
        this.gameState.lastDiscardPlayer = player.seatIndex;
        this.gameState.lastDrawnTile = null;
        
        // 广播超时自动出牌
        this.broadcast('tile_discarded', {
            playerIndex: player.seatIndex,
            tile: tile,
            tileName: getTileName(tile),
            isAutoDiscard: true  // 标记为自动出牌
        });
        
        // 通知该玩家
        if (player.socket) {
            player.socket.emit('auto_discard', { 
                tile: tile,
                message: '出牌超时，已自动打出' 
            });
        }
        
        // 检查其他玩家是否可以碰、杠、胡
        this.checkActionsAfterDiscard(tile, player.seatIndex);
    }

    // 广播游戏状态 - 带节流优化
    broadcastGameState(forceFullUpdate = false) {
        const now = Date.now();
        
        // 节流：100ms 内只发送一次（除非强制更新）
        if (!forceFullUpdate && this._lastBroadcast && now - this._lastBroadcast < 100) {
            // 延迟发送，合并多次更新
            if (this._pendingBroadcast) return;
            this._pendingBroadcast = setTimeout(() => {
                this._pendingBroadcast = null;
                this.broadcastGameState(false);
            }, 100);
            return;
        }
        
        this._lastBroadcast = now;
        
        this.players.forEach(player => {
            if (player.socket) {
                player.socket.emit('game_state_update', {
                    gameState: this.getPlayerGameState(player.id)
                });
            }
        });
    }
    
    // 发送轻量级状态更新（用于频繁更新场景）
    broadcastLightUpdate() {
        this.players.forEach(player => {
            if (player.socket) {
                player.socket.emit('light_update', 
                    this.getPlayerGameState(player.id, true)
                );
            }
        });
    }

    // 为玩家摸一张牌（处理花牌补花）
    drawTileForPlayer(player, isDealingPhase = false) {
        if (this.gameState.deck.length === 0) {
            return null;
        }
        
        let tile = this.gameState.deck.pop();
        
        // 如果是花牌，放入花牌区并继续摸
        while (isFlowerTile(tile)) {
            player.flowers.push(tile);
            
            // 游戏中广播补花事件
            if (!isDealingPhase && player.socket) {
                player.socket.emit('flower_drawn', {
                    flower: tile,
                    flowerName: getFlowerName(tile),
                    totalFlowers: player.flowers.length
                });
            }
            
            console.log(`${player.username} 摸到花牌 ${getFlowerName(tile)}，补花中...`);
            
            if (this.gameState.deck.length === 0) {
                return null;
            }
            tile = this.gameState.deck.pop();
        }
        
        player.hand.push(tile);
        return tile;
    }

    // 玩家摸牌
    playerDraw(socketId) {
        const player = this.players.find(p => p.id === socketId);
        if (!player) return;
        
        if (this.gameState.currentPlayerIndex !== player.seatIndex) {
            return { error: '不是你的回合' };
        }
        
        if (this.gameState.turnPhase !== 'draw') {
            return { error: '当前不能摸牌' };
        }
        
        if (this.gameState.deck.length === 0) {
            this.endRound('draw', -1, -1, false, false);
            return;
        }
        
        const tile = this.drawTileForPlayer(player, false);
        
        if (!tile) {
            this.endRound('draw', -1, -1, false, false);
            return;
        }
        
        // 【新增】记录刚摸的牌（用于超时自动出牌）
        this.gameState.lastDrawnTile = tile;
        
        this.gameState.turnPhase = 'discard';
        
        // 检查是否自摸胡牌（只有敲牌后才能自摸）
        if (player.isQiao && this.canHu(player.hand, player.melds)) {
            // 创建自摸胡牌的待处理动作
            this.gameState.pendingZimo = {
                playerId: player.id,
                playerIndex: player.seatIndex,
                tile: tile
            };
            
            if (player.socket) {
                player.socket.emit('action_available', {
                    playerId: player.id,
                    actions: ['hu_zimo'],
                    tile: tile
                });
            }
        }
        
        // 检查加杠（摸到的牌可以与副露中的刻子组成杠）
        const jiaGangActions = [];
        for (const meld of player.melds) {
            if (meld.type === 'peng' && meld.tiles && meld.tiles.length > 0) {
                const pengTile = meld.tiles[0];
                if (pengTile.type === tile.type && pengTile.value === tile.value) {
                    jiaGangActions.push({
                        meldIndex: player.melds.indexOf(meld),
                        tile: tile
                    });
                }
            }
        }
        
        // 如果有加杠选项且没有自摸，优先提示加杠
        if (jiaGangActions.length > 0 && !this.gameState.pendingZimo) {
            if (player.socket) {
                player.socket.emit('action_available', {
                    playerId: player.id,
                    actions: ['jia_gang'],
                    tile: tile,
                    jiaGangOptions: jiaGangActions
                });
            }
        }
        
        this.broadcastGameState();
        
        // 通知玩家摸到的牌
        if (player.socket) {
            player.socket.emit('tile_drawn', { tile: tile });
        }
        
        // 【新增】设置出牌超时（仅真人玩家）
        if (!player.isBot && !player.offline) {
            this.setDiscardTimeout(player);
        }
        
        return { success: true, tile: tile };
    }

    // 玩家出牌
    playerDiscard(socketId, tileId) {
        const player = this.players.find(p => p.id === socketId);
        if (!player) return { error: '玩家不存在' };
        
        if (this.gameState.currentPlayerIndex !== player.seatIndex) {
            return { error: '不是你的回合' };
        }
        
        if (this.gameState.turnPhase !== 'discard') {
            return { error: '当前不能出牌' };
        }
        
        // 【敲牌限制】如果已敲牌，只能打刚摸的牌
        if (player.isQiao && this.gameState.lastDrawnTile) {
            if (tileId !== this.gameState.lastDrawnTile.id) {
                return { error: '已敲牌，只能打刚摸的牌！' };
            }
        }
        
        // 【新增】清除出牌超时计时器
        if (this.gameState.discardTimeout) {
            clearTimeout(this.gameState.discardTimeout);
            this.gameState.discardTimeout = null;
        }
        
        // 清除自摸胡牌状态（玩家选择不胡而是出牌）
        if (this.gameState.pendingZimo) {
            this.gameState.pendingZimo = null;
        }
        
        const tileIndex = player.hand.findIndex(t => t.id === tileId);
        if (tileIndex === -1) {
            return { error: '没有这张牌' };
        }
        
        const tile = player.hand.splice(tileIndex, 1)[0];
        player.discards.push(tile);
        player.hand = sortTiles(player.hand);
        
        this.gameState.lastDiscard = tile;
        this.gameState.lastDiscardPlayer = player.seatIndex;
        this.gameState.lastDrawnTile = null; // 【新增】清除记录
        
        // 检查玩家是否听牌，如果听牌了则通知前端弹窗确认敲牌
        // 出牌后手牌是13张，需要检测是否听牌（差一张胡牌）
        const tingTiles = this.getTingTiles(player.hand, player.melds);
        if (!player.isTing && !player.isQiao && tingTiles.length > 0) {
            player.isTing = true;
            console.log(`玩家 ${player.username} 听牌！听：${tingTiles.map(t => t.tileName).join('、')}`);
            
            // 设置等待敲牌确认状态，暂停游戏流程
            this.gameState.waitingForQiao = true;
            
            // 设置敲牌确认超时（30秒）
            this.gameState.qiaoTimeout = setTimeout(() => {
                if (this.gameState.waitingForQiao) {
                    console.log(`玩家 ${player.username} 敲牌超时，自动敲牌`);
                    this.gameState.waitingForQiao = false;
                    player.isQiao = true;
                    
                    // 通知前端关闭敲牌弹窗
                    if (player.socket) {
                        player.socket.emit('qiao_timeout_auto_confirm', {});
                    }
                    
                    // 广播敲牌状态给所有玩家
                    this.broadcast('player_qiao', {
                        playerIndex: player.seatIndex,
                        username: player.username
                    });
                    
                    // 广播出牌
                    this.broadcast('tile_discarded', {
                        playerIndex: player.seatIndex,
                        tile: tile,
                        tileName: getTileName(tile)
                    });
                    
                    // 继续检查其他玩家动作
                    this.checkActionsAfterDiscard(tile, player.seatIndex);
                }
            }, 30000);
            
            // 通知玩家可以敲牌
            if (player.socket) {
                player.socket.emit('ting_and_qiao_prompt', {
                    message: '🎯 您已听牌！是否敲牌？',
                    tingTiles: tingTiles
                });
            }
            
            // 广播出牌（不带后续流程）
            this.broadcast('tile_discarded', {
                playerIndex: player.seatIndex,
                tile: tile,
                tileName: getTileName(tile)
            });
            
            return { success: true };
        }
        
        // 广播出牌
        this.broadcast('tile_discarded', {
            playerIndex: player.seatIndex,
            tile: tile,
            tileName: getTileName(tile)
        });
        
        // 检查其他玩家是否可以碰、杠、胡
        this.checkActionsAfterDiscard(tile, player.seatIndex);
        
        return { success: true };
    }

    // 检查出牌后其他玩家可以执行的动作
    checkActionsAfterDiscard(tile, discardPlayerIndex) {
        this.gameState.pendingActions = [];
        
        console.log(`检查出牌后动作: ${getTileName(tile)}, 出牌玩家: ${discardPlayerIndex}`);
        
        for (let i = 0; i < 4; i++) {
            if (i === discardPlayerIndex) continue;
            
            const player = this.players[i];
            // 跳过不存在的玩家
            if (!player) continue;
            
            const actions = [];
            
            // 检查胡牌（只有敲牌后才能胡牌）
            const testHand = [...player.hand, tile];
            if (player.isQiao && this.canHu(testHand, player.melds)) {
                actions.push('hu');
            }
            
            // 检查杠（有3张相同的牌）
            const sameCount = player.hand.filter(t => 
                t.type === tile.type && t.value === tile.value
            ).length;
            
            console.log(`玩家 ${player.username} 手中有 ${sameCount} 张 ${getTileName(tile)}, isBot=${player.isBot}, socket=${!!player.socket}, offline=${player.offline}`);
            
            if (sameCount === 3) {
                actions.push('gang');
            }
            
            // 检查碰（有2张相同的牌，且未听牌）
            if (sameCount >= 2 && !player.isTing) {
                actions.push('peng');
            }
            
            // 检查吃牌（只能吃上家的牌，且未听牌，只能吃数字牌）
            if (!player.isTing) {
                // 计算该玩家是否是上家的下家（即打牌者的下家，可以吃上家的牌）
                // 上家是 (discardPlayerIndex + 3) % 4，下家是 (discardPlayerIndex + 1) % 4
                const isNextPlayer = (discardPlayerIndex + 1) % 4 === i;
                
                if (isNextPlayer && this.canChi(tile, player.hand)) {
                    const chiOptions = this.getChiOptions(tile, player.hand, discardPlayerIndex);
                    if (chiOptions.length > 0) {
                        actions.push('chi');
                    }
                }
            }
            
            if (actions.length > 0) {
                console.log(`玩家 ${player.username} 可执行: ${actions.join(', ')}`);
                const chiOptions = actions.includes('chi') ? this.getChiOptions(tile, player.hand, discardPlayerIndex) : undefined;
                this.gameState.pendingActions.push({
                    playerIndex: i,
                    playerId: player.id,
                    actions: actions,
                    tile: tile,
                    chiOptions: chiOptions
                });
            }
        }
        
        console.log(`总共 ${this.gameState.pendingActions.length} 个待处理动作`);
        
        if (this.gameState.pendingActions.length > 0) {
            // 有玩家可以执行动作，等待响应
            this.gameState.turnPhase = 'action';
            this.notifyPendingActions();
            
            // 设置超时
            this.gameState.actionTimeout = setTimeout(() => {
                console.log('动作超时，自动解析');
                this.resolveActions();
            }, GAME_TIMEOUT_CONFIG.ACTION_TIMEOUT_MS);
        } else {
            // 没有动作，轮到下家
            this.nextTurn();
        }
    }
    
    // 检查是否可以吃牌（只能吃数字牌）
    canChi(tile, hand) {
        if (tile.type !== 'wan' && tile.type !== 'tiao' && tile.type !== 'tong') {
            return false;
        }
        return this.getChiOptions(tile, hand).length > 0;
    }
    
    // 获取吃牌选项
    getChiOptions(tile, hand, fromPlayerIndex = null) {
        const options = [];
        const value = tile.value;
        const type = tile.type;
        
        // 吃上家：只能是上家打出的牌
        // 顺子组合：可以吃 (value-2, value-1, value), (value-1, value, value+1), (value, value+1, value+2)
        
        // 情况1：吃 边张（value-2, value-1）← tile
        if (value >= 3) {
            const left1 = hand.find(t => t.type === type && t.value === value - 2);
            const left2 = hand.find(t => t.type === type && t.value === value - 1);
            if (left1 && left2) {
                options.push({
                    type: 'chi',
                    tiles: [left1, left2, tile],
                    pattern: '边张',
                    from: fromPlayerIndex
                });
            }
        }
        
        // 情况2：吃 嵌张（value-1, value, value+1）
        if (value >= 2 && value <= 8) {
            const mid = hand.find(t => t.type === type && t.value === value - 1);
            const right = hand.find(t => t.type === type && t.value === value + 1);
            if (mid && right) {
                options.push({
                    type: 'chi',
                    tiles: [mid, tile, right],
                    pattern: '嵌张',
                    from: fromPlayerIndex
                });
            }
        }
        
        // 情况3：吃 边张（value, value+1, value+2）→
        if (value <= 7) {
            const right1 = hand.find(t => t.type === type && t.value === value + 1);
            const right2 = hand.find(t => t.type === type && t.value === value + 2);
            if (right1 && right2) {
                options.push({
                    type: 'chi',
                    tiles: [tile, right1, right2],
                    pattern: '边张',
                    from: fromPlayerIndex
                });
            }
        }
        
        return options;
    }

    // 通知等待动作的玩家
    notifyPendingActions() {
        let hasHumanPending = false;
        
        this.gameState.pendingActions.forEach(action => {
            const player = this.players[action.playerIndex];
            
            if (player.isBot) {
                // AI决策（延迟执行）
                setTimeout(() => {
                    if (this.gameRunning && !action.resolved) {
                        this.aiDecideAction(player, action);
                    }
                }, 500 + Math.random() * 1000);
            } else if (player.offline || !player.socket || player.aiTakeover) {
                // 离线玩家或被AI接管的玩家自动过
                console.log(`玩家 ${player.username} 离线/AI接管，自动过`);
                action.resolved = true;
                action.action = 'pass';
            } else {
                // 真人玩家
                hasHumanPending = true;
                console.log(`通知玩家 ${player.username} 可执行动作:`, action.actions);
                const emitData = {
                    actions: action.actions,
                    tile: action.tile
                };
                // 如果有吃牌选项，也一并发送
                if (action.chiOptions) {
                    emitData.chiOptions = action.chiOptions;
                }
                player.socket.emit('action_available', emitData);
            }
        });
        
        this.broadcastGameState();
        
        // 只有在没有真人等待时才检查是否可以立即解析
        if (!hasHumanPending && this.gameState.pendingActions.every(a => a.resolved)) {
            clearTimeout(this.gameState.actionTimeout);
            setTimeout(() => this.resolveActions(), 100);
        }
    }

    // 玩家执行动作（碰、杠、胡、过）
    playerAction(socketId, actionType, extraData = {}) {
        const player = this.players.find(p => p.id === socketId);
        if (!player) return { error: '玩家不存在' };
        
        // 处理自摸胡牌
        if (actionType === 'hu_zimo') {
            if (this.gameState.pendingZimo && this.gameState.pendingZimo.playerId === socketId) {
                console.log(`玩家 ${player.username} 自摸胡牌！`);
                // 清除超时计时器
                if (this.gameState.discardTimeout) {
                    clearTimeout(this.gameState.discardTimeout);
                    this.gameState.discardTimeout = null;
                }
                // 执行自摸胡牌
                this.endRound('hu', player.seatIndex, -1, true, false);
                this.gameState.pendingZimo = null;
                return { success: true };
            } else {
                return { error: '不能自摸胡牌' };
            }
        }
        
        const pendingAction = this.gameState.pendingActions.find(a => a.playerId === socketId);
        if (!pendingAction) {
            return { error: '没有可执行的动作' };
        }
        
        if (actionType === 'pass') {
            // 标记为已处理
            pendingAction.resolved = true;
            pendingAction.action = 'pass';
        } else if (pendingAction.actions.includes(actionType)) {
            pendingAction.resolved = true;
            pendingAction.action = actionType;
            
            // 如果是吃牌，保存玩家选择的吃牌选项索引
            if (actionType === 'chi' && extraData.selectedChiIndex !== undefined) {
                pendingAction.selectedChiIndex = extraData.selectedChiIndex;
            }
        } else {
            return { error: '无效的动作' };
        }
        
        // 检查是否所有动作都已处理
        if (this.gameState.pendingActions.every(a => a.resolved)) {
            clearTimeout(this.gameState.actionTimeout);
            this.resolveActions();
        }
        
        return { success: true };
    }

    // 解析所有动作，执行优先级最高的
    resolveActions() {
        // 通知所有玩家隐藏动作按钮
        this.broadcast('action_timeout', {});
        
        // 【修复】将所有未处理的动作自动标记为 pass
        for (const action of this.gameState.pendingActions) {
            if (!action.resolved) {
                console.log(`玩家 ${action.playerIndex} 超时未操作，自动过`);
                action.resolved = true;
                action.action = 'pass';
            }
        }
        
        // 优先级：胡 > 杠 > 碰 > 吃 > pass
        const priority = { hu: 4, gang: 3, peng: 2, chi: 1, pass: 0 };
        
        let bestAction = null;
        for (const action of this.gameState.pendingActions) {
            const actionPriority = priority[action.action] || 0;
            if (!bestAction || actionPriority > priority[bestAction.action]) {
                bestAction = action;
            }
        }
        
        if (bestAction && bestAction.action !== 'pass') {
            this.executeAction(bestAction);
        } else {
            this.nextTurn();
        }
        
        this.gameState.pendingActions = [];
    }

    // 执行动作
    executeAction(action) {
        const player = this.players[action.playerIndex];
        const tile = action.tile;
        
        if (action.action === 'hu') {
            // 胡牌
            player.hand.push(tile);
            this.endGame(`${player.username} 胡牌！`);
            
        } else if (action.action === 'peng') {
            // 碰
            const sameTiles = player.hand.filter(t => 
                t.type === tile.type && t.value === tile.value
            ).slice(0, 2);
            
            // 从手牌移除
            sameTiles.forEach(t => {
                const idx = player.hand.findIndex(h => h.id === t.id);
                if (idx !== -1) player.hand.splice(idx, 1);
            });
            
            // 添加到副露
            player.melds.push({
                type: 'peng',
                tiles: [...sameTiles, tile],
                from: this.gameState.lastDiscardPlayer
            });
            
            // 从弃牌堆移除
            const discardPlayer = this.players[this.gameState.lastDiscardPlayer];
            discardPlayer.discards.pop();
            
            // 轮到碰的玩家出牌
            this.gameState.currentPlayerIndex = action.playerIndex;
            this.gameState.turnPhase = 'discard';
            
            this.broadcast('action_executed', {
                playerIndex: action.playerIndex,
                action: 'peng',
                tile: tile,
                tileName: getTileName(tile)
            });
            
            this.broadcastGameState();
            this.notifyCurrentPlayer();
            
        } else if (action.action === 'gang') {
            // 杠
            const sameTiles = player.hand.filter(t => 
                t.type === tile.type && t.value === tile.value
            );
            
            sameTiles.forEach(t => {
                const idx = player.hand.findIndex(h => h.id === t.id);
                if (idx !== -1) player.hand.splice(idx, 1);
            });
            
            player.melds.push({
                type: 'gang',
                tiles: [...sameTiles, tile],
                from: this.gameState.lastDiscardPlayer
            });
            
            const discardPlayer = this.players[this.gameState.lastDiscardPlayer];
            discardPlayer.discards.pop();
            
            this.broadcast('action_executed', {
                playerIndex: action.playerIndex,
                action: 'gang',
                tile: tile,
                tileName: getTileName(tile)
            });
            
            // 杠后摸一张牌
            this.gameState.currentPlayerIndex = action.playerIndex;
            this.gameState.turnPhase = 'draw';
            
            this.broadcastGameState();
            this.notifyCurrentPlayer();
            
        } else if (action.action === 'chi') {
            // 吃牌
            let selectedOption = null;
            
            // 如果有多个吃牌选项，使用玩家选择的
            if (action.chiOptions && action.chiOptions.length > 0) {
                if (action.selectedChiIndex !== undefined && action.chiOptions[action.selectedChiIndex]) {
                    selectedOption = action.chiOptions[action.selectedChiIndex];
                } else {
                    // 默认选择第一个选项
                    selectedOption = action.chiOptions[0];
                }
            }
            
            if (!selectedOption || !selectedOption.tiles) {
                console.log('吃牌失败：找不到有效的吃牌选项');
                return;
            }
            
            const chiTiles = selectedOption.tiles;
            
            // 从手牌中移除吃牌的两张牌（保留打出的那张，即 tile）
            const tilesToRemove = chiTiles.filter(t => t.id !== tile.id);
            tilesToRemove.forEach(t => {
                const idx = player.hand.findIndex(h => h.id === t.id);
                if (idx !== -1) player.hand.splice(idx, 1);
            });
            
            // 将打出的牌加入顺子
            player.melds.push({
                type: 'chi',
                tiles: chiTiles,
                from: this.gameState.lastDiscardPlayer
            });
            
            // 从弃牌堆移除
            const discardPlayer = this.players[this.gameState.lastDiscardPlayer];
            discardPlayer.discards.pop();
            
            this.broadcast('action_executed', {
                playerIndex: action.playerIndex,
                action: 'chi',
                tile: tile,
                tileName: getTileName(tile)
            });
            
            // 轮到吃的玩家出牌
            this.gameState.currentPlayerIndex = action.playerIndex;
            this.gameState.turnPhase = 'discard';
            
            this.broadcastGameState();
            this.notifyCurrentPlayer();
            
        } else if (action.action === 'jia_gang') {
            // 加杠：摸到的牌与副露中的刻子组成杠
            const jiaGangOptions = action.jiaGangOptions || [];
            let meldIndex = -1;
            
            if (jiaGangOptions.length === 1) {
                meldIndex = jiaGangOptions[0].meldIndex;
            } else if (jiaGangOptions.length > 1 && action.selectedMeldIndex !== undefined) {
                meldIndex = action.selectedMeldIndex;
            }
            
            if (meldIndex === -1 || !player.melds[meldIndex]) {
                console.log('加杠失败：找不到对应的刻子副露');
                return;
            }
            
            const meld = player.melds[meldIndex];
            meld.type = 'gang';
            meld.from = player.seatIndex;
            meld.tiles.push(tile);
            
            this.broadcast('action_executed', {
                playerIndex: action.playerIndex,
                action: 'jia_gang',
                tile: tile,
                tileName: getTileName(tile)
            });
            
            // 杠后摸一张牌
            this.gameState.currentPlayerIndex = action.playerIndex;
            this.gameState.turnPhase = 'draw';
            
            this.broadcastGameState();
            
            // 检查加杠后是否自摸
            setTimeout(() => {
                if (this.gameRunning) {
                    const newTile = this.drawTileForPlayer(player, false);
                    if (!newTile) {
                        this.endRound('draw', -1, -1, false, false);
                        return;
                    }
                    
                    this.broadcastGameState();
                    
                    if (player.isQiao && this.canHu(player.hand, player.melds)) {
                        this.gameState.pendingZimo = {
                            playerId: player.id,
                            playerIndex: player.seatIndex,
                            tile: newTile
                        };
                        
                        if (player.socket) {
                            player.socket.emit('action_available', {
                                playerId: player.id,
                                actions: ['hu_zimo'],
                                tile: newTile
                            });
                        }
                    } else {
                        // 没有自摸，通知玩家出牌
                        this.gameState.turnPhase = 'discard';
                        this.notifyCurrentPlayer();
                    }
                }
            }, 300);
        }
    }

    // 下一个玩家回合
    nextTurn() {
        this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % 4;
        this.gameState.turnPhase = 'draw';
        this.gameState.lastDiscard = null;
        
        this.broadcastGameState();
        this.notifyCurrentPlayer();
    }

    // AI行动
    aiAction(aiPlayer) {
        if (!this.gameRunning) {
            console.log('aiAction: 游戏未运行，跳过');
            return;
        }
        
        console.log(`aiAction: 玩家 ${aiPlayer.username} 开始AI行动, 阶段: ${this.gameState.turnPhase}`);
        
        if (this.gameState.turnPhase === 'draw') {
            // 摸牌（包含补花逻辑）
            if (this.gameState.deck.length === 0) {
                this.endRound('draw', -1, -1, false, false);
                return;
            }
            
            const tile = this.drawTileForPlayer(aiPlayer, false);
            
            if (!tile) {
                this.endRound('draw', -1, -1, false, false);
                return;
            }
            
            // 广播 AI 摸牌（如果有补花也会在 drawTileForPlayer 中处理）
            this.broadcast('ai_draw', {
                playerIndex: aiPlayer.seatIndex,
                playerName: aiPlayer.username,
                flowerCount: aiPlayer.flowers.length
            });
            
            // 检查自摸（只有敲牌后才能自摸）
            if (aiPlayer.isQiao && this.canHu(aiPlayer.hand, aiPlayer.melds)) {
                const winnerIndex = aiPlayer.seatIndex;
                this.endRound('hu', winnerIndex, -1, true, false);
                return;
            }
            
            // 检查加杠
            let shouldJiaGang = false;
            for (const meld of aiPlayer.melds) {
                if (meld.type === 'peng' && meld.tiles && meld.tiles.length > 0) {
                    const pengTile = meld.tiles[0];
                    if (pengTile.type === tile.type && pengTile.value === tile.value) {
                        shouldJiaGang = true;
                        break;
                    }
                }
            }
            
            if (shouldJiaGang) {
                console.log(`AI ${aiPlayer.username} 执行加杠`);
                const meldIndex = aiPlayer.melds.findIndex(m => 
                    m.type === 'peng' && m.tiles && m.tiles[0].type === tile.type && m.tiles[0].value === tile.value
                );
                if (meldIndex !== -1) {
                    const meld = aiPlayer.melds[meldIndex];
                    meld.type = 'gang';
                    meld.from = aiPlayer.seatIndex;
                    meld.tiles.push(tile);
                    
                    this.broadcast('action_executed', {
                        playerIndex: aiPlayer.seatIndex,
                        action: 'jia_gang',
                        tile: tile,
                        tileName: getTileName(tile)
                    });
                    
                    // 杠后摸一张牌
                    const newTile = this.drawTileForPlayer(aiPlayer, false);
                    if (!newTile) {
                        this.endRound('draw', -1, -1, false, false);
                        return;
                    }
                    
                    this.broadcastGameState();
                    
                    // 检查加杠后是否自摸
                    if (aiPlayer.isQiao && this.canHu(aiPlayer.hand, aiPlayer.melds)) {
                        const winnerIndex = aiPlayer.seatIndex;
                        this.endRound('hu', winnerIndex, -1, true, true);
                        return;
                    }
                    
                    // 加杠后出牌
                    setTimeout(() => {
                        if (this.gameRunning) {
                            this.aiDiscard(aiPlayer);
                        }
                    }, 500 + Math.random() * 500);
                    return;
                }
            }
            
            this.gameState.turnPhase = 'discard';
            
            // AI出牌策略：出最不需要的牌
            setTimeout(() => {
                if (this.gameRunning) {
                    this.aiDiscard(aiPlayer);
                }
            }, 500 + Math.random() * 500);
            
        } else if (this.gameState.turnPhase === 'discard') {
            this.aiDiscard(aiPlayer);
        }
    }

    // AI出牌
    aiDiscard(aiPlayer) {
        // 检查游戏是否还在运行
        if (!this.gameRunning) {
            console.log('aiDiscard: 游戏未运行，跳过');
            return;
        }
        
        // 检查玩家是否还有效
        if (!aiPlayer || !aiPlayer.hand || aiPlayer.hand.length === 0) {
            console.log('aiDiscard: 玩家无效或手牌为空，跳过');
            return;
        }
        
        // 简单策略：出孤张或边张
        const hand = [...aiPlayer.hand];
        let discardTile = null;
        
        // 统计每种牌的数量
        const counts = {};
        hand.forEach(t => {
            const key = `${t.type}_${t.value}`;
            counts[key] = (counts[key] || 0) + 1;
        });
        
        // 优先出孤张
        for (const tile of hand) {
            const key = `${tile.type}_${tile.value}`;
            if (counts[key] === 1) {
                // 检查是否是边张
                const leftKey = `${tile.type}_${tile.value - 1}`;
                const rightKey = `${tile.type}_${tile.value + 1}`;
                if (!counts[leftKey] && !counts[rightKey]) {
                    discardTile = tile;
                    break;
                }
            }
        }
        
        // 没找到就出第一张
        if (!discardTile) {
            discardTile = hand[0];
        }
        
        // 执行出牌
        const tileIndex = aiPlayer.hand.findIndex(t => t.id === discardTile.id);
        aiPlayer.hand.splice(tileIndex, 1);
        aiPlayer.discards.push(discardTile);
        aiPlayer.hand = sortTiles(aiPlayer.hand);
        
        this.gameState.lastDiscard = discardTile;
        this.gameState.lastDiscardPlayer = aiPlayer.seatIndex;
        this.gameState.lastDrawnTile = null;  // AI出牌后清除记录
        
        // 检查AI是否听牌，如果听牌了自动敲牌
        if (!aiPlayer.isTing && !aiPlayer.isQiao && this.canHu(aiPlayer.hand, aiPlayer.melds)) {
            aiPlayer.isTing = true;
            console.log(`AI ${aiPlayer.username} 听牌！自动敲牌`);
            aiPlayer.isQiao = true;
            
            // 广播AI敲牌状态
            this.broadcast('player_qiao', {
                playerIndex: aiPlayer.seatIndex,
                username: aiPlayer.username
            });
        }
        
        this.broadcast('tile_discarded', {
            playerIndex: aiPlayer.seatIndex,
            tile: discardTile,
            tileName: getTileName(discardTile),
            isAI: true
        });
        
        this.checkActionsAfterDiscard(discardTile, aiPlayer.seatIndex);
    }

    // AI决定是否执行动作
    aiDecideAction(aiPlayer, action) {
        // 简单策略：胡必胡，杠必杠，碰概率50%，吃概率50%
        if (action.actions.includes('hu')) {
            action.resolved = true;
            action.action = 'hu';
        } else if (action.actions.includes('gang')) {
            action.resolved = true;
            action.action = 'gang';
        } else if (action.actions.includes('peng') && Math.random() > 0.5) {
            action.resolved = true;
            action.action = 'peng';
        } else if (action.actions.includes('chi') && Math.random() > 0.5) {
            // AI吃牌：随机选择吃牌选项
            action.resolved = true;
            action.action = 'chi';
            if (action.chiOptions && action.chiOptions.length > 0) {
                action.selectedChiIndex = Math.floor(Math.random() * action.chiOptions.length);
            }
        } else {
            action.resolved = true;
            action.action = 'pass';
        }
        
        if (this.gameState.pendingActions.every(a => a.resolved)) {
            clearTimeout(this.gameState.actionTimeout);
            this.resolveActions();
        }
    }

    // ==================== 特殊牌型检测 ====================
    isQiDui(hand) {
        const counts = {};
        hand.forEach(tile => {
            const key = `${tile.type}${tile.value}`;
            counts[key] = (counts[key] || 0) + 1;
        });
        
        const values = Object.values(counts);
        return values.length === 7 && values.every(v => v === 2);
    }

    isPengPengHu(hand) {
        const counts = {};
        hand.forEach(tile => {
            const key = `${tile.type}${tile.value}`;
            counts[key] = (counts[key] || 0) + 1;
        });
        
        let pairCount = 0;
        let tripleCount = 0;
        
        for (const key in counts) {
            const count = counts[key];
            if (count === 2) pairCount++;
            else if (count === 3) tripleCount++;
            else if (count === 4) tripleCount++;
            else if (count === 1) return false;
        }
        
        return pairCount === 1 && tripleCount >= 4;
    }

    isQingYiSe(hand, melds = []) {
        const suits = new Set();
        let hasHonor = false;
        
        const allTiles = [...hand];
        for (const meld of melds) {
            if (meld.tiles) {
                allTiles.push(...meld.tiles);
            }
        }
        
        allTiles.forEach(tile => {
            if (['wan', 'tiao', 'tong'].includes(tile.type)) {
                suits.add(tile.type);
            } else if (['feng', 'zhong', 'fa', 'bai', 'honor', 'wind'].includes(tile.type)) {
                hasHonor = true;
            }
        });
        
        return suits.size === 1 && !hasHonor;
    }
    
    isHunYiSe(hand, melds = []) {
        const suits = new Set();
        let hasHonor = false;
        
        const allTiles = [...hand];
        for (const meld of melds) {
            if (meld.tiles) {
                allTiles.push(...meld.tiles);
            }
        }
        
        allTiles.forEach(tile => {
            if (['wan', 'tiao', 'tong'].includes(tile.type)) {
                suits.add(tile.type);
            } else if (['feng', 'zhong', 'fa', 'bai', 'honor', 'wind'].includes(tile.type)) {
                hasHonor = true;
            }
        });
        
        return suits.size === 1 && hasHonor;
    }

    // 简单的胡牌检测
    canHu(hand, melds) {
        // 检查是否有14张牌（或11/8/5张+副露）
        const totalTiles = hand.length + melds.length * 3;
        if (totalTiles !== 14) return false;
        
        // 检查七对子
        if (hand.length === 14 && this.isQiDui(hand)) {
            return true;
        }
        
        // 简化版胡牌检测：3N+2结构
        return this.checkWinningHand([...hand]);
    }
    
    // 获取听牌列表
    getTingTiles(hand, melds = []) {
        const tingTiles = [];
        const allTileTypes = ['wan', 'tiao', 'tong', 'wind'];
        
        for (const type of allTileTypes) {
            const maxValue = type === 'wind' ? 4 : 9;
            for (let value = 1; value <= maxValue; value++) {
                const testTile = { type, value };
                const testHand = [...hand, testTile];
                if (this.canHu(testHand, melds)) {
                    tingTiles.push({ type, value, tileName: getTileName(testTile) });
                }
            }
        }
        return tingTiles;
    }
    
    checkWinningHand(tiles) {
        if (tiles.length === 0) return true;
        if (tiles.length === 2) {
            return tiles[0].type === tiles[1].type && tiles[0].value === tiles[1].value;
        }
        if (tiles.length < 3) return false;
        
        const sorted = sortTiles(tiles);
        
        // 尝试作为将（对子）
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].type === sorted[i+1].type && 
                sorted[i].value === sorted[i+1].value) {
                const remaining = [...sorted];
                remaining.splice(i, 2);
                if (this.canFormMelds(remaining)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    canFormMelds(tiles) {
        if (tiles.length === 0) return true;
        if (tiles.length % 3 !== 0) return false;
        
        const sorted = sortTiles(tiles);
        
        // 尝试刻子
        if (sorted.length >= 3 &&
            sorted[0].type === sorted[1].type && sorted[1].type === sorted[2].type &&
            sorted[0].value === sorted[1].value && sorted[1].value === sorted[2].value) {
            const remaining = sorted.slice(3);
            if (this.canFormMelds(remaining)) return true;
        }
        
        // 尝试顺子
        if (sorted.length >= 3) {
            const first = sorted[0];
            const secondIdx = sorted.findIndex(t => 
                t.type === first.type && t.value === first.value + 1
            );
            const thirdIdx = sorted.findIndex(t => 
                t.type === first.type && t.value === first.value + 2
            );
            
            if (secondIdx !== -1 && thirdIdx !== -1) {
                const remaining = [...sorted];
                // 按顺序移除，从大索引开始
                const indices = [0, secondIdx, thirdIdx].sort((a, b) => b - a);
                indices.forEach(idx => remaining.splice(idx, 1));
                if (this.canFormMelds(remaining)) return true;
            }
        }
        
        return false;
    }

    // ==================== 计分系统 ====================

    // 计算番数
    calculateFan(player, isZimo = false, isGangKai = false) {
        const hand = player.hand;
        const melds = player.melds;
        
        let fanList = [];
        let totalFan = 0;
        const isMenQing = melds.length === 0;
        
        // 1. 检测门清（1番）- 无吃碰杠
        if (isMenQing) {
            fanList.push({ name: '门清', fan: 1 });
            totalFan += 1;
        }
        
        // 2. 自摸（1番）
        if (isZimo) {
            fanList.push({ name: '自摸', fan: 1 });
            totalFan += 1;
        }
        
        // 3. 检测七对子（2番）
        if (this.isQiDui(hand)) {
            fanList.push({ name: '七对子', fan: 2 });
            totalFan += 2;
        }
        
        // 4. 检测碰碰胡（2番）
        const isPengPengHuFlag = this.isPengPengHu(hand);
        if (isPengPengHuFlag) {
            fanList.push({ name: '碰碰胡', fan: 2 });
            totalFan += 2;
        }
        
        // 5. 检测清一色（3番）
        if (this.isQingYiSe(hand, melds)) {
            fanList.push({ name: '清一色', fan: 3 });
            totalFan += 3;
            
            // 清碰（清一色+碰碰胡）额外+1番
            if (isPengPengHuFlag) {
                fanList.push({ name: '清碰', fan: 1 });
                totalFan += 1;
            }
        }
        // 6. 检测混一色（2番）
        else if (this.isHunYiSe(hand, melds)) {
            fanList.push({ name: '混一色', fan: 2 });
            totalFan += 2;
        }
        
        // 7. 杠开（1番）- 杠后摸牌胡
        if (isGangKai) {
            fanList.push({ name: '杠开', fan: 1 });
            totalFan += 1;
        }
        
        // 至少1番
        if (totalFan === 0) {
            totalFan = 1;
            fanList.push({ name: '基本胡', fan: 1 });
        }
        
        return { fanList, totalFan };
    }
    
    // 检测碰碰胡
    checkPengPengHu(hand, melds) {
        // 检查副露是否都是刻子或杠
        for (const meld of melds) {
            if (meld.type !== 'peng' && meld.type !== 'gang') {
                return false;
            }
        }
        
        // 检查手牌是否能组成全刻子+一对将
        return this.canFormAllPeng(hand);
    }
    
    // 检查手牌是否能组成全刻子
    canFormAllPeng(tiles) {
        if (tiles.length === 0) return true;
        if (tiles.length === 2) {
            return tiles[0].type === tiles[1].type && tiles[0].value === tiles[1].value;
        }
        if (tiles.length < 3) return false;
        
        const sorted = sortTiles(tiles);
        
        // 尝试将第一组作为刻子
        if (sorted.length >= 3 &&
            sorted[0].type === sorted[1].type && sorted[1].type === sorted[2].type &&
            sorted[0].value === sorted[1].value && sorted[1].value === sorted[2].value) {
            const remaining = sorted.slice(3);
            if (this.canFormAllPeng(remaining)) return true;
        }
        
        // 尝试将前两张作为将（只在剩余2张时）
        if (sorted.length === 2 &&
            sorted[0].type === sorted[1].type &&
            sorted[0].value === sorted[1].value) {
            return true;
        }
        
        return false;
    }
    
    // 计算花数
    calculateHua(player) {
        let huaList = [];
        let totalHua = 1; // 底花1花
        huaList.push({ name: '底花', hua: 1 });
        
        // 统计花牌（每张花牌1花）
        const flowerCount = player.flowers ? player.flowers.length : 0;
        if (flowerCount > 0) {
            huaList.push({ name: `花牌×${flowerCount}`, hua: flowerCount });
            totalHua += flowerCount;
        }
        
        const isWindTile = (tile) => tile && tile.type === 'wind';
        
        // 统计杠和刻子
        for (const meld of player.melds) {
            if (meld.type === 'gang') {
                const isWind = meld.tiles && meld.tiles.length > 0 && isWindTile(meld.tiles[0]);
                if (meld.from !== undefined && meld.from !== player.seatIndex) {
                    if (isWind) {
                        huaList.push({ name: '风向明杠', hua: 2 });
                        totalHua += 2;
                    } else {
                        huaList.push({ name: '明杠', hua: 1 });
                        totalHua += 1;
                    }
                } else {
                    if (isWind) {
                        huaList.push({ name: '风向暗杠', hua: 3 });
                        totalHua += 3;
                    } else {
                        huaList.push({ name: '暗杠', hua: 2 });
                        totalHua += 2;
                    }
                }
            } else if (meld.type === 'peng') {
                const isWind = meld.tiles && meld.tiles.length > 0 && isWindTile(meld.tiles[0]);
                if (isWind) {
                    huaList.push({ name: '风向刻子', hua: 1 });
                    totalHua += 1;
                }
            }
        }
        
        // 检查手牌中的暗刻（3张相同的牌）
        if (player.hand) {
            const tileCounts = {};
            for (const tile of player.hand) {
                const key = `${tile.type}_${tile.value}`;
                tileCounts[key] = (tileCounts[key] || 0) + 1;
            }
            for (const tile of player.hand) {
                const key = `${tile.type}_${tile.value}`;
                if (tileCounts[key] >= 3 && isWindTile(tile)) {
                    huaList.push({ name: '风向暗刻', hua: 2 });
                    totalHua += 2;
                    delete tileCounts[key];
                    break;
                }
            }
        }
        
        return { huaList, totalHua };
    }
    
    // 计算本局得分
    calculateScore(winner, loserIndex, fanResult, huaResult, isZimo) {
        const MAX_SCORE = 50; // 封顶50分
        
        // 分数 = 花数 × 2^番数
        const baseScore = huaResult.totalHua * Math.pow(2, fanResult.totalFan);
        const finalScore = Math.min(baseScore, MAX_SCORE);
        
        const scoreChanges = [0, 0, 0, 0];
        
        if (isZimo) {
            // 自摸：三家各付分数
            for (let i = 0; i < 4; i++) {
                if (i === winner.seatIndex) {
                    scoreChanges[i] = finalScore * 3;
                } else {
                    scoreChanges[i] = -finalScore;
                }
            }
        } else {
            // 点炮：放炮者付全部分数
            scoreChanges[winner.seatIndex] = finalScore * 3;
            scoreChanges[loserIndex] = -finalScore * 3;
        }
        
        return {
            baseScore,
            finalScore,
            scoreChanges,
            fanDetail: fanResult.fanList,
            huaDetail: huaResult.huaList,
            totalFan: fanResult.totalFan,
            totalHua: huaResult.totalHua
        };
    }

    // 结束一局（胡牌或流局）
    endRound(resultType, winnerIndex = -1, loserIndex = -1, isZimo = false, isGangKai = false) {
        this.gameRunning = false;
        this.gameState.gameOver = true;
        
        // 清除所有超时计时器
        if (this.gameState.actionTimeout) {
            clearTimeout(this.gameState.actionTimeout);
        }
        if (this.gameState.discardTimeout) {
            clearTimeout(this.gameState.discardTimeout);
        }
        
        let roundResult = {
            round: this.currentRound,
            resultType: resultType, // 'hu', 'zimo', 'draw'（流局）
            isZimo: isZimo, // 是否自摸
            winnerIndex: winnerIndex,
            loserIndex: loserIndex,
            scoreResult: null,
            players: []
        };
        
        // 如果有人胡牌，计算积分
        if (winnerIndex >= 0) {
            const winner = this.players[winnerIndex];
            const fanResult = this.calculateFan(winner, isZimo, isGangKai);
            const huaResult = this.calculateHua(winner);
            const scoreResult = this.calculateScore(winner, loserIndex, fanResult, huaResult, isZimo);
            
            // 更新累计积分
            for (let i = 0; i < 4; i++) {
                this.matchScores[i] += scoreResult.scoreChanges[i];
            }
            
            roundResult.scoreResult = scoreResult;
            this.lastWinnerIndex = winnerIndex;
        }
        
        // 记录玩家信息
        let winnerHand = [];
        let winnerMelds = [];
        let finalTile = null;
        let loserUsername = null;
        
        if (winnerIndex >= 0) {
            const winner = this.players[winnerIndex];
            winnerHand = winner.hand;
            winnerMelds = winner.melds;
            
            if (isZimo) {
                finalTile = this.gameState.lastDrawnTile;
            } else if (loserIndex >= 0) {
                finalTile = this.gameState.lastDiscard;
                loserUsername = this.players[loserIndex].username;
            }
        }
        
        roundResult.players = this.players.map((p, idx) => ({
            username: p.username,
            seatIndex: p.seatIndex,
            hand: p.hand,
            melds: p.melds,
            roundScore: roundResult.scoreResult ? roundResult.scoreResult.scoreChanges[idx] : 0,
            totalScore: this.matchScores[idx]
        }));
        
        roundResult.winnerHand = winnerHand;
        roundResult.winnerMelds = winnerMelds;
        roundResult.finalTile = finalTile;
        roundResult.loserUsername = loserUsername;
        
        // 保存历史记录
        this.roundHistory.push(roundResult);
        
        // 判断是否结束比赛
        if (this.currentRound >= this.totalRounds) {
            // 10局结束，广播比赛结束
            this.endMatch();
        } else {
            // 重置所有玩家准备状态
            this.players.forEach(p => {
                p.ready = false;
                // 标记是否被AI接管（用于后续恢复）
                if (!p.isBot && !p.offline) {
                    p.aiTakeover = false;
                }
            });
            
            // 广播本局结束，包含30秒倒计时
            this.broadcast('round_ended', {
                roundResult: roundResult,
                currentRound: this.currentRound,
                totalRounds: this.totalRounds,
                matchScores: this.matchScores,
                countdownSeconds: 30
            });
            
            // 启动30秒倒计时
            this.startNextRoundCountdown();
        }
    }
    
    // 启动下一局倒计时
    startNextRoundCountdown() {
        this.nextRoundCountdown = GAME_TIMEOUT_CONFIG.NEXT_ROUND_COUNTDOWN_SECONDS;
        
        // 清除之前的倒计时
        if (this.nextRoundTimer) {
            clearInterval(this.nextRoundTimer);
        }
        
        // AI玩家立即准备
        this.players.forEach(p => {
            if (p.isBot) {
                p.ready = true;
            }
        });
        
        // 广播初始准备状态
        this.broadcastReadyStatus();
        
        // 每秒更新倒计时
        this.nextRoundTimer = setInterval(() => {
            this.nextRoundCountdown--;
            
            // 广播倒计时
            this.broadcast('countdown_update', {
                seconds: this.nextRoundCountdown,
                readyStatus: this.getReadyStatus()
            });
            
            if (this.nextRoundCountdown <= 0) {
                clearInterval(this.nextRoundTimer);
                this.nextRoundTimer = null;
                this.forceStartNextRound();
            }
        }, 1000);
    }
    
    // 获取玩家准备状态
    getReadyStatus() {
        return this.players.map(p => ({
            seatIndex: p.seatIndex,
            username: p.username,
            ready: p.ready,
            isBot: p.isBot,
            aiTakeover: p.aiTakeover || false
        }));
    }
    
    // 广播准备状态
    broadcastReadyStatus() {
        this.broadcast('ready_status_update', {
            readyStatus: this.getReadyStatus(),
            countdown: this.nextRoundCountdown
        });
    }
    
    // 强制开始下一局（倒计时结束）
    forceStartNextRound() {
        console.log(`房间 ${this.code} 倒计时结束，强制开始下一局`);
        
        // 未准备的真人玩家由AI接管
        this.players.forEach(p => {
            if (!p.isBot && !p.ready && !p.offline) {
                console.log(`玩家 ${p.username} 未准备，AI接管`);
                p.aiTakeover = true;
                p.ready = true; // 标记为准备好，以便开始游戏
            }
        });
        
        // 广播AI接管状态
        this.broadcast('ai_takeover_status', {
            readyStatus: this.getReadyStatus()
        });
        
        // 开始下一局
        setTimeout(() => {
            if (!this.gameRunning) {
                this.startGame();
            }
        }, 500);
    }
    
    // 玩家接管AI（游戏中恢复控制权）
    takeoverAI(socketId) {
        const player = this.players.find(p => p.id === socketId);
        if (!player) return { error: '玩家不存在' };
        
        if (!player.aiTakeover) {
            return { error: '你没有被AI接管' };
        }
        
        console.log(`玩家 ${player.username} 接管AI，恢复控制权`);
        player.aiTakeover = false;
        
        // 通知该玩家恢复控制
        if (player.socket) {
            player.socket.emit('takeover_success', {
                message: '已恢复控制权！',
                seatIndex: player.seatIndex
            });
        }
        
        // 广播状态更新
        this.broadcast('player_takeover', {
            username: player.username,
            seatIndex: player.seatIndex
        });
        
        // 如果正好轮到这个玩家，设置出牌超时
        if (this.gameState.currentPlayerIndex === player.seatIndex && 
            this.gameState.turnPhase === 'discard') {
            this.setDiscardTimeout(player);
        }
        
        this.broadcastGameState();
        
        return { success: true };
    }
    
    // 结束整场比赛
    endMatch() {
        // 计算最终排名
        const ranking = this.players.map((p, idx) => ({
            username: p.username,
            seatIndex: idx,
            totalScore: this.matchScores[idx],
            isBot: p.isBot
        })).sort((a, b) => b.totalScore - a.totalScore);
        
        // 广播比赛结束
        this.broadcast('match_ended', {
            ranking: ranking,
            matchScores: this.matchScores,
            roundHistory: this.roundHistory,
            totalRounds: this.totalRounds
        });
        
        // 重置比赛状态
        this.matchStarted = false;
        this.currentRound = 0;
        this.matchScores = [0, 0, 0, 0];
        this.roundHistory = [];
        
        // 重置准备状态
        this.players.forEach(p => {
            if (!p.isBot) p.ready = false;
        });
        
        this.broadcastRoomUpdate();
    }
    
    // 旧版结束游戏（保留兼容）
    endGame(result) {
        // 解析结果判断胡牌类型
        if (result.includes('自摸')) {
            const winnerName = result.split(' ')[0];
            const winner = this.players.find(p => p.username === winnerName);
            if (winner) {
                this.endRound('zimo', winner.seatIndex, -1, true, false);
                return;
            }
        } else if (result.includes('胡牌')) {
            const winnerName = result.split(' ')[0];
            const winner = this.players.find(p => p.username === winnerName);
            if (winner) {
                // 点炮者是上一个出牌的人
                const loserIndex = this.gameState.lastDiscardPlayer;
                this.endRound('hu', winner.seatIndex, loserIndex, false, false);
                return;
            }
        } else if (result.includes('流局')) {
            this.endRound('draw', -1, -1, false, false);
            return;
        }
        
        // 默认处理
        this.endRound('draw', -1, -1, false, false);
    }

    // 广播房间更新
    broadcastRoomUpdate() {
        const roomInfo = {
            code: this.code,
            hostId: this.hostId,
            gameRunning: this.gameRunning,
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                avatar: p.avatar,
                voice: p.voice || 'female01',  // 语音类型
                seatIndex: p.seatIndex,
                wind: p.wind,
                windName: WIND_NAMES[p.wind],
                ready: p.ready,
                isHost: p.isHost,
                isBot: p.isBot
            }))
        };
        
        this.broadcast('room_updated', { room: roomInfo });
    }

    // 广播消息给所有玩家
    broadcast(event, data) {
        this.players.forEach(player => {
            if (player.socket) {
                player.socket.emit(event, data);
            }
        });
    }

    // 清理资源
    cleanup() {
        if (this.gameState) {
            if (this.gameState.actionTimeout) {
                clearTimeout(this.gameState.actionTimeout);
            }
            if (this.gameState.discardTimeout) {
                clearTimeout(this.gameState.discardTimeout);
            }
        }
        // 清理暂停相关的计时器
        if (this.pauseCountdown) {
            clearInterval(this.pauseCountdown);
            this.pauseCountdown = null;
        }
        // 清理自动解散计时器
        if (this.autoDissolveTimer) {
            clearTimeout(this.autoDissolveTimer);
            this.autoDissolveTimer = null;
        }
    }

    // 暂停游戏
    pauseGame(playerId) {
        if (!this.gameRunning || this.isPaused) {
            return { error: '游戏未在进行或已暂停' };
        }
        
        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { error: '玩家不存在' };
        }
        
        this.isPaused = true;
        this.pausePlayer = player;
        this.pauseStartTime = Date.now();
        
        // 清除游戏超时计时器
        if (this.gameState.discardTimeout) {
            clearTimeout(this.gameState.discardTimeout);
            this.gameState.discardTimeout = null;
        }
        if (this.gameState.actionTimeout) {
            clearTimeout(this.gameState.actionTimeout);
            this.gameState.actionTimeout = null;
        }
        
        console.log(`玩家 ${player.username} 暂停了游戏`);
        
        // 广播暂停状态给所有玩家
        this.broadcast('game_paused', {
            pausedPlayer: player.username,
            pauseTime: this.pauseStartTime
        });
        
        return { success: true };
    }

    // 取消暂停
    cancelPause(playerId) {
        if (!this.isPaused) {
            return { error: '游戏未暂停' };
        }
        
        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { error: '玩家不存在' };
        }
        
        const pauseDuration = Math.floor((Date.now() - this.pauseStartTime) / 1000);
        console.log(`玩家 ${player.username} 取消暂停，暂停了 ${pauseDuration} 秒`);
        
        // 广播取消暂停
        this.broadcast('pause_cancelled', {
            cancelledPlayer: player.username,
            resumeCountdown: 10
        });
        
        // 清除之前的倒计时
        if (this.pauseCountdown) {
            clearInterval(this.pauseCountdown);
            this.pauseCountdown = null;
        }
        
        // 10秒倒计时
        let countdownSeconds = 10;
        
        // 立即发送初始倒计时
        this.broadcast('pause_resume_countdown', {
            seconds: countdownSeconds
        });
        
        // 每秒更新倒计时
        this.pauseCountdown = setInterval(() => {
            if (!this.isPaused) {
                clearInterval(this.pauseCountdown);
                this.pauseCountdown = null;
                return;
            }
            
            countdownSeconds--;
            if (countdownSeconds > 0) {
                this.broadcast('pause_resume_countdown', {
                    seconds: countdownSeconds
                });
            }
        }, 1000);
        
        // 10秒后恢复游戏
        setTimeout(() => {
            if (this.pauseCountdown) {
                clearInterval(this.pauseCountdown);
                this.pauseCountdown = null;
            }
            
            this.isPaused = false;
            this.pausePlayer = null;
            this.pauseStartTime = null;
            
            console.log(`房间 ${this.code} 游戏恢复`);
            
            // 广播游戏恢复
            this.broadcast('game_resumed', {});
            
            // 恢复当前玩家的游戏流程
            this.notifyCurrentPlayer();
        }, 10000);
        
        return { success: true };
    }

    // 发起解散游戏投票
    requestDissolve(playerId) {
        if (!this.gameRunning) {
            return { error: '游戏未在进行' };
        }
        
        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { error: '玩家不存在' };
        }
        
        // 已经有解散请求
        if (this.dissolveRequest) {
            return { error: '已有解散请求' };
        }
        
        this.dissolveRequest = {
            requester: player,
            requesterId: playerId,
            timestamp: Date.now()
        };
        this.dissolveVotes = {};
        
        // 发起者默认同意
        this.dissolveVotes[playerId] = true;
        
        // 对离线或AI玩家自动投同意票
        for (const p of this.players) {
            if (p.isBot || p.offline) {
                this.dissolveVotes[p.id] = true;
                console.log(`玩家 ${p.username} (${p.isBot ? 'AI' : '离线'}) 自动同意解散`);
            }
        }
        
        console.log(`玩家 ${player.username} 发起解散游戏投票`);
        
        // 广播解散请求给所有玩家
        this.broadcast('dissolve_requested', {
            requester: player.username
        });
        
        // 检查是否所有真人都已投票（只统计真人玩家）
        const realPlayers = this.players.filter(p => !p.isBot);
        const realPlayerIds = realPlayers.map(p => p.id);
        const votedRealPlayers = Object.keys(this.dissolveVotes).filter(id => realPlayerIds.includes(id));
        
        if (votedRealPlayers.length === realPlayers.length) {
            const agreeVotes = votedRealPlayers.filter(id => this.dissolveVotes[id]).length;
            
            if (agreeVotes === realPlayers.length) {
                // 所有人都同意，解散游戏
                console.log(`房间 ${this.code} 解散游戏，所有玩家同意`);
                this.endGameForDissolve();
                return { success: true, dissolved: true };
            }
        }
        
        return { success: true };
    }

    // 投票解散游戏
    voteDissolve(playerId, agree) {
        if (!this.dissolveRequest) {
            return { error: '没有解散请求' };
        }
        
        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { error: '玩家不存在' };
        }
        
        this.dissolveVotes[playerId] = agree;
        
        console.log(`玩家 ${player.username} 对解散投票: ${agree ? '同意' : '反对'}`);
        
        // 广播投票结果（只统计真人玩家的票数）
        const realPlayers = this.players.filter(p => !p.isBot);
        const realPlayerIds = realPlayers.map(p => p.id);
        const agreeVotes = Object.keys(this.dissolveVotes).filter(id => realPlayerIds.includes(id) && this.dissolveVotes[id]).length;
        
        this.broadcast('dissolve_vote_update', {
            voter: player.username,
            agree: agree,
            votes: agreeVotes,
            totalPlayers: realPlayers.length
        });
        
        // 检查是否所有真人都已投票
        const votedRealPlayers = Object.keys(this.dissolveVotes).filter(id => realPlayerIds.includes(id));
        
        if (votedRealPlayers.length === realPlayers.length) {
            if (agreeVotes === realPlayers.length) {
                // 所有人都同意，解散游戏
                console.log(`房间 ${this.code} 解散游戏，所有玩家同意`);
                this.endGameForDissolve();
                return { success: true, dissolved: true };
            } else {
                // 有人反对，解散请求失败
                console.log(`房间 ${this.code} 解散投票未通过`);
                this.dissolveRequest = null;
                this.dissolveVotes = {};
                
                this.broadcast('dissolve_rejected', {});
                return { success: true, dissolved: false };
            }
        }
        
        return { success: true };
    }

    // 结束游戏（解散）
    endGameForDissolve() {
        // 清除所有计时器
        if (this.gameState) {
            if (this.gameState.discardTimeout) {
                clearTimeout(this.gameState.discardTimeout);
                this.gameState.discardTimeout = null;
            }
            if (this.gameState.actionTimeout) {
                clearTimeout(this.gameState.actionTimeout);
                this.gameState.actionTimeout = null;
            }
        }
        if (this.pauseCountdown) {
            clearInterval(this.pauseCountdown);
            this.pauseCountdown = null;
        }
        // 清除下一局倒计时计时器
        if (this.nextRoundTimer) {
            clearInterval(this.nextRoundTimer);
            this.nextRoundTimer = null;
        }
        // 清除自动解散计时器
        if (this.autoDissolveTimer) {
            clearTimeout(this.autoDissolveTimer);
            this.autoDissolveTimer = null;
        }
        
        this.gameRunning = false;
        this.isPaused = false;
        this.pausePlayer = null;
        
        // 广播游戏解散
        this.broadcast('game_dissolved', {
            matchScores: this.matchScores,
            roundHistory: this.roundHistory,
            totalRounds: this.totalRounds,
            currentRound: this.currentRound
        });
    }
}

// Socket.IO 事件处理
io.on('connection', (socket) => {
    console.log('新连接:', socket.id);

    // 创建房间
    socket.on('create_room', (data) => {
        const { username, avatar, voice } = data;
        let code;
        do {
            code = generateRoomCode();
        } while (gameRooms.has(code));
        
        const room = new MahjongRoom(code, socket.id, username);
        gameRooms.set(code, room);
        
        room.addPlayer(socket, username, avatar, voice || 'female01');
        
        socket.emit('room_created', { roomCode: code });
    });

    // 加入房间
    socket.on('join_room', (data) => {
        const { roomCode, username, avatar, voice } = data;
        const code = roomCode.toUpperCase().trim();
        const room = gameRooms.get(code);
        
        console.log(`玩家 ${username} (${voice || 'female01'}) 尝试加入房间 ${code}, 当前房间数: ${gameRooms.size}`);
        
        if (!room) {
            // 列出所有房间供调试
            const allRooms = Array.from(gameRooms.keys());
            console.log('当前所有房间:', allRooms);
            socket.emit('join_error', { message: `房间 ${code} 不存在，请确认房间号是否正确` });
            return;
        }
        
        if (room.gameRunning) {
            socket.emit('join_error', { message: '游戏已开始，无法加入' });
            return;
        }
        
        // 检查真人玩家数量（AI不占位）
        const realPlayerCount = room.players.filter(p => !p.isBot).length;
        if (realPlayerCount >= 4) {
            socket.emit('join_error', { message: '房间已满（4人）' });
            return;
        }
        
        // 如果有AI，踢掉一个AI腾位置
        if (room.players.length >= 4) {
            const botIndex = room.players.findIndex(p => p.isBot);
            if (botIndex !== -1) {
                room.players.splice(botIndex, 1);
                console.log('踢掉一个AI玩家，为真人腾位置');
            }
        }
        
        room.addPlayer(socket, username, avatar, voice || 'female01');
        socket.emit('room_joined', { roomCode: room.code });
        console.log(`玩家 ${username} 成功加入房间 ${code}`);
    });

    // 准备/取消准备
    socket.on('toggle_ready', (data) => {
        const room = playerSockets.get(socket.id);
        if (room) {
            room.setPlayerReady(socket.id, data.ready);
        }
    });
    
    // 接管AI（游戏中恢复控制权）
    socket.on('takeover_ai', () => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            room.takeoverAI(socket.id);
        }
    });

    // 离开房间
    socket.on('leave_room', () => {
        const room = playerSockets.get(socket.id);
        if (room) {
            room.removePlayer(socket.id);
        }
    });

    // 摸牌
    socket.on('draw_tile', () => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.playerDraw(socket.id);
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 出牌
    socket.on('discard_tile', (data) => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.playerDiscard(socket.id, data.tileId);
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 敲牌确认
    socket.on('confirm_qiao', (data) => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const player = room.players.find(p => p.id === socket.id);
            if (player && player.isTing && !player.isQiao) {
                player.isQiao = true;
                console.log(`玩家 ${player.username} 敲牌确认！`);
                
                // 清除等待敲牌状态
                room.gameState.waitingForQiao = false;
                
                // 清除敲牌超时计时器
                if (room.gameState.qiaoTimeout) {
                    clearTimeout(room.gameState.qiaoTimeout);
                    room.gameState.qiaoTimeout = null;
                }
                
                // 广播敲牌状态给所有玩家
                room.broadcast('player_qiao', {
                    playerIndex: player.seatIndex,
                    username: player.username
                });
                
                // 通知前端刷新状态
                room.broadcastGameState();
                
                // 恢复游戏流程：检查其他玩家是否可以碰、杠、胡
                const lastDiscard = room.gameState.lastDiscard;
                if (lastDiscard) {
                    room.checkActionsAfterDiscard(lastDiscard, player.seatIndex);
                }
            }
        }
    });

    // 敲牌后不出牌（选择不敲）
    socket.on('cancel_qiao', (data) => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const player = room.players.find(p => p.id === socket.id);
            if (player && player.isTing && !player.isQiao) {
                // 取消听牌标记（玩家选择不敲牌，可以继续打其他牌）
                player.isTing = false;
                console.log(`玩家 ${player.username} 取消敲牌，继续正常游戏`);
                
                // 清除等待敲牌状态
                room.gameState.waitingForQiao = false;
                
                // 清除敲牌超时计时器
                if (room.gameState.qiaoTimeout) {
                    clearTimeout(room.gameState.qiaoTimeout);
                    room.gameState.qiaoTimeout = null;
                }
                
                // 通知前端刷新状态
                room.broadcastGameState();
                
                // 恢复游戏流程：检查其他玩家是否可以碰、杠、胡
                const lastDiscard = room.gameState.lastDiscard;
                if (lastDiscard) {
                    room.checkActionsAfterDiscard(lastDiscard, player.seatIndex);
                }
            }
        }
    });

    // 执行动作（碰、杠、胡、过）
    socket.on('player_action', (data) => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.playerAction(socket.id, data.action, data.extraData || {});
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 发送聊天消息
    socket.on('chat_message', (data) => {
        const room = playerSockets.get(socket.id);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                // 广播聊天消息
                room.broadcast('chat_message', {
                    username: player.username,
                    message: data.message
                });
                
                // 如果是表情消息，额外广播表情气泡事件
                if (data.isEmoji) {
                    room.broadcast('emoji_received', {
                        emoji: data.message,
                        seatIndex: player.seatIndex,
                        username: player.username
                    });
                }
            }
        }
    });
    
    // Ping/Pong 网络质量检测
    socket.on('ping', () => {
        socket.emit('pong');
    });
    
    // 请求完整状态同步（页面恢复可见时）
    socket.on('request_sync', () => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                socket.emit('game_state_update', {
                    gameState: room.getPlayerGameState(socket.id)
                });
            }
        }
    });

    // 暂停游戏
    socket.on('pause_game', () => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.pauseGame(socket.id);
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 取消暂停
    socket.on('cancel_pause', () => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.cancelPause(socket.id);
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 发起解散游戏投票
    socket.on('request_dissolve', () => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.requestDissolve(socket.id);
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 投票解散游戏
    socket.on('vote_dissolve', (data) => {
        const room = playerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.voteDissolve(socket.id, data.agree);
            if (result && result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('断开连接:', socket.id);
        const room = playerSockets.get(socket.id);
        if (room) {
            room.removePlayer(socket.id);
        }
    });
});

// 定期清理空房间
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of gameRooms) {
        // 清理超过1小时的空房间
        if (room.players.filter(p => !p.isBot).length === 0 || 
            now - room.createdAt > 3600000) {
            room.cleanup();
            gameRooms.delete(code);
            console.log(`清理过期房间: ${code}`);
        }
    }
}, 60000);

// ==================== 五子棋游戏逻辑 ====================

// 五子棋房间管理
const gomokuRooms = new Map();
const gomokuPlayerSockets = new Map();

// 生成6位房间号（五子棋专用，避免与麻将冲突）
function generateGomokuRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'G'; // G开头表示五子棋
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// 五子棋房间类
class GomokuRoom {
    constructor(code, hostId, hostName) {
        this.code = code;
        this.players = [];
        this.board = null;
        this.gameRunning = false;
        this.currentTurn = 'black';
        this.createdAt = Date.now();
        console.log(`[五子棋] 房间 ${code} 已创建，房主: ${hostName}`);
    }

    addPlayer(socket, username) {
        if (this.players.length >= 2) return null;
        
        const player = {
            id: socket.id,
            username: username,
            socket: socket,
            ready: false,
            color: this.players.length === 0 ? 'black' : 'white'
        };
        
        this.players.push(player);
        gomokuPlayerSockets.set(socket.id, this);
        
        console.log(`[五子棋] 玩家 ${username} 加入房间 ${this.code}，执${player.color === 'black' ? '黑' : '白'}子`);
        this.broadcastRoomUpdate();
        return player;
    }

    removePlayer(socketId) {
        const playerIndex = this.players.findIndex(p => p.id === socketId);
        if (playerIndex !== -1) {
            const player = this.players[playerIndex];
            this.players.splice(playerIndex, 1);
            gomokuPlayerSockets.delete(socketId);
            
            console.log(`[五子棋] 玩家 ${player.username} 离开房间 ${this.code}`);
            
            if (this.gameRunning) {
                this.broadcast('opponent_left', {});
            }
            
            this.gameRunning = false;
            
            if (this.players.length === 1) {
                this.players[0].color = 'black';
                this.players[0].ready = false;
            }
            
            if (this.players.length === 0) {
                gomokuRooms.delete(this.code);
                console.log(`[五子棋] 房间 ${this.code} 已解散`);
            } else {
                this.broadcastRoomUpdate();
            }
        }
    }

    setPlayerReady(socketId, ready) {
        const player = this.players.find(p => p.id === socketId);
        if (player) {
            player.ready = ready;
            this.broadcastRoomUpdate();
            
            if (this.players.length === 2 && this.players.every(p => p.ready)) {
                this.startGame();
            }
        }
    }

    startGame() {
        this.gameRunning = true;
        this.board = Array(15).fill(null).map(() => Array(15).fill(null));
        this.currentTurn = 'black';
        
        // 随机分配颜色
        if (Math.random() > 0.5) {
            [this.players[0].color, this.players[1].color] = 
            [this.players[1].color, this.players[0].color];
        }
        
        const blackPlayer = this.players.find(p => p.color === 'black');
        const whitePlayer = this.players.find(p => p.color === 'white');
        
        this.players.forEach(player => {
            player.socket.emit('game_started', {
                yourColor: player.color,
                blackPlayer: blackPlayer.username,
                whitePlayer: whitePlayer.username
            });
        });
        
        console.log(`[五子棋] 房间 ${this.code} 游戏开始！黑方: ${blackPlayer.username}, 白方: ${whitePlayer.username}`);
    }

    placeStone(socketId, row, col) {
        const player = this.players.find(p => p.id === socketId);
        if (!player) return { error: '玩家不存在' };
        if (!this.gameRunning) return { error: '游戏未开始' };
        if (player.color !== this.currentTurn) return { error: '还没轮到你' };
        if (this.board[row][col]) return { error: '这里已经有棋子了' };
        
        this.board[row][col] = player.color;
        
        this.broadcast('stone_placed', {
            row, col,
            color: player.color,
            nextColor: player.color === 'black' ? 'white' : 'black'
        });
        
        const winResult = this.checkWin(row, col, player.color);
        if (winResult.win) {
            this.gameRunning = false;
            this.broadcast('game_over', {
                winner: player.color,
                winnerName: player.username,
                winningCells: winResult.cells
            });
            console.log(`[五子棋] 房间 ${this.code} 游戏结束，${player.username} 获胜！`);
            return { success: true, gameOver: true };
        }
        
        if (this.isBoardFull()) {
            this.gameRunning = false;
            this.broadcast('game_over', { winner: null, draw: true });
            return { success: true, gameOver: true, draw: true };
        }
        
        this.currentTurn = this.currentTurn === 'black' ? 'white' : 'black';
        return { success: true };
    }

    checkWin(row, col, color) {
        const directions = [
            [[0, 1], [0, -1]], [[1, 0], [-1, 0]],
            [[1, 1], [-1, -1]], [[1, -1], [-1, 1]]
        ];
        
        for (const [dir1, dir2] of directions) {
            let count = 1;
            const cells = [[row, col]];
            
            let r = row + dir1[0], c = col + dir1[1];
            while (r >= 0 && r < 15 && c >= 0 && c < 15 && this.board[r][c] === color) {
                count++; cells.push([r, c]);
                r += dir1[0]; c += dir1[1];
            }
            
            r = row + dir2[0]; c = col + dir2[1];
            while (r >= 0 && r < 15 && c >= 0 && c < 15 && this.board[r][c] === color) {
                count++; cells.push([r, c]);
                r += dir2[0]; c += dir2[1];
            }
            
            if (count >= 5) return { win: true, cells };
        }
        return { win: false };
    }

    isBoardFull() {
        for (let row = 0; row < 15; row++) {
            for (let col = 0; col < 15; col++) {
                if (!this.board[row][col]) return false;
            }
        }
        return true;
    }

    restartGame() {
        this.board = Array(15).fill(null).map(() => Array(15).fill(null));
        this.gameRunning = true;
        
        this.players.forEach(p => {
            p.color = p.color === 'black' ? 'white' : 'black';
        });
        
        this.currentTurn = 'black';
        
        const blackPlayer = this.players.find(p => p.color === 'black');
        const whitePlayer = this.players.find(p => p.color === 'white');
        
        this.players.forEach(player => {
            player.socket.emit('game_restarted', {
                yourColor: player.color,
                blackPlayer: blackPlayer.username,
                whitePlayer: whitePlayer.username
            });
        });
    }

    broadcastRoomUpdate() {
        const roomInfo = {
            code: this.code,
            players: this.players.map(p => ({
                username: p.username,
                color: p.color,
                ready: p.ready
            }))
        };
        this.broadcast('room_updated', roomInfo);
    }

    broadcast(event, data) {
        this.players.forEach(player => {
            if (player.socket) player.socket.emit(event, data);
        });
    }
}

// 五子棋 Socket.IO 命名空间
const gomokuIO = io.of('/gomoku');

gomokuIO.on('connection', (socket) => {
    console.log('[五子棋] 新连接:', socket.id);

    socket.on('create_room', (data) => {
        const { username } = data;
        let code;
        do {
            code = generateGomokuRoomCode();
        } while (gomokuRooms.has(code));
        
        const room = new GomokuRoom(code, socket.id, username);
        gomokuRooms.set(code, room);
        room.addPlayer(socket, username);
        
        socket.emit('room_created', { 
            roomCode: code,
            players: room.players.map(p => ({
                username: p.username, color: p.color, ready: p.ready
            }))
        });
    });

    socket.on('join_room', (data) => {
        const { roomCode, username } = data;
        const code = roomCode.toUpperCase().trim();
        const room = gomokuRooms.get(code);
        
        if (!room) {
            socket.emit('join_error', { message: '房间不存在' });
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('join_error', { message: '房间已满' });
            return;
        }
        if (room.gameRunning) {
            socket.emit('join_error', { message: '游戏已开始' });
            return;
        }
        
        room.addPlayer(socket, username);
        socket.emit('room_joined', { 
            roomCode: room.code,
            players: room.players.map(p => ({
                username: p.username, color: p.color, ready: p.ready
            }))
        });
    });

    socket.on('toggle_ready', (data) => {
        const room = gomokuPlayerSockets.get(socket.id);
        if (room) room.setPlayerReady(socket.id, data.ready);
    });

    socket.on('leave_room', () => {
        const room = gomokuPlayerSockets.get(socket.id);
        if (room) room.removePlayer(socket.id);
    });

    socket.on('place_stone', (data) => {
        const room = gomokuPlayerSockets.get(socket.id);
        if (room && room.gameRunning) {
            const result = room.placeStone(socket.id, data.row, data.col);
            if (result.error) {
                socket.emit('action_error', { message: result.error });
            }
        }
    });

    socket.on('play_again', () => {
        const room = gomokuPlayerSockets.get(socket.id);
        if (room && room.players.length === 2) {
            const opponent = room.players.find(p => p.id !== socket.id);
            if (opponent && opponent.socket) {
                opponent.socket.emit('play_again_request', {});
            }
        }
    });

    socket.on('play_again_accept', () => {
        const room = gomokuPlayerSockets.get(socket.id);
        if (room) room.restartGame();
    });

    socket.on('play_again_reject', () => {
        const room = gomokuPlayerSockets.get(socket.id);
        if (room) {
            const requester = room.players.find(p => p.id !== socket.id);
            if (requester && requester.socket) {
                requester.socket.emit('play_again_rejected', {});
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('[五子棋] 断开连接:', socket.id);
        const room = gomokuPlayerSockets.get(socket.id);
        if (room) room.removePlayer(socket.id);
    });
});

// 定期清理五子棋空房间
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of gomokuRooms) {
        if (room.players.length === 0 || now - room.createdAt > 3600000) {
            gomokuRooms.delete(code);
            console.log(`[五子棋] 清理过期房间: ${code}`);
        }
    }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🀄 麻将多人服务器运行在端口 ${PORT}`);
    console.log(`⚫ 五子棋多人服务器运行在端口 ${PORT} (命名空间: /gomoku)`);
    console.log(`🌐 打开浏览器访问: http://localhost:${PORT}`);
});

