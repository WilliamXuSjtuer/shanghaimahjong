// ==================== 性能优化工具 ====================
        
        // 节流函数 - 限制函数调用频率
        function throttle(func, limit) {
            let inThrottle;
            let lastResult;
            return function(...args) {
                if (!inThrottle) {
                    lastResult = func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
                return lastResult;
            };
        }
        
        // 防抖函数 - 延迟执行直到停止调用
        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }
        
        // requestAnimationFrame 封装
        let rafPending = false;
        let rafCallback = null;
        function scheduleUpdate(callback) {
            rafCallback = callback;
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    if (rafCallback) rafCallback();
                });
            }
        }
        
        // 网络状态检测
        let networkQuality = 'good'; // 'good', 'slow', 'offline'
        let lastPingTime = 0;
        let pingHistory = [];
        
        function updateNetworkQuality(ping) {
            pingHistory.push(ping);
            if (pingHistory.length > 5) pingHistory.shift();
            
            const avgPing = pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length;
            
            if (avgPing > 500) {
                networkQuality = 'slow';
            } else if (avgPing > 200) {
                networkQuality = 'medium';
            } else {
                networkQuality = 'good';
            }
            
            // 弱网时减少动画
            document.body.classList.toggle('reduce-motion', networkQuality === 'slow');
        }
        
        // 低性能设备检测
        const isLowEndDevice = (function() {
            // 检测设备内存 (如果可用)
            const memory = navigator.deviceMemory;
            if (memory && memory < 4) return true;
            
            // 检测是否是移动设备
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // 检测硬件并发数
            const cores = navigator.hardwareConcurrency;
            if (cores && cores < 4) return true;
            
            return isMobile;
        })();
        
        // 低端设备自动启用省电模式
        let performanceMode = isLowEndDevice ? 'low' : 'high';
        
        // DOM 元素缓存
        const domCache = {};
        function $(id) {
            if (!domCache[id]) {
                domCache[id] = document.getElementById(id);
            }
            return domCache[id];
        }
        
        // 上一次游戏状态（用于增量更新）
        let prevGameState = null;
        
        // 游戏状态
        let socket = null;
        let currentRoom = null;
        let myPlayerId = null;
        let mySeatIndex = -1;
        let selectedTileId = null;
        let gameState = null;
        let isReady = false;
        let username = '';
        let lastDrawnTileId = null; // 记录刚摸的牌
        let pendingAutoDiscard = false; // 是否等待自动出牌
        let pendingAutoDiscardTileId = null; // 等待自动出牌的牌ID
        let isAITakeover = false; // 是否被AI接管
        let myVoice = 'female01'; // 我的语音类型
        let playerVoices = {}; // 存储所有玩家的语音类型

        // 牌面显示
        const TYPE_NAMES = { wan: '万', tiao: '条', tong: '筒' };
        const NUM_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        const WIND_NAMES = { east: '东', south: '南', west: '西', north: '北' };
        
        // 精灵图位置映射 (8列×6行网格)
        const TILE_SPRITE_MAP = {
            // 第0行: 万子 1-8
            'wan1': [0, 0], 'wan2': [0, 1], 'wan3': [0, 2], 'wan4': [0, 3],
            'wan5': [0, 4], 'wan6': [0, 5], 'wan7': [0, 6], 'wan8': [0, 7],
            
            // 第1行: 筒子 1-8
            'tong1': [1, 0], 'tong2': [1, 1], 'tong3': [1, 2], 'tong4': [1, 3],
            'tong5': [1, 4], 'tong6': [1, 5], 'tong7': [1, 6], 'tong8': [1, 7],
            
            // 第2行: 条子 1-8
            'tiao1': [2, 0], 'tiao2': [2, 1], 'tiao3': [2, 2], 'tiao4': [2, 3],
            'tiao5': [2, 4], 'tiao6': [2, 5], 'tiao7': [2, 6], 'tiao8': [2, 7],
            
            // 第3行: 字牌 东南西北中发白
            'dong': [3, 0], 'nan': [3, 1], 'xi': [3, 2], 'bei': [3, 3],
            'zhong': [3, 4], 'fa': [3, 5], 'bai': [3, 6],
            
            // 第4行: 花牌
            'qiu': [4, 0], 'lan': [4, 1], 'zhu': [4, 2], 'mei': [4, 3],
            'chun': [4, 4], 'xia': [4, 5], 'dong_hua': [4, 6], 'ju': [4, 7],
            
            // 第5行: 9万 9筒 9条
            'wan9': [5, 0], 'tong9': [5, 1], 'tiao9': [5, 2]
        };
        
        // 获取精灵图背景位置
        function getSpritePosition(tile) {
            let key;
            if (tile.type === 'honor') {
                key = tile.value; // 中发白直接使用value作为key
            } else {
                key = `${tile.type}${tile.value}`;
            }
            const pos = TILE_SPRITE_MAP[key];
            
            if (!pos) return '';
            
            const cols = 8;
            const rows = 6;
            
            // 使用百分比定位
            const posX = pos[1] === 0 ? 0 : (pos[1] / (cols - 1)) * 100;
            const posY = pos[0] === 0 ? 0 : (pos[0] / (rows - 1)) * 100;
            
            return `background-size: ${cols * 100}% ${rows * 100}%; background-position: ${posX}% ${posY}%;`;
        }
        
        // ==================== 听牌检测 ====================
        let isTing = false;
        let tingList = [];
        
        // 检测是否能胡牌（3N+2结构）
        function canHuHand(tiles) {
            if (tiles.length === 0) return true;
            if (tiles.length === 2) {
                return tiles[0].type === tiles[1].type && tiles[0].value === tiles[1].value;
            }
            if (tiles.length < 3) return false;
            
            // 排序
            const sorted = [...tiles].sort((a, b) => {
                if (a.type !== b.type) return a.type.localeCompare(b.type);
                return a.value - b.value;
            });
            
            // 尝试作为将（对子）
            for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i].type === sorted[i+1].type && sorted[i].value === sorted[i+1].value) {
                    const remaining = [...sorted];
                    remaining.splice(i, 2);
                    if (canFormMelds(remaining)) return true;
                }
            }
            return false;
        }
        
        function canFormMelds(tiles) {
            if (tiles.length === 0) return true;
            if (tiles.length % 3 !== 0) return false;
            
            const sorted = [...tiles].sort((a, b) => {
                if (a.type !== b.type) return a.type.localeCompare(b.type);
                return a.value - b.value;
            });
            
            // 尝试刻子
            if (sorted.length >= 3 &&
                sorted[0].type === sorted[1].type && sorted[1].type === sorted[2].type &&
                sorted[0].value === sorted[1].value && sorted[1].value === sorted[2].value) {
                return canFormMelds(sorted.slice(3));
            }
            
            // 尝试顺子
            if (sorted.length >= 3) {
                const first = sorted[0];
                const secondIdx = sorted.findIndex(t => t.type === first.type && t.value === first.value + 1);
                const thirdIdx = sorted.findIndex(t => t.type === first.type && t.value === first.value + 2);
                
                if (secondIdx !== -1 && thirdIdx !== -1) {
                    const remaining = [...sorted];
                    [thirdIdx, secondIdx, 0].sort((a,b) => b-a).forEach(idx => remaining.splice(idx, 1));
                    if (canFormMelds(remaining)) return true;
                }
            }
            return false;
        }
        
        // 检测听哪些牌
        function checkTingPai(hand) {
            const tingTiles = [];
            const allTileTypes = ['wan', 'tiao', 'tong'];
            
            for (const type of allTileTypes) {
                for (let value = 1; value <= 9; value++) {
                    const testTile = { type, value };
                    const testHand = [...hand, testTile];
                    if (canHuHand(testHand)) {
                        tingTiles.push(testTile);
                    }
                }
            }
            return tingTiles;
        }
        
        // 检查并显示听牌状态
        function checkAndShowTing() {
            if (!gameState) return;
            
            const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
            if (!myPlayer || !myPlayer.hand) return;
            
            // 只有13张牌时检测听牌（或10张有1碰，7张有2碰...）
            const expectedSize = 13 - (myPlayer.melds?.length || 0) * 3;
            if (myPlayer.hand.length !== expectedSize) return;
            
            const newTingList = checkTingPai(myPlayer.hand);
            
            if (newTingList.length > 0 && !isTing) {
                isTing = true;
                tingList = newTingList;
                
                // 语音播报
                speakTing();
                
                // 显示听牌信息
                const tingNames = newTingList.map(t => `${NUM_NAMES[t.value]}${TYPE_NAMES[t.type]}`).join('、');
                showToast(`🎯 听牌！听：${tingNames}`, 3000);
            }
        }
        
        // ==================== 音频播放系统 ====================
        const audioCache = {}; // 缓存已加载的音频
        let audioUnlocked = false; // 移动设备音频是否已解锁
        
        // 音频格式配置（统一使用mp3）
        const AUDIO_FORMATS = {
            female01: '.mp3',
            female02: '.mp3',
            male: '.mp3',
            male02: '.mp3'
        };
        
        // 获取牌的音频文件名
        function getTileAudioName(tile) {
            // 多人模式牌结构: 
            // 数字牌: { type: 'wan'|'tiao'|'tong', value: 1-9 }
            // 花牌: { type: 'flower', value: 'chun'|'xia'|... }
            // 中发白: { type: 'honor', value: 'zhong'|'fa'|'bai' }
            if (tile.type === 'flower') {
                return tile.value; // 花牌直接返回 value (chun, xia, etc.)
            } else if (tile.type === 'honor') {
                return tile.value; // 中发白直接返回 value (zhong, fa, bai)
            }
            return `${tile.type}${tile.value}`; // 数字牌: wan1, tong2, etc.
        }
        
        // 根据玩家ID获取语音
        function getPlayerVoice(playerId) {
            return playerVoices[playerId] || 'female01';
        }
        
        // 根据座位索引获取玩家语音
        function getPlayerVoiceBySeat(seatIndex) {
            if (!gameState || !gameState.players) return 'female01';
            const player = gameState.players.find(p => p.seatIndex === seatIndex);
            if (player && player.voice) {
                return player.voice;
            }
            return playerVoices[player?.id] || 'female01';
        }
        
        // 解锁移动设备音频
        function unlockAudio() {
            if (audioUnlocked) return;
            try {
                const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/kaYhAAAAAAD/4xjAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/jGMAD/0AAAANIAAAAATVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
                silentAudio.play().then(() => {
                    audioUnlocked = true;
                    console.log('移动设备音频已解锁');
                }).catch(e => {});
            } catch (e) {}
        }
        
        // 监听用户交互以解锁音频
        ['click', 'touchstart'].forEach(event => {
            document.addEventListener(event, unlockAudio, { once: false, passive: true });
        });
        
        // 音频加载状态
        const audioLoading = {};
        
        // 播放音频文件（直接播放，同时缓存）
        function playAudioFile(path, volume = 1.0) {
            console.log('播放音频:', path);
            
            try {
                // 检查缓存 - 如果已缓存直接播放
                if (audioCache[path] && audioCache[path].readyState >= 2) {
                    const audio = audioCache[path].cloneNode();
                    audio.volume = volume;
                    audio.play().then(() => {
                        console.log('缓存音频播放成功');
                    }).catch(e => {
                        console.error('缓存音频播放失败:', e);
                    });
                    return;
                }
                
                // 未缓存 - 直接创建并播放（同时缓存）
                const audio = new Audio();
                audio.volume = volume;
                audio.preload = 'auto';
                audio.src = path;
                
                // 尝试直接播放
                audio.play().then(() => {
                    // 播放成功，缓存起来
                    audioCache[path] = audio;
                    console.log('新音频播放成功并缓存');
                }).catch(e => {
                    // 播放失败，播放蜂鸣音作为反馈
                    console.error('音频播放失败:', e.message);
                    const isTile = path.includes('/tiles/');
                    playBeep(isTile ? 600 : 400, 80);
                });
                
                // 同时缓存（即使播放失败也缓存，下次用）
                audio.addEventListener('canplaythrough', () => {
                    audioCache[path] = audio;
                }, { once: true });
            } catch (e) {
                console.error('音频异常:', e);
                playBeep(523, 80);
            }
        }
        
        // 音量配置（根据不同语音调整音量平衡）
        const AUDIO_VOLUMES = {
            female01: 0.6,  // 女声1
            female02: 0.8,  // 女声2
            male: 1.0,      // 男声1
            male02: 1.0     // 男声2
        };
        
        // 播放牌的音频（支持多种语音）
        function playTileAudio(tile, voice = 'female01') {
            const name = getTileAudioName(tile);
            const format = AUDIO_FORMATS[voice] || '.mp3';
            const volume = AUDIO_VOLUMES[voice] || 1.0;
            playAudioFile(`audio/${voice}/tiles/${name}${format}`, volume);
        }
        
        // 播放动作音频（支持多种语音）
        function playActionAudio(action, voice = 'female01') {
            const format = AUDIO_FORMATS[voice] || '.mp3';
            const volume = AUDIO_VOLUMES[voice] || 1.0;
            playAudioFile(`audio/${voice}/actions/${action}${format}`, volume);
        }
        
        // 音频懒加载队列
        let audioLoadQueue = [];
        let audioEnabled = true; // 弱网时可禁用
        
        // 智能预加载音频 - 只预加载必要的，避免卡顿
        function preloadMultiplayerAudio() {
            // 跳过预加载，使用纯懒加载策略，避免卡顿
            console.log('音频使用懒加载模式，避免启动卡顿');
        }
        
        // 游戏开始时预加载当前语音的动作音频
        // 静默预加载常用音频（游戏开始后在后台执行）
        function silentPreloadAudio(voice) {
            const actions = ['peng', 'gang', 'hu', 'zimo'];
            const commonTiles = ['wan1', 'wan2', 'wan3', 'tong1', 'tong2', 'tong3', 'tiao1', 'tiao2', 'tiao3'];
            
            let index = 0;
            const allPaths = [
                ...actions.map(a => `audio/${voice}/actions/${a}.mp3`),
                ...commonTiles.map(t => `audio/${voice}/tiles/${t}.mp3`)
            ];
            
            function loadNext() {
                if (index >= allPaths.length) return;
                const path = allPaths[index++];
                if (!audioCache[path] && !audioLoading[path]) {
                    audioLoading[path] = true;
                    const audio = new Audio();
                    audio.preload = 'auto';
                    audio.src = path;
                    audio.addEventListener('canplaythrough', () => {
                        audioCache[path] = audio;
                        delete audioLoading[path];
                        setTimeout(loadNext, 200);  // 间隔加载，不抢带宽
                    }, { once: true });
                    audio.addEventListener('error', () => {
                        delete audioLoading[path];
                        setTimeout(loadNext, 100);
                    }, { once: true });
                    audio.load();
                } else {
                    setTimeout(loadNext, 50);
                }
            }
            
            loadNext();
            console.log('开始后台预加载常用音频');
        }
        
        // 预加载单个音频（保留接口）
        function preloadSingleAudio(path) {
            // 使用静默预加载
        }
        
        // 分批加载音频（保留接口）
        function loadAudioBatch(paths, batchSize = 5, delay = 100) {
            // 使用静默预加载
        }
        
        // 播放音频（带弱网检测）
        const originalPlayAudioFile = playAudioFile;
        playAudioFile = function(path, volume = 1.0) {
            // 弱网时跳过音频播放
            if (networkQuality === 'slow' && !audioEnabled) {
                return;
            }
            
            try {
                if (audioCache[path]) {
                    const audio = audioCache[path].cloneNode();
                    audio.volume = volume;
                    audio.play().catch(e => {});
                    return;
                }
                
                // 懒加载并播放
                const audio = new Audio(path);
                audio.volume = volume;
                audio.play().then(() => {
                    audioCache[path] = audio;
                }).catch(e => {});
            } catch (e) {}
        };
        
        document.addEventListener('DOMContentLoaded', () => {
            // 初始化语音
            initVoice();
            // 延迟启动音频预加载
            setTimeout(preloadMultiplayerAudio, 2000);
        });
        
        // ==================== 语音播报系统（备用） ====================
        let speechEnabled = true;
        let audioContext = null;
        let speechReady = false;
        let voicesLoaded = false;
        
        // 初始化语音系统（需要用户交互）
        function initSpeech() {
            if (speechReady) return;
            
            try {
                // 初始化 AudioContext
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                // 尝试加载语音
                if (window.speechSynthesis) {
                    // 某些浏览器需要先获取语音列表
                    const voices = speechSynthesis.getVoices();
                    if (voices.length > 0) {
                        voicesLoaded = true;
                        console.log('语音列表已加载:', voices.length, '个');
                    }
                    
                    // 监听语音列表加载
                    speechSynthesis.onvoiceschanged = () => {
                        voicesLoaded = true;
                        console.log('语音列表已更新');
                    };
                    
                    // 播放一个空的测试
                    const testUtterance = new SpeechSynthesisUtterance('');
                    testUtterance.volume = 0;
                    speechSynthesis.speak(testUtterance);
                }
                
                speechReady = true;
                console.log('语音系统初始化成功');
            } catch (e) {
                console.error('语音系统初始化失败:', e);
            }
        }
        
        // 在用户首次交互时初始化
        document.addEventListener('click', function initOnClick() {
            initSpeech();
            document.removeEventListener('click', initOnClick);
        }, { once: true });
        
        document.addEventListener('touchstart', function initOnTouch() {
            initSpeech();
            document.removeEventListener('touchstart', initOnTouch);
        }, { once: true });
        
        // 获取牌的语音名称
        function getTileSpeechName(tile) {
            const numNames = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
            return numNames[tile.value] + TYPE_NAMES[tile.type];
        }
        
        // 检测是否是华为设备
        const isHuawei = /huawei|honor/i.test(navigator.userAgent);
        let speechRetryCount = 0;
        const MAX_SPEECH_RETRY = 3;
        
        // 语音播报（增强华为兼容性）
        function speak(text, rate = 1.0, pitch = 1.0) {
            if (!speechEnabled) return;
            
            // 尝试使用 Web Speech API
            if (window.speechSynthesis) {
                try {
                    // 华为设备特殊处理：先取消再延迟说话
                    window.speechSynthesis.cancel();
                    
                    // 华为设备需要延迟执行
                    const delay = isHuawei ? 100 : 0;
                    
                    setTimeout(() => {
                        const utterance = new SpeechSynthesisUtterance(text);
                        utterance.lang = 'zh-CN';
                        utterance.rate = isHuawei ? Math.min(rate, 0.9) : rate; // 华为降低语速
                        utterance.pitch = pitch;
                        utterance.volume = 1.0;
                        
                        // 尝试选择中文语音
                        const voices = speechSynthesis.getVoices();
                        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
                        if (zhVoice) {
                            utterance.voice = zhVoice;
                        }
                        
                        // 华为设备：监听错误并重试
                        utterance.onerror = (e) => {
                            console.warn('语音播报出错:', e.error);
                            if (isHuawei && speechRetryCount < MAX_SPEECH_RETRY) {
                                speechRetryCount++;
                                console.log(`华为设备重试语音 (${speechRetryCount}/${MAX_SPEECH_RETRY})`);
                                setTimeout(() => speak(text, rate, pitch), 200);
                            } else {
                                // 使用音效备用
                                playBeep(660, 150);
                                vibrate(50);
                            }
                        };
                        
                        utterance.onend = () => {
                            speechRetryCount = 0; // 成功后重置计数
                        };
                        
                        window.speechSynthesis.speak(utterance);
                        
                        // 华为设备额外检查：如果3秒后还没说完可能卡住了
                        if (isHuawei) {
                            setTimeout(() => {
                                if (window.speechSynthesis.speaking) {
                                    // 可能卡住了，强制取消
                                    window.speechSynthesis.cancel();
                                }
                            }, 3000);
                        }
                    }, delay);
                    
                } catch (e) {
                    console.error('语音播报失败:', e);
                    // 备用：音效 + 振动提示
                    playBeep(660, 150);
                    vibrate(50);
                }
            } else {
                // 不支持语音合成，使用音效 + 振动
                playBeep(660, 150);
                vibrate(50);
            }
        }
        
        // 振动备用方案
        function vibrate(duration = 50) {
            if (navigator.vibrate) {
                navigator.vibrate(duration);
            }
        }
        
        // 播放简单音效（兼容性更好）
        function playBeep(frequency = 440, duration = 100, type = 'sine') {
            try {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioContext.state === 'suspended') audioContext.resume();
                
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.type = type;
                oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + duration / 1000);
            } catch (e) {
                console.log('音效播放失败:', e);
            }
        }
        
        // 播报出牌（使用音频文件，支持多种语音）
        function speakDiscard(tile, voice = 'female01') {
            // 使用音频播放
            playTileAudio(tile, voice);
        }
        
        // 播报听牌
        function speakTing() {
            speak('听', 1.0, 1.3);
            playBeep(880, 150);
        }
        
        // 播报碰（使用音频，支持多种语音）
        function speakPeng(voice = 'female01') {
            playActionAudio('peng', voice);
        }
        
        // 播报杠（使用音频，支持多种语音）
        function speakGang(voice = 'female01') {
            playActionAudio('gang', voice);
        }
        
        // 播报胡牌（使用音频，支持多种语音）
        function speakHu(isZimo = false, voice = 'female01') {
            playActionAudio(isZimo ? 'zimo' : 'hu', voice);
            // 播放胜利音效
            playBeep(523, 100);
            setTimeout(() => playBeep(659, 100), 100);
            setTimeout(() => playBeep(784, 150), 200);
        }
        
        // 播放爆炸音效（放炮时）
        function playExplosionSound() {
            try {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioContext.state === 'suspended') audioContext.resume();
                
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.3);
                
                gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.4);
            } catch (e) {
                console.log('音效播放失败:', e);
                vibrate(200);
            }
        }
        
        // 播报放炮
        function speakFangPao() {
            playExplosionSound();
            setTimeout(() => speak('放炮', 0.8, 0.6), 300);
        }

        // 连接服务器
        let isConnected = false;
        let connectionAttempts = 0;
        
        function connectServer() {
            // 检测是否在 GitHub Pages 等静态托管上
            const isStaticHost = window.location.hostname.includes('github.io') || 
                                 window.location.hostname.includes('gitee.io') ||
                                 window.location.hostname.includes('netlify.app') ||
                                 window.location.hostname.includes('vercel.app');
            
            if (isStaticHost) {
                // 静态托管无法运行 WebSocket 服务器，显示提示
                showServerRequiredModal();
                return;
            }
            
            // 自动检测服务器地址
            const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? `http://${window.location.hostname}:3000`
                : window.location.origin;
            
            socket = io(serverUrl, {
                timeout: 10000,            // 增加超时时间
                reconnectionAttempts: 5,   // 增加重连次数
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                transports: ['websocket', 'polling'],  // 优先 WebSocket
                upgrade: true
            });

            socket.on('connect', () => {
                console.log('已连接服务器');
                myPlayerId = socket.id;
                isConnected = true;
                connectionAttempts = 0;
                
                // 启动网络质量检测
                startPingMonitor();
                updateNetworkIndicator('good');
            });

            socket.on('disconnect', () => {
                console.log('与服务器断开连接');
                isConnected = false;
                showToast('连接已断开');
            });
            
            socket.on('connect_error', () => {
                connectionAttempts++;
                if (connectionAttempts >= 3) {
                    showServerRequiredModal();
                }
            });

            // 房间事件
            socket.on('room_created', (data) => {
                currentRoom = data.roomCode;
                showRoomScreen();
            });

            socket.on('room_joined', (data) => {
                currentRoom = data.roomCode;
                showRoomScreen();
            });

            socket.on('join_error', (data) => {
                showToast(data.message);
            });

            socket.on('room_updated', (data) => {
                updateRoomUI(data.room);
            });
            
            // 玩家离线提示
            socket.on('player_offline', (data) => {
                showToast(`⚠️ ${data.username} 断线了，等待重连...`, 5000);
            });
            
            // 玩家重连
            socket.on('player_reconnected', (data) => {
                showToast(`✅ ${data.username} 已重连！`);
            });

            // 游戏事件
            socket.on('game_started', (data) => {
                mySeatIndex = data.yourSeat;
                gameState = data.gameState;
                
                // 重置听牌状态
                isTing = false;
                tingList = [];
                lastDrawnTileId = null;
                selectedTileId = null;
                
                // 关闭结算弹窗
                document.getElementById('roundResultModal').classList.remove('active');
                
                // 检查是否被AI接管
                const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
                if (myPlayer && myPlayer.aiTakeover) {
                    isAITakeover = true;
                    showTakeoverButton();
                    showToast('⚠️ AI正在代替你进行游戏，点击"接管AI"恢复控制', 5000);
                } else {
                    isAITakeover = false;
                    hideTakeoverButton();
                }
                
                // 更新局数和积分显示
                if (data.currentRound !== undefined) {
                    updateRoundDisplay(data.currentRound, data.totalRounds);
                }
                if (data.matchScores) {
                    updateScorePanel(data.matchScores);
                }
                
                showGameScreen();
                updateGameUI();
                
                // 后台预加载常用音频（延迟执行，不阻塞UI）
                setTimeout(() => {
                    silentPreloadAudio(myVoice);
                }, 1000);
                
                // 【增强】处理重连
                if (data.isReconnect) {
                    showToast('🔄 已重新连接！继续游戏...', 3000);
                    console.log('断线重连成功，座位:', mySeatIndex, '当前轮到:', gameState.currentPlayerIndex);
                    
                    // 如果轮到自己，触发自动摸牌或显示出牌提示
                    if (gameState.currentPlayerIndex === mySeatIndex) {
                        if (gameState.turnPhase === 'draw') {
                            setTimeout(() => autoDrawTile(), 500);
                        }
                    }
                } else {
                    showToast(`第 ${data.currentRound || 1}/${data.totalRounds || 10} 局开始！`);
                }
            });
            
            // 【新增】轮到你的回合（重连后通知）
            socket.on('your_turn', (data) => {
                console.log('轮到你了:', data);
                showToast(`🎯 ${data.message}`, 3000);
                
                if (data.phase === 'draw') {
                    // 自动摸牌
                    setTimeout(() => autoDrawTile(), 300);
                }
            });

            socket.on('game_state_update', (data) => {
                const prevPhase = gameState?.turnPhase;
                const prevPlayer = gameState?.currentPlayerIndex;
                
                gameState = data.gameState;
                updateGameUI();
                
                console.log('游戏状态更新:', '玩家:', gameState.currentPlayerIndex, '阶段:', gameState.turnPhase, '我的座位:', mySeatIndex);
                
                // 自动摸牌：轮到玩家且是摸牌阶段时自动摸牌
                // 只在状态变化时触发，防止重复
                const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
                const phaseChanged = prevPhase !== gameState.turnPhase || prevPlayer !== gameState.currentPlayerIndex;
                
                // 【UI改进】轮到自己时显示提示和发光效果
                if (isMyTurn && gameState.turnPhase === 'discard' && phaseChanged) {
                    showTurnIndicator(true);
                    updateMyTurnEffect(true);
                } else if (!isMyTurn || gameState.turnPhase !== 'discard') {
                    updateMyTurnEffect(false);
                }
                
                // 【新增】如果不是我的出牌回合，停止倒计时
                if (!isMyTurn || gameState.turnPhase !== 'discard') {
                    stopDiscardCountdown();
                } else if (isMyTurn && gameState.turnPhase === 'discard' && !discardCountdownTimer) {
                    // 轮到自己出牌但没有倒计时在运行，可能是重连后
                    console.log('检测到出牌阶段无倒计时，启动倒计时');
                    startDiscardCountdown(15);
                }
                
                if (isMyTurn && gameState.turnPhase === 'draw' && phaseChanged) {
                    console.log('触发自动摸牌...');
                    setTimeout(() => {
                        autoDrawTile();
                    }, 500);
                }
            });

            socket.on('tile_drawn', (data) => {
                lastDrawnTileId = data.tile.id; // 记录刚摸的牌
                showToast(`摸到: ${getTileName(data.tile)}`);
                
                // 重新渲染手牌以显示新牌高亮
                if (gameState) {
                    const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
                    if (myPlayer && myPlayer.hand) {
                        renderMyHand(myPlayer.hand);
                    }
                }
                
                // 听牌后自动出牌：延迟执行，先等待服务器检查是否能胡牌
                if (isTing && lastDrawnTileId) {
                    console.log('已听牌，等待服务器检查胡牌...');
                    // 标记等待胡牌检查
                    pendingAutoDiscard = true;
                    pendingAutoDiscardTileId = lastDrawnTileId;
                    // 延迟1.5秒后自动出牌（如果没有收到胡牌选项）
                    setTimeout(() => {
                        if (pendingAutoDiscard && pendingAutoDiscardTileId) {
                            console.log('未收到胡牌选项，自动出牌');
                            showToast('听牌中，自动出牌...');
                            selectedTileId = pendingAutoDiscardTileId;
                            discardTile();
                            pendingAutoDiscard = false;
                            pendingAutoDiscardTileId = null;
                        }
                    }, 1500);
                }
            });
            
            // 摸到花牌自动补花
            socket.on('flower_drawn', (data) => {
                showToast(`🌸 摸到花牌：${data.flowerName}，补花中...`, 2000);
                playBeep(880, 100); // 播放提示音
                
                // 更新花牌显示
                const flowerEl = document.getElementById(`flower-${mySeatIndex}`);
                if (flowerEl) {
                    flowerEl.textContent = `🌸${data.totalFlowers}`;
                }
            });

            socket.on('tile_discarded', (data) => {
                const player = gameState.players[data.playerIndex];
                const playerName = player?.username || '玩家';
                const playerVoice = player?.voice || getPlayerVoiceBySeat(data.playerIndex);
                const isMe = data.playerIndex === mySeatIndex;
                if (!isMe) {
                    showToast(`${playerName}: ${data.tileName}`);
                }
                // 语音播报出牌（使用出牌玩家的语音）
                speakDiscard(data.tile, playerVoice);
            });

            socket.on('action_available', (data) => {
                console.log('收到可执行动作:', data.actions);
                
                // 取消等待自动出牌（收到任何动作选项都应该取消）
                pendingAutoDiscard = false;
                pendingAutoDiscardTileId = null;
                
                // 检查是否可以胡牌（包括点炮胡和自摸胡）
                const canHu = data.actions.includes('hu') || data.actions.includes('hu_zimo');
                
                // 自动胡牌：如果可以胡，自动执行
                if (canHu) {
                    const huAction = data.actions.includes('hu_zimo') ? 'hu_zimo' : 'hu';
                    console.log('可以胡牌，自动胡牌！动作:', huAction);
                    showToast('🎉 自摸胡牌！');
                    setTimeout(() => {
                        doAction(huAction);
                    }, 500);
                    return;
                }
                
                // 如果听牌状态，自动过（不碰不杠）
                if (isTing) {
                    console.log('已听牌，自动过');
                    setTimeout(() => {
                        doAction('pass');
                    }, 300);
                    return;
                }
                
                showResponseButtons(data.actions);
            });
            
            socket.on('action_timeout', () => {
                console.log('动作超时，隐藏按钮');
                hideResponseButtons();
            });
            
            socket.on('action_error', (data) => {
                console.log('动作错误:', data.message);
                showToast('操作超时，请等待下次机会');
                hideResponseButtons();
            });

            socket.on('action_executed', (data) => {
                const player = gameState.players.find(p => p.seatIndex === data.playerIndex);
                const playerName = player?.username || '玩家';
                const playerVoice = player?.voice || getPlayerVoiceBySeat(data.playerIndex);
                const isMe = data.playerIndex === mySeatIndex;
                
                // 显示动作特效（碰/杠/胡 大字动画）
                if (data.action === 'peng' || data.action === 'gang' || data.action === 'hu' || data.action === 'hu_zimo') {
                    showActionEffect(data.action, playerName);
                }
                
                if (data.action === 'peng') {
                    showToast(`${isMe ? '你' : playerName} 碰！`);
                    speakPeng(playerVoice);
                } else if (data.action === 'gang') {
                    showToast(`${isMe ? '你' : playerName} 杠！`);
                    speakGang(playerVoice);
                } else if (data.action === 'hu') {
                    showToast(`${isMe ? '你' : playerName} 胡了！`);
                    speakHu(false, playerVoice);
                }
            });

            socket.on('ai_draw', (data) => {
                // AI摸牌提示
            });
            
            // 【新增】出牌倒计时
            socket.on('discard_countdown', (data) => {
                console.log(`出牌倒计时开始: ${data.seconds}秒`);
                startDiscardCountdown(data.seconds);
            });
            
            // 【新增】自动出牌通知
            socket.on('auto_discard', (data) => {
                console.log('超时自动出牌:', data.tile);
                showToast('⏰ ' + data.message);
                stopDiscardCountdown();
            });

            socket.on('game_ended', (data) => {
                // 检测是否有人胡牌
                if (data.result.includes('胡')) {
                    const isZimo = data.result.includes('自摸');
                    speakHu(isZimo);
                    
                    // 如果是点炮，播放爆炸音效
                    if (!isZimo && data.result.includes('胡牌')) {
                        setTimeout(() => playExplosionSound(), 500);
                    }
                }
                showResult(data.result, data.players);
            });
            
            // 单局结算
            socket.on('round_ended', (data) => {
                console.log('单局结算:', data);
                // 重置准备按钮状态
                const btn = document.getElementById('continueNextBtn');
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-play"></i> 继续下一局';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
                showRoundResult(data);
            });
            
            // 倒计时更新
            socket.on('countdown_update', (data) => {
                console.log('倒计时更新:', data.seconds);
                const countdownEl = document.getElementById('countdownSeconds');
                if (countdownEl) {
                    countdownEl.textContent = data.seconds;
                    // 最后5秒变红
                    if (data.seconds <= 5) {
                        countdownEl.style.color = '#e74c3c';
                    } else {
                        countdownEl.style.color = '';
                    }
                }
                // 更新玩家准备状态
                if (data.readyStatus) {
                    updatePlayersReadyStatus(data.readyStatus);
                }
            });
            
            // 准备状态更新
            socket.on('ready_status_update', (data) => {
                console.log('准备状态更新:', data);
                updatePlayersReadyStatus(data.readyStatus);
                if (data.countdown !== undefined) {
                    const countdownEl = document.getElementById('countdownSeconds');
                    if (countdownEl) {
                        countdownEl.textContent = data.countdown;
                    }
                }
            });
            
            // AI接管状态
            socket.on('ai_takeover_status', (data) => {
                console.log('AI接管状态:', data);
                updatePlayersReadyStatus(data.readyStatus);
                
                // 检查自己是否被接管
                const myStatus = data.readyStatus.find(p => p.seatIndex === mySeatIndex);
                if (myStatus && myStatus.aiTakeover) {
                    showToast('⚠️ 你未准备，AI将代替你进行游戏', 3000);
                    isAITakeover = true;
                }
            });
            
            // 接管AI成功
            socket.on('takeover_success', (data) => {
                console.log('接管AI成功:', data);
                showToast('✅ 已恢复控制权！', 2000);
                isAITakeover = false;
                hideTakeoverButton();
            });
            
            // 其他玩家接管AI
            socket.on('player_takeover', (data) => {
                console.log('玩家接管AI:', data);
                showToast(`${data.username} 恢复了控制权`);
            });
            
            // 比赛结束
            socket.on('match_ended', (data) => {
                console.log('比赛结束:', data);
                showMatchResult(data);
            });

            // 聊天
            socket.on('chat_message', (data) => {
                addChatMessage(data.username, data.message);
            });
            
            // 监听表情气泡事件
            socket.on('emoji_received', (data) => {
                // 在发送者头像位置显示表情气泡
                if (data.seatIndex !== mySeatIndex) {
                    showEmojiBubble(data.emoji, data.seatIndex);
                }
            });
            
            // 监听轻量级更新（性能优化）
            socket.on('light_update', (data) => {
                // 快速更新关键状态
                if (gameState && data) {
                    gameState.currentPlayerIndex = data.c;
                    gameState.turnPhase = data.t;
                    gameState.deckRemaining = data.r;
                    // 轻量更新不重绘手牌
                    $('deckCount').textContent = data.r;
                }
            });
            
            // 网络延迟检测
            socket.on('pong', () => {
                const ping = Date.now() - lastPingTime;
                updateNetworkQuality(ping);
                updateNetworkIndicator(networkQuality);
            });
        }
        
        // ==================== 网络质量监控 ====================
        
        let pingInterval = null;
        
        // 启动 Ping 监控
        function startPingMonitor() {
            if (pingInterval) clearInterval(pingInterval);
            
            pingInterval = setInterval(() => {
                if (socket && socket.connected) {
                    lastPingTime = Date.now();
                    socket.emit('ping');
                }
            }, 5000); // 每5秒检测一次
        }
        
        // 更新网络指示器
        function updateNetworkIndicator(quality) {
            const indicator = $('networkIndicator') || document.getElementById('networkIndicator');
            const status = $('networkStatus') || document.getElementById('networkStatus');
            
            if (!indicator) return;
            
            indicator.className = 'network-indicator';
            
            switch (quality) {
                case 'slow':
                    indicator.classList.add('slow');
                    status.textContent = '⚠️ 网络较慢';
                    document.body.classList.add('reduce-motion');
                    break;
                case 'medium':
                    indicator.classList.add('medium');
                    status.textContent = '📶 网络一般';
                    break;
                default:
                    // good - 隐藏指示器
                    document.body.classList.remove('reduce-motion');
                    break;
            }
        }
        
        // 监听网络状态变化
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                const conn = navigator.connection;
                if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
                    networkQuality = 'slow';
                    updateNetworkIndicator('slow');
                    showToast('⚠️ 检测到弱网环境，已启用省流模式');
                }
            });
        }
        
        // 页面可见性变化时处理
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // 页面恢复可见时，请求完整状态同步
                if (socket && socket.connected && gameState) {
                    socket.emit('request_sync');
                }
            }
        });

        // 显示服务器要求提示
        function showServerRequiredModal() {
            document.getElementById('serverRequiredModal').classList.add('active');
        }
        
        function closeServerModal() {
            document.getElementById('serverRequiredModal').classList.remove('active');
        }
        
        // 初始化语音
        function initVoice() {
            // 默认女声1
            myVoice = 'female01';
            console.log('初始化语音:', myVoice);
        }
        
        // 选择语音
        function selectVoice(voice) {
            myVoice = voice;
            // 更新按钮状态
            document.getElementById('voiceFemale01').classList.toggle('active', voice === 'female01');
            document.getElementById('voiceFemale02').classList.toggle('active', voice === 'female02');
            document.getElementById('voiceMale').classList.toggle('active', voice === 'male');
            document.getElementById('voiceMale02').classList.toggle('active', voice === 'male02');
            console.log('选择语音:', voice);
        }
        
        // 创建房间
        function createRoom() {
            if (!isConnected) {
                showServerRequiredModal();
                return;
            }
            username = document.getElementById('usernameInput').value.trim() || '玩家' + Math.floor(Math.random() * 1000);
            socket.emit('create_room', { username, avatar: '👤', voice: myVoice });
        }

        // 加入房间
        function joinRoom() {
            if (!isConnected) {
                showServerRequiredModal();
                return;
            }
            username = document.getElementById('usernameInput').value.trim() || '玩家' + Math.floor(Math.random() * 1000);
            const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
            
            if (roomCode.length !== 6) {
                showToast('请输入6位房间号');
                return;
            }
            
            socket.emit('join_room', { roomCode, username, avatar: '👤', voice: myVoice });
        }

        // 显示房间界面
        function showRoomScreen() {
            document.getElementById('lobbyScreen').classList.remove('active');
            document.getElementById('roomScreen').classList.add('active');
            document.getElementById('displayRoomCode').textContent = currentRoom;
        }

        // 更新房间UI
        function updateRoomUI(room) {
            const grid = document.getElementById('playersGrid');
            grid.innerHTML = '';
            
            for (let i = 0; i < 4; i++) {
                const player = room.players.find(p => p.seatIndex === i);
                const slot = document.createElement('div');
                slot.className = 'player-slot' + (player ? ' filled' : '') + (player?.ready ? ' ready' : '');
                
                if (player) {
                    const isMe = player.id === myPlayerId;
                    slot.innerHTML = `
                        <div class="player-avatar">${player.avatar || '👤'}</div>
                        <div class="player-name">${player.username}${isMe ? ' (我)' : ''}</div>
                        <div class="player-wind">${player.windName}风</div>
                        <div class="player-status ${player.isHost ? 'host' : (player.ready ? 'ready' : 'waiting')}">
                            ${player.isHost ? '房主' : (player.ready ? '已准备' : '未准备')}
                        </div>
                    `;
                } else {
                    slot.innerHTML = `<div class="empty-slot">等待玩家加入...</div>`;
                }
                
                grid.appendChild(slot);
            }
        }

        // 复制房间号
        function copyRoomCode() {
            const roomCode = currentRoom || document.getElementById('displayRoomCode').textContent;
            
            // 尝试使用现代 API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(roomCode).then(() => {
                    showToast('房间号已复制: ' + roomCode);
                }).catch(() => {
                    // 失败时使用备用方案
                    fallbackCopy(roomCode);
                });
            } else {
                // 不支持 clipboard API，使用备用方案
                fallbackCopy(roomCode);
            }
        }
        
        // 备用复制方法（兼容 HTTP）
        function fallbackCopy(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.style.top = '-9999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                showToast('房间号已复制: ' + text);
            } catch (err) {
                showToast('复制失败，请手动复制: ' + text);
            }
            
            document.body.removeChild(textArea);
        }

        // 准备/取消准备
        function toggleReady() {
            isReady = !isReady;
            socket.emit('toggle_ready', { ready: isReady });
            
            const btn = document.getElementById('readyBtn');
            btn.innerHTML = isReady ? '<i class="fas fa-times"></i> 取消准备' : '<i class="fas fa-check"></i> 准备';
            btn.classList.toggle('secondary', isReady);
        }

        // 离开房间
        function leaveRoom() {
            socket.emit('leave_room');
            currentRoom = null;
            isReady = false;
            document.getElementById('roomScreen').classList.remove('active');
            document.getElementById('lobbyScreen').classList.add('active');
        }

        // 显示游戏界面
        function showGameScreen() {
            document.getElementById('roomScreen').classList.remove('active');
            document.getElementById('gameScreen').classList.add('active');
            // 只在大屏幕显示聊天区域
            if (window.innerWidth > 768) {
                document.getElementById('chatArea').style.display = 'block';
            } else {
                document.getElementById('chatArea').style.display = 'none';
            }
            document.getElementById('actionButtons').classList.add('active');
            // 添加游戏中标记（用于游戏界面样式）
            document.body.classList.add('in-game');
            
            // 【修复】关闭可能存在的弹窗
            document.getElementById('roundResultModal')?.classList.remove('active');
            document.getElementById('matchResultModal')?.classList.remove('active');
            document.getElementById('resultModal')?.classList.remove('active');
        }

        // 更新游戏UI - 优化版（增量更新 + RAF）
        function updateGameUI() {
            if (!gameState) return;
            
            // 使用 requestAnimationFrame 批量更新
            scheduleUpdate(() => {
                _doUpdateGameUI();
            });
        }
        
        function _doUpdateGameUI() {
            if (!gameState) return;
            
            const prev = prevGameState;
            
            // 更新剩余牌数（只在变化时更新）
            if (!prev || prev.deckRemaining !== gameState.deckRemaining) {
                $('deckCount').textContent = gameState.deckRemaining;
                const centerEl = $('centerDeckCount');
                if (centerEl) centerEl.textContent = gameState.deckRemaining;
            }

            // 更新当前回合提示
            if (!prev || prev.currentPlayerIndex !== gameState.currentPlayerIndex) {
                const currentPlayer = gameState.players[gameState.currentPlayerIndex];
                const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
                $('currentTurnText').textContent = 
                    isMyTurn ? '轮到你了！' : `${currentPlayer?.username || ''}的回合`;
                $('currentWindIcon').textContent = 
                    WIND_NAMES[currentPlayer?.wind] || '';
            }

            // 更新各个座位（只更新变化的座位）
            gameState.players.forEach((player, idx) => {
                const displaySeat = getDisplaySeat(player.seatIndex);
                const prevPlayer = prev?.players?.[idx];
                
                // 检查是否需要更新
                const needUpdate = !prevPlayer ||
                    prevPlayer.handCount !== player.handCount ||
                    prevPlayer.offline !== player.offline ||
                    gameState.currentPlayerIndex !== prev?.currentPlayerIndex;
                    
                if (needUpdate) {
                    updateSeatUI(displaySeat, player);
                }
                
                // 更新花牌显示
                const prevFlowerCount = prevPlayer?.flowers?.length || 0;
                const flowerCount = player.flowers ? player.flowers.length : 0;
                if (prevFlowerCount !== flowerCount) {
                    const flowerEl = $(`flower-${displaySeat}`);
                    if (flowerEl) {
                        flowerEl.textContent = `🌸${flowerCount}`;
                    }
                }
            });

            // 更新我的手牌（只在手牌变化时完全重绘）
            const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
            const prevMyPlayer = prev?.players?.find(p => p.seatIndex === mySeatIndex);
            
            if (myPlayer && myPlayer.hand) {
                const handChanged = !prevMyPlayer || 
                    !prevMyPlayer.hand ||
                    myPlayer.hand.length !== prevMyPlayer.hand.length ||
                    myPlayer.hand.some((t, i) => t.id !== prevMyPlayer.hand[i]?.id);
                    
                if (handChanged) {
                    renderMyHand(myPlayer.hand);
                }
                
                const meldsChanged = !prevMyPlayer ||
                    myPlayer.melds.length !== prevMyPlayer.melds?.length;
                    
                if (meldsChanged) {
                    renderMyMelds(myPlayer.melds);
                }
            }

            // 更新出牌区（只在有新弃牌时更新）
            const discardsChanged = gameState.players.some((p, i) => {
                const prevP = prev?.players?.[i];
                return !prevP || p.discards.length !== prevP.discards.length;
            });
            
            if (discardsChanged) {
                updateDiscardArea();
            }

            // 更新按钮状态
            updateActionButtons();
            
            // 保存当前状态用于下次比较
            prevGameState = JSON.parse(JSON.stringify(gameState));
        }

        // 获取显示座位（相对于自己的位置）
        function getDisplaySeat(seatIndex) {
            // 将绝对座位转换为相对位置：0=自己, 1=右家, 2=对家, 3=左家
            return (seatIndex - mySeatIndex + 4) % 4;
        }

        // 更新座位UI
        function updateSeatUI(displaySeat, player) {
            if (displaySeat === 0) return; // 自己的座位单独处理

            const prefix = displaySeat === 1 ? 'seat-1' : displaySeat === 2 ? 'seat-2' : 'seat-3';
            
            const avatarEl = document.getElementById(`avatar-${displaySeat}`);
            avatarEl.textContent = player.avatar || '🤖';
            avatarEl.classList.toggle('current-turn', gameState.currentPlayerIndex === player.seatIndex);
            avatarEl.classList.toggle('offline', player.offline === true);  // 【新增】离线样式
            
            document.getElementById(`name-${displaySeat}`).textContent = player.username;
            document.getElementById(`wind-${displaySeat}`).textContent = player.windName;
            
            // 【新增】座位信息离线样式
            const seatInfo = avatarEl.closest('.seat-info') || avatarEl.parentElement;
            if (seatInfo) {
                seatInfo.classList.toggle('offline', player.offline === true);
            }

            // 显示手牌数量（背面）
            const tilesDiv = document.getElementById(`tiles-${displaySeat}`);
            tilesDiv.innerHTML = '';
            for (let i = 0; i < player.handCount; i++) {
                const tile = document.createElement('div');
                tile.className = 'tile small back';
                tilesDiv.appendChild(tile);
            }
        }

        // 渲染我的手牌 - 优化版（使用 DocumentFragment）
        function renderMyHand(hand) {
            const container = $('myHand') || document.getElementById('myHand');
            
            // 使用 DocumentFragment 批量构建 DOM
            const fragment = document.createDocumentFragment();
            
            hand.forEach((tile, index) => {
                const isNewTile = (tile.id === lastDrawnTileId);
                const tileEl = createTileElement(tile, { isNew: isNewTile });
                
                // 使用事件委托提升性能
                tileEl.dataset.tileId = tile.id;
                if (tile.id === selectedTileId) {
                    tileEl.classList.add('selected');
                }
                fragment.appendChild(tileEl);
            });
            
            // 一次性替换所有内容
            container.innerHTML = '';
            container.appendChild(fragment);
        }
        
        // 手牌区域点击事件委托（减少事件监听器数量）
        document.addEventListener('DOMContentLoaded', () => {
            const handContainer = document.getElementById('myHand');
            if (handContainer) {
                handContainer.addEventListener('click', (e) => {
                    const tileEl = e.target.closest('.tile');
                    if (tileEl && tileEl.dataset.tileId) {
                        selectTile(tileEl.dataset.tileId);
                    }
                });
            }
        });

        // 创建麻将牌元素
        function createTileElement(tile, options = {}) {
            const { small = false, isNew = false, discarded = false } = options;
            const el = document.createElement('div');
            
            let classes = ['tile', tile.type];
            if (small) classes.push('small');
            if (discarded) classes.push('discarded');
            if (isNew) classes.push('new-tile');
            
            // 精灵图未加载完成时显示加载状态
            if (!spritesLoaded) {
                classes.push('loading');
            }
            
            el.className = classes.join(' ');
            
            // 应用精灵图位置
            const spritePos = getSpritePosition(tile);
            if (spritePos && spritesLoaded) {
                el.style.cssText = spritePos;
            } else if (!spritesLoaded) {
                // 图片加载中，延迟设置样式
                el.dataset.spriteStyle = spritePos;
            } else {
                // 备用文字显示
                el.classList.add('text-mode');
                el.innerHTML = `
                    <div class="tile-text">
                        <span class="tile-value">${NUM_NAMES[tile.value]}</span>
                        <span class="tile-type">${TYPE_NAMES[tile.type]}</span>
                    </div>
                `;
            }
            
            el.title = `${NUM_NAMES[tile.value]}${TYPE_NAMES[tile.type]}`;
            return el;
        }

        // 渲染我的副露
        function renderMyMelds(melds) {
            const container = document.getElementById('myMelds');
            container.innerHTML = '';

            melds.forEach(meld => {
                const group = document.createElement('div');
                group.className = 'meld-group';
                meld.tiles.forEach(tile => {
                    group.appendChild(createTileElement(tile, { small: true }));
                });
                container.appendChild(group);
            });
        }

        // 更新出牌区
        function updateDiscardArea() {
            // 更新中央剩余牌数
            const centerDeckCount = document.getElementById('centerDeckCount');
            if (centerDeckCount) {
                centerDeckCount.textContent = gameState.deckRemaining;
            }
            
            // 每个玩家的弃牌显示在自己门前
            gameState.players.forEach(player => {
                const displaySeat = getDisplaySeat(player.seatIndex);
                const container = document.getElementById(`discards-${displaySeat}`);
                if (!container) return;
                
                container.innerHTML = '';
                player.discards.forEach(tile => {
                    const tileEl = createTileElement(tile, { small: true });
                    container.appendChild(tileEl);
                });
            });
        }

        // 选择手牌（双击直接出牌）
        function selectTile(tileId) {
            console.log('选牌:', tileId, '当前玩家:', gameState.currentPlayerIndex, '我的座位:', mySeatIndex, '阶段:', gameState.turnPhase);
            
            // 只能在自己的回合选牌
            if (gameState.currentPlayerIndex !== mySeatIndex) {
                showToast('不是你的回合');
                return;
            }
            
            // 必须是出牌阶段
            if (gameState.turnPhase !== 'discard') {
                showToast('请等待摸牌...');
                return;
            }
            
            if (selectedTileId === tileId) {
                // 双击直接出牌
                discardTile();
                return;
            } else {
                selectedTileId = tileId;
            }
            
            document.querySelectorAll('#myHand .tile').forEach(el => {
                el.classList.remove('selected');
            });
            
            if (selectedTileId) {
                const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
                const tileIndex = myPlayer.hand.findIndex(t => t.id === selectedTileId);
                if (tileIndex !== -1) {
                    document.querySelectorAll('#myHand .tile')[tileIndex]?.classList.add('selected');
                }
            }
            
            document.getElementById('discardBtn').disabled = !selectedTileId;
        }

        // 更新动作按钮
        function updateActionButtons() {
            const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
            const actionBtns = document.getElementById('actionButtons');
            
            // 只在出牌阶段显示出牌按钮（摸牌是自动的）
            if (isMyTurn && gameState.turnPhase === 'discard') {
                actionBtns.classList.add('active');
                document.getElementById('discardBtn').disabled = !selectedTileId;
            } else {
                actionBtns.classList.remove('active');
            }
        }

        // 显示响应按钮
        function showResponseButtons(actions) {
            const container = document.getElementById('responseButtons');
            container.classList.add('active');
            
            container.querySelectorAll('.action-btn').forEach(btn => {
                const action = btn.classList.contains('hu') ? 'hu' :
                              btn.classList.contains('gang') ? 'gang' :
                              btn.classList.contains('peng') ? 'peng' : 'pass';
                btn.style.display = actions.includes(action) || action === 'pass' ? 'block' : 'none';
            });

            document.getElementById('actionButtons').classList.remove('active');
        }

        // 隐藏响应按钮
        function hideResponseButtons() {
            document.getElementById('responseButtons').classList.remove('active');
            document.getElementById('actionButtons').classList.add('active');
        }

        // 手动摸牌（备用）
        function drawTile() {
            socket.emit('draw_tile');
        }
        
        // 自动摸牌
        function autoDrawTile() {
            if (!gameState || gameState.currentPlayerIndex !== mySeatIndex) return;
            if (gameState.turnPhase !== 'draw') return;
            
            console.log('自动摸牌...');
            socket.emit('draw_tile');
        }

        // 出牌
        function discardTile() {
            if (!selectedTileId) {
                showToast('请先选择要打出的牌');
                return;
            }
            
            // 如果已听牌，只能打刚摸的牌
            if (isTing && selectedTileId !== lastDrawnTileId) {
                showToast('已听牌，只能打刚摸的牌！');
                return;
            }
            
            // 清除刚摸的牌标记
            lastDrawnTileId = null;
            
            // 【新增】停止出牌倒计时
            stopDiscardCountdown();
            
            socket.emit('discard_tile', { tileId: selectedTileId });
            selectedTileId = null;
            
            // 出牌后检测听牌（延迟等待服务器更新）
            setTimeout(() => {
                if (!isTing) {
                    checkAndShowTing();
                }
            }, 500);
        }

        // 执行动作
        function doAction(action) {
            console.log('执行动作:', action);
            socket.emit('player_action', { action });
            hideResponseButtons();
            
            // 显示动作特效
            if (action === 'peng' || action === 'gang' || action === 'hu' || action === 'hu_zimo') {
                showActionEffect(action);
                
                // 播放对应音频
                const myVoice = getPlayerVoiceBySeat(mySeatIndex);
                if (action === 'peng') {
                    playActionAudio('peng', myVoice);
                } else if (action === 'gang') {
                    playActionAudio('gang', myVoice);
                } else if (action === 'hu' || action === 'hu_zimo') {
                    playActionAudio('hu', myVoice);
                }
            }
        }
        
        // 【新增】出牌倒计时相关
        let discardCountdownTimer = null;
        let discardCountdownValue = 0;
        
        function startDiscardCountdown(seconds) {
            stopDiscardCountdown(); // 先清除之前的
            discardCountdownValue = seconds;
            
            // 创建或更新倒计时显示
            let countdownEl = document.getElementById('discardCountdown');
            if (!countdownEl) {
                countdownEl = document.createElement('div');
                countdownEl.id = 'discardCountdown';
                countdownEl.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8);
                    color: #FFD700;
                    font-size: 48px;
                    font-weight: bold;
                    padding: 20px 40px;
                    border-radius: 15px;
                    z-index: 1000;
                    pointer-events: none;
                    transition: opacity 0.3s;
                `;
                document.body.appendChild(countdownEl);
            }
            
            countdownEl.style.display = 'block';
            countdownEl.style.opacity = '1';
            updateCountdownDisplay();
            
            discardCountdownTimer = setInterval(() => {
                discardCountdownValue--;
                if (discardCountdownValue <= 0) {
                    stopDiscardCountdown();
                } else {
                    updateCountdownDisplay();
                    // 最后5秒变红色警告
                    if (discardCountdownValue <= 5) {
                        countdownEl.style.color = '#FF4444';
                    }
                }
            }, 1000);
        }
        
        function updateCountdownDisplay() {
            const countdownEl = document.getElementById('discardCountdown');
            if (countdownEl) {
                countdownEl.textContent = `⏱ ${discardCountdownValue}`;
            }
        }
        
        function stopDiscardCountdown() {
            if (discardCountdownTimer) {
                clearInterval(discardCountdownTimer);
                discardCountdownTimer = null;
            }
            const countdownEl = document.getElementById('discardCountdown');
            if (countdownEl) {
                countdownEl.style.opacity = '0';
                setTimeout(() => {
                    countdownEl.style.display = 'none';
                    countdownEl.style.color = '#FFD700'; // 重置颜色
                }, 300);
            }
        }

        // 获取牌名
        function getTileName(tile) {
            return NUM_NAMES[tile.value] + TYPE_NAMES[tile.type];
        }

        // 语音播报
        function speakTile(tile) {
            if ('speechSynthesis' in window) {
                const text = getTileName(tile);
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'zh-CN';
                utterance.rate = 1.2;
                speechSynthesis.speak(utterance);
            }
        }

        // 显示结果
        function showResult(result, players) {
            document.getElementById('resultTitle').textContent = result;
            
            let msg = '最终结果：\n\n';
            players.forEach(p => {
                msg += `${p.username}: ${p.score}分\n`;
            });
            document.getElementById('resultMessage').textContent = msg;
            
            document.getElementById('resultModal').classList.add('active');
        }

        // 关闭结果
        function closeResult() {
            document.getElementById('resultModal').classList.remove('active');
            document.getElementById('gameScreen').classList.remove('active');
            document.getElementById('roomScreen').classList.add('active');
            document.getElementById('chatArea').style.display = 'none';
            document.body.classList.remove('in-game');
            isReady = false;
            document.getElementById('readyBtn').innerHTML = '<i class="fas fa-check"></i> 准备';
        }
        
        // ==================== 计分系统 UI ====================
        
        // 当前比赛的积分
        let matchScores = [0, 0, 0, 0];
        let currentRound = 1;
        let totalRounds = 10;
        
        // 更新积分面板
        function updateScorePanel(scores) {
            matchScores = scores;
            for (let i = 0; i < 4; i++) {
                const displaySeat = getDisplaySeat(i);
                const scoreEl = document.getElementById(`score-${displaySeat}`);
                if (scoreEl) {
                    const score = scores[i];
                    scoreEl.textContent = score >= 0 ? `+${score}` : score;
                    scoreEl.className = 'score-value ' + (score >= 0 ? 'positive' : 'negative');
                }
            }
        }
        
        // 更新局数显示
        function updateRoundDisplay(current, total) {
            currentRound = current;
            totalRounds = total;
            document.getElementById('currentRoundNum').textContent = current;
            document.getElementById('currentRoundText').textContent = current;
            document.getElementById('totalRoundsText').textContent = total;
        }
        
        // 显示单局结算
        function showRoundResult(data) {
            const { roundResult, currentRound, totalRounds, matchScores } = data;
            
            // 更新积分面板
            updateScorePanel(matchScores);
            
            // 设置标题
            let title = '本局结算';
            if (roundResult.resultType === 'draw') {
                title = '流局';
                document.getElementById('roundWinnerInfo').style.display = 'none';
                document.getElementById('fanDetailList').style.display = 'none';
                document.getElementById('huaDetailList').style.display = 'none';
            } else {
                document.getElementById('roundWinnerInfo').style.display = 'block';
                document.getElementById('fanDetailList').style.display = 'block';
                document.getElementById('huaDetailList').style.display = 'block';
                
                const winner = roundResult.players.find(p => p.seatIndex === roundResult.winnerIndex);
                const winType = roundResult.resultType === 'zimo' ? '自摸胡牌！' : '胡牌！';
                document.getElementById('winnerName').textContent = winner ? winner.username : '';
                document.getElementById('winType').textContent = winType;
                
                // 显示番数明细
                if (roundResult.scoreResult) {
                    const fanItems = document.getElementById('fanItems');
                    fanItems.innerHTML = '';
                    if (roundResult.scoreResult.fanDetail && roundResult.scoreResult.fanDetail.length > 0) {
                        roundResult.scoreResult.fanDetail.forEach(item => {
                            fanItems.innerHTML += `<div class="fan-item"><span class="fan-name">${item.name}</span><span class="fan-value">+${item.fan}番</span></div>`;
                        });
                    } else {
                        fanItems.innerHTML = '<div class="fan-item"><span class="fan-name">鸡胡</span><span class="fan-value">0番</span></div>';
                    }
                    document.getElementById('totalFanDisplay').textContent = roundResult.scoreResult.totalFan + '番';
                    
                    // 显示花数明细
                    const huaItems = document.getElementById('huaItems');
                    huaItems.innerHTML = '';
                    if (roundResult.scoreResult.huaDetail) {
                        roundResult.scoreResult.huaDetail.forEach(item => {
                            huaItems.innerHTML += `<div class="fan-item"><span class="fan-name">${item.name}</span><span class="fan-value">+${item.hua}花</span></div>`;
                        });
                    }
                    document.getElementById('totalHuaDisplay').textContent = roundResult.scoreResult.totalHua + '花';
                }
            }
            
            document.getElementById('roundResultTitle').textContent = title;
            
            // 显示积分变化（表格样式，无表格线）
            const scoreChangeItems = document.getElementById('scoreChangeItems');
            
            // 按本局得分排序
            const sortedPlayers = [...roundResult.players].sort((a, b) => b.roundScore - a.roundScore);
            
            let tableHtml = '<table style="width: 100%; border-collapse: collapse;">';
            tableHtml += '<thead><tr style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">';
            tableHtml += '<th style="padding: 8px 5px; text-align: left;">排名</th>';
            tableHtml += '<th style="padding: 8px 5px; text-align: left;">玩家</th>';
            tableHtml += '<th style="padding: 8px 5px; text-align: right;">本局</th>';
            tableHtml += '<th style="padding: 8px 5px; text-align: right;">累计</th>';
            tableHtml += '</tr></thead><tbody>';
            
            sortedPlayers.forEach((p, idx) => {
                const change = p.roundScore;
                const changeColor = change > 0 ? '#2ecc71' : change < 0 ? '#e74c3c' : '#fff';
                const changeText = change >= 0 ? `+${change}` : change;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '4️⃣';
                const totalColor = p.totalScore > 0 ? '#2ecc71' : p.totalScore < 0 ? '#e74c3c' : '#fff';
                const totalText = p.totalScore >= 0 ? `+${p.totalScore}` : p.totalScore;
                const rowBg = idx === 0 && change > 0 ? 'rgba(46,204,113,0.15)' : 'transparent';
                
                tableHtml += `<tr style="background: ${rowBg};">`;
                tableHtml += `<td style="padding: 8px 5px;">${medal}</td>`;
                tableHtml += `<td style="padding: 8px 5px;">${p.username}${p.isBot ? ' (AI)' : ''}</td>`;
                tableHtml += `<td style="padding: 8px 5px; text-align: right; color: ${changeColor}; font-weight: bold;">${changeText}</td>`;
                tableHtml += `<td style="padding: 8px 5px; text-align: right; color: ${totalColor};">${totalText}</td>`;
                tableHtml += '</tr>';
            });
            
            tableHtml += '</tbody></table>';
            scoreChangeItems.innerHTML = tableHtml;
            
            // 显示局数
            document.getElementById('roundEndCurrent').textContent = currentRound;
            document.getElementById('roundEndTotal').textContent = totalRounds;
            
            // 如果是最后一局，隐藏继续按钮和倒计时区域
            const continueBtn = document.getElementById('continueNextBtn');
            const countdownArea = document.getElementById('nextRoundCountdown');
            if (currentRound >= totalRounds) {
                continueBtn.style.display = 'none';
                countdownArea.style.display = 'none';
            } else {
                continueBtn.style.display = 'block';
                countdownArea.style.display = 'block';
                
                // 初始化倒计时显示
                const countdownSeconds = data.countdownSeconds || 30;
                document.getElementById('countdownSeconds').textContent = countdownSeconds;
                
                // 初始化玩家准备状态（显示4个等待中）
                updatePlayersReadyStatus([]);
            }
            
            document.getElementById('roundResultModal').classList.add('active');
        }
        
        // 更新玩家准备状态显示
        function updatePlayersReadyStatus(readyStatus) {
            const container = document.getElementById('playersReadyStatus');
            if (!container) return;
            
            // 如果没有状态数据，使用游戏中的玩家信息
            if (!readyStatus || readyStatus.length === 0) {
                if (gameState && gameState.players) {
                    readyStatus = gameState.players.map(p => ({
                        seatIndex: p.seatIndex,
                        username: p.username,
                        ready: p.isBot,
                        isBot: p.isBot,
                        aiTakeover: false
                    }));
                } else {
                    return;
                }
            }
            
            container.innerHTML = readyStatus.map(p => {
                let statusClass = 'waiting';
                let statusIcon = '⏳';
                let statusText = '等待中';
                
                if (p.isBot) {
                    statusClass = 'ready';
                    statusIcon = '🤖';
                    statusText = 'AI';
                } else if (p.aiTakeover) {
                    statusClass = 'ai-takeover';
                    statusIcon = '🤖';
                    statusText = 'AI接管';
                } else if (p.ready) {
                    statusClass = 'ready';
                    statusIcon = '✓';
                    statusText = '已准备';
                }
                
                const isMe = p.seatIndex === mySeatIndex ? ' (我)' : '';
                
                return `
                    <div class="player-ready-item ${statusClass}">
                        ${statusIcon} ${p.username}${isMe}: ${statusText}
                    </div>
                `;
            }).join('');
        }
        
        // 继续下一局
        function continueNextRound() {
            // 更新按钮状态
            const btn = document.getElementById('continueNextBtn');
            btn.innerHTML = '<i class="fas fa-check"></i> 已准备，等待其他玩家...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            
            // 发送准备状态
            isReady = true;
            socket.emit('toggle_ready', { ready: true });
            
            showToast('已准备！等待其他玩家...');
            console.log('已发送准备状态，等待下一局');
        }
        
        // 接管AI（恢复控制权）
        function takeoverAI() {
            if (socket && isAITakeover) {
                socket.emit('takeover_ai');
                showToast('正在接管...');
            }
        }
        
        // 显示接管AI按钮
        function showTakeoverButton() {
            const container = document.getElementById('takeoverContainer');
            if (container) {
                container.style.display = 'block';
            }
        }
        
        // 隐藏接管AI按钮
        function hideTakeoverButton() {
            const container = document.getElementById('takeoverContainer');
            if (container) {
                container.style.display = 'none';
            }
        }
        
        // 显示最终结算
        function showMatchResult(data) {
            const { ranking, matchScores, totalRounds } = data;
            
            document.getElementById('matchTotalRounds').textContent = totalRounds;
            
            const rankingList = document.getElementById('rankingList');
            rankingList.innerHTML = '';
            
            const positionEmojis = ['🥇', '🥈', '🥉', '4'];
            const positionClasses = ['first', 'second', 'third', ''];
            
            ranking.forEach((player, idx) => {
                const posClass = positionClasses[idx] || '';
                const posEmoji = positionEmojis[idx] || (idx + 1);
                const scoreClass = player.totalScore >= 0 ? 'positive' : 'negative';
                const scoreText = player.totalScore >= 0 ? `+${player.totalScore}` : player.totalScore;
                
                rankingList.innerHTML += `
                    <div class="ranking-item ${posClass}">
                        <span class="ranking-position ${posClass}">${posEmoji}</span>
                        <span class="ranking-name">${player.username}${player.isBot ? ' (AI)' : ''}</span>
                        <span class="ranking-score ${scoreClass}">${scoreText}</span>
                    </div>
                `;
            });
            
            // 关闭单局结算弹窗（如果还开着）
            document.getElementById('roundResultModal').classList.remove('active');
            document.getElementById('matchResultModal').classList.add('active');
        }
        
        // 关闭最终结算
        function closeMatchResult() {
            document.getElementById('matchResultModal').classList.remove('active');
            document.getElementById('gameScreen').classList.remove('active');
            document.getElementById('roomScreen').classList.add('active');
            document.getElementById('chatArea').style.display = 'none';
            document.body.classList.remove('in-game');
            isReady = false;
            document.getElementById('readyBtn').innerHTML = '<i class="fas fa-check"></i> 准备';
            
            // 重置积分
            matchScores = [0, 0, 0, 0];
            updateScorePanel(matchScores);
        }

        // 离开游戏
        function leaveGame() {
            if (confirm('确定要退出游戏吗？')) {
                socket.emit('leave_room');
                document.getElementById('gameScreen').classList.remove('active');
                document.getElementById('lobbyScreen').classList.add('active');
                document.getElementById('chatArea').style.display = 'none';
                document.body.classList.remove('in-game');
                currentRoom = null;
            }
        }

        // 聊天面板状态
        let chatPanelOpen = false;
        let unreadMessages = 0;
        
        // 切换聊天面板
        function toggleChatPanel() {
            chatPanelOpen = !chatPanelOpen;
            const panel = document.getElementById('chatPanel');
            
            if (chatPanelOpen) {
                panel.classList.add('active');
                unreadMessages = 0;
                updateChatBadge();
                document.getElementById('chatInput').focus();
            } else {
                panel.classList.remove('active');
            }
        }
        
        // 更新未读消息徽章
        function updateChatBadge() {
            const badge = document.getElementById('chatBadge');
            if (unreadMessages > 0) {
                badge.textContent = unreadMessages > 99 ? '99+' : unreadMessages;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
        
        // 发送聊天
        function sendChat() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (message) {
                socket.emit('chat_message', { message });
                input.value = '';
            }
        }

        // 添加聊天消息
        function addChatMessage(name, message) {
            const container = document.getElementById('chatMessages');
            const msg = document.createElement('div');
            msg.className = 'chat-message';
            msg.innerHTML = `<span class="name">${name}:</span> ${message}`;
            container.appendChild(msg);
            container.scrollTop = container.scrollHeight;
            
            // 如果聊天面板未打开，增加未读消息数
            if (!chatPanelOpen) {
                unreadMessages++;
                updateChatBadge();
            }
            
            // 同时显示消息 Toast
            showToast(`💬 ${name}: ${message}`, 3000);
            container.scrollTop = container.scrollHeight;
        }

        // Toast提示
        function showToast(message, duration = 2000) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), duration);
        }

        // 回车发送聊天
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChat();
        });

        // ==================== 精灵图预加载 ====================
        
        let spritesLoaded = false;
        
        // 预加载麻将牌精灵图
        function preloadSprites() {
            const img = new Image();
            img.onload = function() {
                spritesLoaded = true;
                document.body.classList.add('sprites-loaded');
                console.log('麻将牌精灵图加载完成');
                
                // 应用样式到所有加载中的牌
                document.querySelectorAll('.tile.loading').forEach(tile => {
                    tile.classList.remove('loading');
                    if (tile.dataset.spriteStyle) {
                        tile.style.cssText = tile.dataset.spriteStyle;
                    }
                });
                
                // 如果游戏已开始，刷新显示
                if (gameState) {
                    scheduleUpdate(() => _doUpdateGameUI());
                }
            };
            img.onerror = function() {
                console.warn('精灵图加载失败，将使用文字模式');
                spritesLoaded = true;
                document.body.classList.add('sprites-loaded');
                // 转换所有牌为文字模式
                document.querySelectorAll('.tile.loading').forEach(tile => {
                    tile.classList.remove('loading');
                    tile.classList.add('text-mode');
                });
            };
            img.src = '/img/majiang.png';
            
            // 同时预加载到 CSS 缓存（高优先级）
            const preloadLink = document.createElement('link');
            preloadLink.rel = 'preload';
            preloadLink.as = 'image';
            preloadLink.href = '/img/majiang.png';
            preloadLink.fetchPriority = 'high';
            document.head.appendChild(preloadLink);
        }
        
        // 页面加载时立即预加载精灵图
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', preloadSprites);
        } else {
            preloadSprites();
        }
        
        // ==================== UI/UX 改进 - 动画效果系统 ====================
        
        // 创建背景粒子效果
        function initParticles() {
            const container = document.getElementById('particlesContainer');
            if (!container) return;
            
            const particleCount = window.innerWidth < 768 ? 15 : 30;
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDuration = (15 + Math.random() * 20) + 's';
                particle.style.animationDelay = Math.random() * 20 + 's';
                particle.style.opacity = 0.1 + Math.random() * 0.3;
                particle.style.width = (3 + Math.random() * 4) + 'px';
                particle.style.height = particle.style.width;
                container.appendChild(particle);
            }
        }
        
        // 显示动作特效（碰/杠/胡）
        function showActionEffect(action, playerName = '') {
            const effectTexts = {
                'peng': '碰！',
                'gang': '杠！',
                'hu': '胡！',
                'zimo': '自摸！',
                'hu_zimo': '自摸！'
            };
            
            const text = effectTexts[action];
            if (!text) return;
            
            const effect = document.createElement('div');
            effect.className = 'action-effect';
            effect.innerHTML = `<div class="action-effect-text ${action}">${text}</div>`;
            document.body.appendChild(effect);
            
            // 播放特效后移除
            setTimeout(() => effect.remove(), 1500);
            
            // 如果是胡牌，显示烟花
            if (action === 'hu' || action === 'zimo' || action === 'hu_zimo') {
                showFireworks();
            }
        }
        
        // 烟花效果
        function showFireworks() {
            const container = document.getElementById('fireworksContainer');
            if (!container) return;
            
            const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
            const fireworkCount = window.innerWidth < 768 ? 5 : 10;
            
            for (let i = 0; i < fireworkCount; i++) {
                setTimeout(() => {
                    createFirework(container, colors);
                }, i * 200);
            }
        }
        
        function createFirework(container, colors) {
            const x = 20 + Math.random() * 60; // 20% ~ 80% 屏幕宽度
            const y = 20 + Math.random() * 40; // 20% ~ 60% 屏幕高度
            const color = colors[Math.floor(Math.random() * colors.length)];
            const particleCount = 12;
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'firework-particle';
                particle.style.left = x + '%';
                particle.style.top = y + '%';
                particle.style.background = color;
                particle.style.boxShadow = `0 0 6px ${color}`;
                
                // 计算粒子飞行方向
                const angle = (i / particleCount) * 2 * Math.PI;
                const distance = 50 + Math.random() * 100;
                const endX = Math.cos(angle) * distance;
                const endY = Math.sin(angle) * distance;
                particle.style.setProperty('--particle-end', `translate(${endX}px, ${endY}px)`);
                
                container.appendChild(particle);
                
                // 动画结束后移除
                setTimeout(() => particle.remove(), 1200);
            }
        }
        
        // 显示/隐藏轮到自己的提示
        function showTurnIndicator(show = true) {
            const indicator = document.getElementById('turnIndicator');
            if (!indicator) return;
            
            if (show) {
                indicator.classList.add('active');
                // 3秒后自动隐藏
                setTimeout(() => {
                    indicator.classList.remove('active');
                }, 3000);
            } else {
                indicator.classList.remove('active');
            }
        }
        
        // 更新手牌区域的轮到自己效果
        function updateMyTurnEffect(isMyTurn) {
            const handArea = document.querySelector('.my-hand-area');
            if (!handArea) return;
            
            if (isMyTurn && gameState?.turnPhase === 'discard') {
                handArea.classList.add('my-turn');
            } else {
                handArea.classList.remove('my-turn');
            }
        }
        
        // 出牌飞行动画
        function playDiscardAnimation(tileElement, callback) {
            if (!tileElement || document.body.classList.contains('reduce-motion')) {
                if (callback) callback();
                return;
            }
            
            tileElement.classList.add('discarding');
            
            setTimeout(() => {
                if (callback) callback();
            }, 400);
        }
        
        // 摸牌动画
        function playDrawAnimation(tileElement) {
            if (!tileElement || document.body.classList.contains('reduce-motion')) return;
            
            tileElement.classList.add('drawing');
            
            setTimeout(() => {
                tileElement.classList.remove('drawing');
            }, 400);
        }
        
        // 牌面点击波纹效果
        function createTileRipple(event, tileElement) {
            if (document.body.classList.contains('reduce-motion')) return;
            
            const rect = tileElement.getBoundingClientRect();
            const ripple = document.createElement('div');
            ripple.className = 'tile-ripple';
            ripple.style.left = (event.clientX - rect.left) + 'px';
            ripple.style.top = (event.clientY - rect.top) + 'px';
            ripple.style.width = '20px';
            ripple.style.height = '20px';
            
            tileElement.style.position = 'relative';
            tileElement.style.overflow = 'hidden';
            tileElement.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        }
        
        // 快捷表情面板
        let emojiPanelOpen = false;
        
        function toggleEmojiPanel() {
            emojiPanelOpen = !emojiPanelOpen;
            const panel = document.getElementById('emojiPanel');
            
            if (emojiPanelOpen) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        }
        
        // 发送表情
        function sendEmoji(emoji) {
            socket.emit('chat_message', { message: emoji, isEmoji: true });
            toggleEmojiPanel();
            
            // 在自己头像位置显示表情气泡
            showEmojiBubble(emoji, mySeatIndex);
        }
        
        // 发送快捷语句
        function sendPhrase(phrase) {
            socket.emit('chat_message', { message: phrase });
            toggleEmojiPanel();
        }
        
        // 显示表情气泡
        function showEmojiBubble(emoji, seatIndex) {
            // 获取对应座位的位置
            const displaySeat = typeof seatIndex === 'number' ? getDisplaySeat(seatIndex) : seatIndex;
            const seatEl = document.querySelector(`.seat-${displaySeat} .seat-avatar`) ||
                          document.querySelector(`#seat-${displaySeat} .seat-avatar`);
            
            if (!seatEl) return;
            
            const rect = seatEl.getBoundingClientRect();
            const bubble = document.createElement('div');
            bubble.className = 'emoji-bubble';
            bubble.textContent = emoji;
            bubble.style.left = rect.left + rect.width / 2 + 'px';
            bubble.style.top = rect.top + 'px';
            
            document.body.appendChild(bubble);
            
            setTimeout(() => bubble.remove(), 2000);
        }
        
        // 覆盖原有的 showToast 函数，添加动画效果
        const originalShowToast = showToast;
        showToast = function(message, duration = 2000) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            toast.style.animation = 'none';
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 10px)';
            
            document.body.appendChild(toast);
            
            // 强制重绘后添加动画
            requestAnimationFrame(() => {
                toast.style.transition = 'all 0.3s ease-out';
                toast.style.opacity = '1';
                toast.style.transform = 'translate(-50%, 0)';
            });
            
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, -10px)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        };
        
        // 增强游戏状态更新，添加动画效果
        const originalUpdateGameUI = scheduleUpdate;
        
        // 注：action_executed 和 emoji_received 事件监听已在 connectServer() 中注册
        
        // 页面加载时初始化粒子效果
        document.addEventListener('DOMContentLoaded', () => {
            initParticles();
            
            // 为手牌添加点击波纹效果
            document.addEventListener('click', (e) => {
                const tile = e.target.closest('.tile');
                if (tile && !tile.classList.contains('back')) {
                    createTileRipple(e, tile);
                }
            });
        });
        
        // 覆盖更新游戏UI，添加轮到自己的效果
        const _originalDoUpdateGameUI = typeof _doUpdateGameUI !== 'undefined' ? _doUpdateGameUI : null;
        if (_originalDoUpdateGameUI) {
            const wrappedUpdateGameUI = _originalDoUpdateGameUI;
            _doUpdateGameUI = function() {
                wrappedUpdateGameUI.apply(this, arguments);
                
                // 检查是否轮到自己
                if (gameState) {
                    const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
                    const isDiscardPhase = gameState.turnPhase === 'discard';
                    updateMyTurnEffect(isMyTurn && isDiscardPhase);
                }
            };
        }
        
        // 初始化
        connectServer();