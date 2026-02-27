
        // ==================== 鎬ц兘浼樺寲宸ュ叿 ====================
        
        // 鑺傛祦鍑芥暟 - 闄愬埗鍑芥暟璋冪敤棰戠巼
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
        
        // 闃叉姈鍑芥暟 - 寤惰繜鎵ц鐩村埌鍋滄璋冪敤
        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }
        
        // requestAnimationFrame 灏佽
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
        
        // 缃戠粶鐘舵€佹娴?
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
            
            // 寮辩綉鏃跺噺灏戝姩鐢?
            document.body.classList.toggle('reduce-motion', networkQuality === 'slow');
        }
        
        // 浣庢€ц兘璁惧妫€娴?
        const isLowEndDevice = (function() {
            // 妫€娴嬭澶囧唴瀛?(濡傛灉鍙敤)
            const memory = navigator.deviceMemory;
            if (memory && memory < 4) return true;
            
            // 妫€娴嬫槸鍚︽槸绉诲姩璁惧
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // 妫€娴嬬‖浠跺苟鍙戞暟
            const cores = navigator.hardwareConcurrency;
            if (cores && cores < 4) return true;
            
            return isMobile;
        })();
        
        // 浣庣璁惧鑷姩鍚敤鐪佺數妯″紡
        let performanceMode = isLowEndDevice ? 'low' : 'high';
        
        // DOM 鍏冪礌缂撳瓨
        const domCache = {};
        function $(id) {
            if (!domCache[id]) {
                domCache[id] = document.getElementById(id);
            }
            return domCache[id];
        }
        
        // 涓婁竴娆℃父鎴忕姸鎬侊紙鐢ㄤ簬澧為噺鏇存柊锛?
        let prevGameState = null;
        
        // 娓告垙鐘舵€?
        let socket = null;
        let currentRoom = null;
        let myPlayerId = null;
        let mySeatIndex = -1;
        let selectedTileId = null;
        let gameState = null;
        let isReady = false;
        let username = '';
        let lastDrawnTileId = null; // 璁板綍鍒氭懜鐨勭墝
        let pendingAutoDiscard = false; // 鏄惁绛夊緟鑷姩鍑虹墝
        let pendingAutoDiscardTileId = null; // 绛夊緟鑷姩鍑虹墝鐨勭墝ID
        let isAITakeover = false; // 鏄惁琚獳I鎺ョ
        let myVoice = 'female01'; // 鎴戠殑璇煶绫诲瀷
        let playerVoices = {}; // 瀛樺偍鎵€鏈夌帺瀹剁殑璇煶绫诲瀷

        // 鐗岄潰鏄剧ず
        const TYPE_NAMES = { wan: '涓?, tiao: '鏉?, tong: '绛? };
        const NUM_NAMES = ['', '涓€', '浜?, '涓?, '鍥?, '浜?, '鍏?, '涓?, '鍏?, '涔?];
        const WIND_NAMES = { east: '涓?, south: '鍗?, west: '瑗?, north: '鍖? };
        
        // 绮剧伒鍥句綅缃槧灏?(8鍒椕?琛岀綉鏍?
        const TILE_SPRITE_MAP = {
            // 绗?琛? 涓囧瓙 1-8
            'wan1': [0, 0], 'wan2': [0, 1], 'wan3': [0, 2], 'wan4': [0, 3],
            'wan5': [0, 4], 'wan6': [0, 5], 'wan7': [0, 6], 'wan8': [0, 7],
            
            // 绗?琛? 绛掑瓙 1-8
            'tong1': [1, 0], 'tong2': [1, 1], 'tong3': [1, 2], 'tong4': [1, 3],
            'tong5': [1, 4], 'tong6': [1, 5], 'tong7': [1, 6], 'tong8': [1, 7],
            
            // 绗?琛? 鏉″瓙 1-8
            'tiao1': [2, 0], 'tiao2': [2, 1], 'tiao3': [2, 2], 'tiao4': [2, 3],
            'tiao5': [2, 4], 'tiao6': [2, 5], 'tiao7': [2, 6], 'tiao8': [2, 7],
            
            // 绗?琛? 瀛楃墝 涓滃崡瑗垮寳涓彂鐧?
            'dong': [3, 0], 'nan': [3, 1], 'xi': [3, 2], 'bei': [3, 3],
            'zhong': [3, 4], 'fa': [3, 5], 'bai': [3, 6],
            
            // 绗?琛? 鑺辩墝
            'qiu': [4, 0], 'lan': [4, 1], 'zhu': [4, 2], 'mei': [4, 3],
            'chun': [4, 4], 'xia': [4, 5], 'dong_hua': [4, 6], 'ju': [4, 7],
            
            // 绗?琛? 9涓?9绛?9鏉?
            'wan9': [5, 0], 'tong9': [5, 1], 'tiao9': [5, 2]
        };
        
        // 鑾峰彇绮剧伒鍥捐儗鏅綅缃?
        function getSpritePosition(tile) {
            let key;
            if (tile.type === 'honor') {
                key = tile.value; // 涓彂鐧界洿鎺ヤ娇鐢╲alue浣滀负key
            } else {
                key = `${tile.type}${tile.value}`;
            }
            const pos = TILE_SPRITE_MAP[key];
            
            if (!pos) return '';
            
            const cols = 8;
            const rows = 6;
            
            // 浣跨敤鐧惧垎姣斿畾浣?
            const posX = pos[1] === 0 ? 0 : (pos[1] / (cols - 1)) * 100;
            const posY = pos[0] === 0 ? 0 : (pos[0] / (rows - 1)) * 100;
            
            return `background-size: ${cols * 100}% ${rows * 100}%; background-position: ${posX}% ${posY}%;`;
        }
        
        // ==================== 鍚墝妫€娴?====================
        let isTing = false;
        let tingList = [];
        
        // 妫€娴嬫槸鍚﹁兘鑳＄墝锛?N+2缁撴瀯 + 鐗规畩鐗屽瀷锛?
        function canHuHand(tiles, melds = []) {
            if (tiles.length === 0) return true;
            
            // 妫€鏌ヤ竷瀵瑰瓙
            if (tiles.length === 14 && isQiDui(tiles)) {
                return true;
            }
            
            // 鍩烘湰鑳＄墝妫€娴嬶細3N+2缁撴瀯
            if (tiles.length === 2) {
                return tiles[0].type === tiles[1].type && tiles[0].value === tiles[1].value;
            }
            if (tiles.length < 3) return false;
            
            // 鎺掑簭
            const sorted = [...tiles].sort((a, b) => {
                if (a.type !== b.type) return a.type.localeCompare(b.type);
                return a.value - b.value;
            });
            
            // 灏濊瘯浣滀负灏嗭紙瀵瑰瓙锛?
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
            
            // 灏濊瘯鍒诲瓙
            if (sorted.length >= 3 &&
                sorted[0].type === sorted[1].type && sorted[1].type === sorted[2].type &&
                sorted[0].value === sorted[1].value && sorted[1].value === sorted[2].value) {
                return canFormMelds(sorted.slice(3));
            }
            
            // 灏濊瘯椤哄瓙
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

        // ==================== 鐗规畩鐗屽瀷妫€娴?====================
        function isQiDui(hand) {
            const counts = {};
            hand.forEach(tile => {
                const key = `${tile.type}${tile.value}`;
                counts[key] = (counts[key] || 0) + 1;
            });
            
            const values = Object.values(counts);
            return values.length === 7 && values.every(v => v === 2);
        }

        function isPengPengHu(hand) {
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

        function isQingYiSe(hand) {
            const suits = new Set();
            let hasHonor = false;
            
            hand.forEach(tile => {
                if (['wan', 'tiao', 'tong'].includes(tile.type)) {
                    suits.add(tile.type);
                } else if (['feng', 'zhong', 'fa', 'bai', 'honor'].includes(tile.type)) {
                    hasHonor = true;
                }
            });
            
            return suits.size === 1 && !hasHonor;
        }

        function isHunYiSe(hand) {
            const suits = new Set();
            let hasHonor = false;
            
            hand.forEach(tile => {
                if (['wan', 'tiao', 'tong'].includes(tile.type)) {
                    suits.add(tile.type);
                } else if (['feng', 'zhong', 'fa', 'bai', 'honor'].includes(tile.type)) {
                    hasHonor = true;
                }
            });
            
            return suits.size === 1 && hasHonor;
        }

        // ==================== 鐣暟璁＄畻 ====================
        function calculateFan(hand, isSelfDraw = true, melds = []) {
            let totalFan = 0;
            let fanList = [];
            const isMenQing = melds.length === 0;
            
            // 闂ㄦ竻 +1鐣?
            if (isMenQing) {
                totalFan += 1;
                fanList.push('闂ㄦ竻');
            }
            
            // 鑷懜 +1鐣?
            if (isSelfDraw) {
                totalFan += 1;
                fanList.push('鑷懜');
            }
            
            // 涓冨瀛?+2鐣?
            if (isQiDui(hand)) {
                totalFan += 2;
                fanList.push('涓冨瀛?);
            }
            
            // 纰扮鑳?+2鐣?
            if (isPengPengHu(hand)) {
                totalFan += 2;
                fanList.push('纰扮鑳?);
            }
            
            // 娓呬竴鑹?+3鐣?
            if (isQingYiSe(hand)) {
                totalFan += 3;
                fanList.push('娓呬竴鑹?);
                
                // 娓呯锛堟竻涓€鑹?纰扮鑳★級棰濆+1鐣?
                if (isPengPengHu(hand)) {
                    totalFan += 1;
                    fanList.push('娓呯');
                }
            }
            // 娣蜂竴鑹?+2鐣?
            else if (isHunYiSe(hand)) {
                totalFan += 2;
                fanList.push('娣蜂竴鑹?);
            }
            
            // 鑷冲皯1鐣?
            if (totalFan === 0) totalFan = 1;
            
            return { fan: totalFan, fanList: fanList };
        }
        
        // 妫€娴嬪惉鍝簺鐗?
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
        
        // 妫€鏌ュ苟鏄剧ず鍚墝鐘舵€?
        function checkAndShowTing() {
            if (!gameState) return;
            
            const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
            if (!myPlayer || !myPlayer.hand) return;
            
            // 鍙湁13寮犵墝鏃舵娴嬪惉鐗岋紙鎴?0寮犳湁1纰帮紝7寮犳湁2纰?..锛?
            const expectedSize = 13 - (myPlayer.melds?.length || 0) * 3;
            if (myPlayer.hand.length !== expectedSize) return;
            
            const newTingList = checkTingPai(myPlayer.hand);
            
            if (newTingList.length > 0 && !isTing) {
                isTing = true;
                tingList = newTingList;
                
                // 璇煶鎾姤
                speakTing();
                
                // 鏄剧ず鍚墝淇℃伅
                const tingNames = newTingList.map(t => `${NUM_NAMES[t.value]}${TYPE_NAMES[t.type]}`).join('銆?);
                showToast(`馃幆 鍚墝锛佸惉锛?{tingNames}`, 3000);
            }
        }
        
        // ==================== 闊抽鎾斁绯荤粺 ====================
        const audioCache = {}; // 缂撳瓨宸插姞杞界殑闊抽
        let audioUnlocked = false; // 绉诲姩璁惧闊抽鏄惁宸茶В閿?
        
        // 闊抽鏍煎紡閰嶇疆锛堢粺涓€浣跨敤mp3锛?
        const AUDIO_FORMATS = {
            female01: '.mp3',
            female02: '.mp3',
            male: '.mp3',
            male02: '.mp3'
        };
        
        // 鑾峰彇鐗岀殑闊抽鏂囦欢鍚?
        function getTileAudioName(tile) {
            // 澶氫汉妯″紡鐗岀粨鏋? 
            // 鏁板瓧鐗? { type: 'wan'|'tiao'|'tong', value: 1-9 }
            // 鑺辩墝: { type: 'flower', value: 'chun'|'xia'|... }
            // 涓彂鐧? { type: 'honor', value: 'zhong'|'fa'|'bai' }
            if (tile.type === 'flower') {
                return tile.value; // 鑺辩墝鐩存帴杩斿洖 value (chun, xia, etc.)
            } else if (tile.type === 'honor') {
                return tile.value; // 涓彂鐧界洿鎺ヨ繑鍥?value (zhong, fa, bai)
            }
            return `${tile.type}${tile.value}`; // 鏁板瓧鐗? wan1, tong2, etc.
        }
        
        // 鏍规嵁鐜╁ID鑾峰彇璇煶
        function getPlayerVoice(playerId) {
            return playerVoices[playerId] || 'female01';
        }
        
        // 鏍规嵁搴т綅绱㈠紩鑾峰彇鐜╁璇煶
        function getPlayerVoiceBySeat(seatIndex) {
            if (!gameState || !gameState.players) return 'female01';
            const player = gameState.players.find(p => p.seatIndex === seatIndex);
            if (player && player.voice) {
                return player.voice;
            }
            return playerVoices[player?.id] || 'female01';
        }
        
        // 瑙ｉ攣绉诲姩璁惧闊抽
        function unlockAudio() {
            if (audioUnlocked) return;
            try {
                const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD/kaYhAAAAAAD/4xjAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/jGMAD/0AAAANIAAAAATVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
                silentAudio.play().then(() => {
                    audioUnlocked = true;
                    console.log('绉诲姩璁惧闊抽宸茶В閿?);
                }).catch(e => {});
            } catch (e) {}
        }
        
        // 鐩戝惉鐢ㄦ埛浜や簰浠ヨВ閿侀煶棰?
        ['click', 'touchstart'].forEach(event => {
            document.addEventListener(event, unlockAudio, { once: false, passive: true });
        });
        
        // 闊抽鍔犺浇鐘舵€?
        const audioLoading = {};
        
        // 鎾斁闊抽鏂囦欢锛堢洿鎺ユ挱鏀撅紝鍚屾椂缂撳瓨锛?
        function playAudioFile(path, volume = 1.0) {
            console.log('鎾斁闊抽:', path);
            
            try {
                // 妫€鏌ョ紦瀛?- 濡傛灉宸茬紦瀛樼洿鎺ユ挱鏀?
                if (audioCache[path] && audioCache[path].readyState >= 2) {
                    const audio = audioCache[path].cloneNode();
                    audio.volume = volume;
                    audio.play().then(() => {
                        console.log('缂撳瓨闊抽鎾斁鎴愬姛');
                    }).catch(e => {
                        console.error('缂撳瓨闊抽鎾斁澶辫触:', e);
                    });
                    return;
                }
                
                // 鏈紦瀛?- 鐩存帴鍒涘缓骞舵挱鏀撅紙鍚屾椂缂撳瓨锛?
                const audio = new Audio();
                audio.volume = volume;
                audio.preload = 'auto';
                audio.src = path;
                
                // 灏濊瘯鐩存帴鎾斁
                audio.play().then(() => {
                    // 鎾斁鎴愬姛锛岀紦瀛樿捣鏉?
                    audioCache[path] = audio;
                    console.log('鏂伴煶棰戞挱鏀炬垚鍔熷苟缂撳瓨');
                }).catch(e => {
                    // 鎾斁澶辫触锛屾挱鏀捐渹楦ｉ煶浣滀负鍙嶉
                    console.error('闊抽鎾斁澶辫触:', e.message);
                    const isTile = path.includes('/tiles/');
                    playBeep(isTile ? 600 : 400, 80);
                });
                
                // 鍚屾椂缂撳瓨锛堝嵆浣挎挱鏀惧け璐ヤ篃缂撳瓨锛屼笅娆＄敤锛?
                audio.addEventListener('canplaythrough', () => {
                    audioCache[path] = audio;
                }, { once: true });
            } catch (e) {
                console.error('闊抽寮傚父:', e);
                playBeep(523, 80);
            }
        }
        
        // 闊抽噺閰嶇疆锛堟牴鎹笉鍚岃闊宠皟鏁撮煶閲忓钩琛★級
        const AUDIO_VOLUMES = {
            female01: 0.6,  // 濂冲０1
            female02: 0.8,  // 濂冲０2
            male: 1.0,      // 鐢峰０1
            male02: 1.0     // 鐢峰０2
        };
        
        // 鎾斁鐗岀殑闊抽锛堟敮鎸佸绉嶈闊筹級
        function playTileAudio(tile, voice = 'female01') {
            const name = getTileAudioName(tile);
            const format = AUDIO_FORMATS[voice] || '.mp3';
            const volume = AUDIO_VOLUMES[voice] || 1.0;
            playAudioFile(`audio/${voice}/tiles/${name}${format}`, volume);
        }
        
        // 鎾斁鍔ㄤ綔闊抽锛堟敮鎸佸绉嶈闊筹級
        function playActionAudio(action, voice = 'female01') {
            const format = AUDIO_FORMATS[voice] || '.mp3';
            const volume = AUDIO_VOLUMES[voice] || 1.0;
            playAudioFile(`audio/${voice}/actions/${action}${format}`, volume);
        }
        
        // 闊抽鎳掑姞杞介槦鍒?
        let audioLoadQueue = [];
        let audioEnabled = true; // 寮辩綉鏃跺彲绂佺敤
        
        // 鏅鸿兘棰勫姞杞介煶棰?- 鍙鍔犺浇蹇呰鐨勶紝閬垮厤鍗￠】
        function preloadMultiplayerAudio() {
            // 璺宠繃棰勫姞杞斤紝浣跨敤绾噿鍔犺浇绛栫暐锛岄伩鍏嶅崱椤?
            console.log('闊抽浣跨敤鎳掑姞杞芥ā寮忥紝閬垮厤鍚姩鍗￠】');
        }
        
        // 娓告垙寮€濮嬫椂棰勫姞杞藉綋鍓嶈闊崇殑鍔ㄤ綔闊抽
        // 闈欓粯棰勫姞杞藉父鐢ㄩ煶棰戯紙娓告垙寮€濮嬪悗鍦ㄥ悗鍙版墽琛岋級
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
                        setTimeout(loadNext, 200);  // 闂撮殧鍔犺浇锛屼笉鎶㈠甫瀹?
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
            console.log('寮€濮嬪悗鍙伴鍔犺浇甯哥敤闊抽');
        }
        
        // 棰勫姞杞藉崟涓煶棰戯紙淇濈暀鎺ュ彛锛?
        function preloadSingleAudio(path) {
            // 浣跨敤闈欓粯棰勫姞杞?
        }
        
        // 鍒嗘壒鍔犺浇闊抽锛堜繚鐣欐帴鍙ｏ級
        function loadAudioBatch(paths, batchSize = 5, delay = 100) {
            // 浣跨敤闈欓粯棰勫姞杞?
        }
        
        // 鎾斁闊抽锛堝甫寮辩綉妫€娴嬶級
        const originalPlayAudioFile = playAudioFile;
        playAudioFile = function(path, volume = 1.0) {
            // 寮辩綉鏃惰烦杩囬煶棰戞挱鏀?
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
                
                // 鎳掑姞杞藉苟鎾斁
                const audio = new Audio(path);
                audio.volume = volume;
                audio.play().then(() => {
                    audioCache[path] = audio;
                }).catch(e => {});
            } catch (e) {}
        };
        
        document.addEventListener('DOMContentLoaded', () => {
            // 鍒濆鍖栬闊?
            initVoice();
            // 寤惰繜鍚姩闊抽棰勫姞杞?
            setTimeout(preloadMultiplayerAudio, 2000);
        });
        
        // ==================== 璇煶鎾姤绯荤粺锛堝鐢級 ====================
        let speechEnabled = true;
        let audioContext = null;
        let speechReady = false;
        let voicesLoaded = false;
        
        // 鍒濆鍖栬闊崇郴缁燂紙闇€瑕佺敤鎴蜂氦浜掞級
        function initSpeech() {
            if (speechReady) return;
            
            try {
                // 鍒濆鍖?AudioContext
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
                
                // 灏濊瘯鍔犺浇璇煶
                if (window.speechSynthesis) {
                    // 鏌愪簺娴忚鍣ㄩ渶瑕佸厛鑾峰彇璇煶鍒楄〃
                    const voices = speechSynthesis.getVoices();
                    if (voices.length > 0) {
                        voicesLoaded = true;
                        console.log('璇煶鍒楄〃宸插姞杞?', voices.length, '涓?);
                    }
                    
                    // 鐩戝惉璇煶鍒楄〃鍔犺浇
                    speechSynthesis.onvoiceschanged = () => {
                        voicesLoaded = true;
                        console.log('璇煶鍒楄〃宸叉洿鏂?);
                    };
                    
                    // 鎾斁涓€涓┖鐨勬祴璇?
                    const testUtterance = new SpeechSynthesisUtterance('');
                    testUtterance.volume = 0;
                    speechSynthesis.speak(testUtterance);
                }
                
                speechReady = true;
                console.log('璇煶绯荤粺鍒濆鍖栨垚鍔?);
            } catch (e) {
                console.error('璇煶绯荤粺鍒濆鍖栧け璐?', e);
            }
        }
        
        // 鍦ㄧ敤鎴烽娆′氦浜掓椂鍒濆鍖?
        document.addEventListener('click', function initOnClick() {
            initSpeech();
            document.removeEventListener('click', initOnClick);
        }, { once: true });
        
        document.addEventListener('touchstart', function initOnTouch() {
            initSpeech();
            document.removeEventListener('touchstart', initOnTouch);
        }, { once: true });
        
        // 鑾峰彇鐗岀殑璇煶鍚嶇О
        function getTileSpeechName(tile) {
            const numNames = ['', '涓€', '浜?, '涓?, '鍥?, '浜?, '鍏?, '涓?, '鍏?, '涔?];
            return numNames[tile.value] + TYPE_NAMES[tile.type];
        }
        
        // 妫€娴嬫槸鍚︽槸鍗庝负璁惧
        const isHuawei = /huawei|honor/i.test(navigator.userAgent);
        let speechRetryCount = 0;
        const MAX_SPEECH_RETRY = 3;
        
        // 璇煶鎾姤锛堝寮哄崕涓哄吋瀹规€э級
        function speak(text, rate = 1.0, pitch = 1.0) {
            if (!speechEnabled) return;
            
            // 灏濊瘯浣跨敤 Web Speech API
            if (window.speechSynthesis) {
                try {
                    // 鍗庝负璁惧鐗规畩澶勭悊锛氬厛鍙栨秷鍐嶅欢杩熻璇?
                    window.speechSynthesis.cancel();
                    
                    // 鍗庝负璁惧闇€瑕佸欢杩熸墽琛?
                    const delay = isHuawei ? 100 : 0;
                    
                    setTimeout(() => {
                        const utterance = new SpeechSynthesisUtterance(text);
                        utterance.lang = 'zh-CN';
                        utterance.rate = isHuawei ? Math.min(rate, 0.9) : rate; // 鍗庝负闄嶄綆璇€?
                        utterance.pitch = pitch;
                        utterance.volume = 1.0;
                        
                        // 灏濊瘯閫夋嫨涓枃璇煶
                        const voices = speechSynthesis.getVoices();
                        const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
                        if (zhVoice) {
                            utterance.voice = zhVoice;
                        }
                        
                        // 鍗庝负璁惧锛氱洃鍚敊璇苟閲嶈瘯
                        utterance.onerror = (e) => {
                            console.warn('璇煶鎾姤鍑洪敊:', e.error);
                            if (isHuawei && speechRetryCount < MAX_SPEECH_RETRY) {
                                speechRetryCount++;
                                console.log(`鍗庝负璁惧閲嶈瘯璇煶 (${speechRetryCount}/${MAX_SPEECH_RETRY})`);
                                setTimeout(() => speak(text, rate, pitch), 200);
                            } else {
                                // 浣跨敤闊虫晥澶囩敤
                                playBeep(660, 150);
                                vibrate(50);
                            }
                        };
                        
                        utterance.onend = () => {
                            speechRetryCount = 0; // 鎴愬姛鍚庨噸缃鏁?
                        };
                        
                        window.speechSynthesis.speak(utterance);
                        
                        // 鍗庝负璁惧棰濆妫€鏌ワ細濡傛灉3绉掑悗杩樻病璇村畬鍙兘鍗′綇浜?
                        if (isHuawei) {
                            setTimeout(() => {
                                if (window.speechSynthesis.speaking) {
                                    // 鍙兘鍗′綇浜嗭紝寮哄埗鍙栨秷
                                    window.speechSynthesis.cancel();
                                }
                            }, 3000);
                        }
                    }, delay);
                    
                } catch (e) {
                    console.error('璇煶鎾姤澶辫触:', e);
                    // 澶囩敤锛氶煶鏁?+ 鎸姩鎻愮ず
                    playBeep(660, 150);
                    vibrate(50);
                }
            } else {
                // 涓嶆敮鎸佽闊冲悎鎴愶紝浣跨敤闊虫晥 + 鎸姩
                playBeep(660, 150);
                vibrate(50);
            }
        }
        
        // 鎸姩澶囩敤鏂规
        function vibrate(duration = 50) {
            if (navigator.vibrate) {
                navigator.vibrate(duration);
            }
        }
        
        // 鎾斁绠€鍗曢煶鏁堬紙鍏煎鎬ф洿濂斤級
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
                console.log('闊虫晥鎾斁澶辫触:', e);
            }
        }
        
        // 鎾姤鍑虹墝锛堜娇鐢ㄩ煶棰戞枃浠讹紝鏀寔澶氱璇煶锛?
        function speakDiscard(tile, voice = 'female01') {
            // 浣跨敤闊抽鎾斁
            playTileAudio(tile, voice);
        }
        
        // 鎾姤鍚墝
        function speakTing() {
            speak('鍚?, 1.0, 1.3);
            playBeep(880, 150);
        }
        
        // 鎾姤纰帮紙浣跨敤闊抽锛屾敮鎸佸绉嶈闊筹級
        function speakPeng(voice = 'female01') {
            playActionAudio('peng', voice);
        }
        
        // 鎾姤鏉狅紙浣跨敤闊抽锛屾敮鎸佸绉嶈闊筹級
        function speakGang(voice = 'female01') {
            playActionAudio('gang', voice);
        }
        
        // 鎾姤鑳＄墝锛堜娇鐢ㄩ煶棰戯紝鏀寔澶氱璇煶锛?
        function speakHu(isZimo = false, voice = 'female01') {
            playActionAudio(isZimo ? 'zimo' : 'hu', voice);
            // 鎾斁鑳滃埄闊虫晥
            playBeep(523, 100);
            setTimeout(() => playBeep(659, 100), 100);
            setTimeout(() => playBeep(784, 150), 200);
        }
        
        // 鎾斁鐖嗙偢闊虫晥锛堟斁鐐椂锛?
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
                console.log('闊虫晥鎾斁澶辫触:', e);
                vibrate(200);
            }
        }
        
        // 鎾姤鏀剧偖
        function speakFangPao() {
            playExplosionSound();
            setTimeout(() => speak('鏀剧偖', 0.8, 0.6), 300);
        }

        // 杩炴帴鏈嶅姟鍣?
        let isConnected = false;
        let connectionAttempts = 0;
        
        function connectServer() {
            // 妫€娴嬫槸鍚﹀湪 GitHub Pages 绛夐潤鎬佹墭绠′笂
            const isStaticHost = window.location.hostname.includes('github.io') || 
                                 window.location.hostname.includes('gitee.io') ||
                                 window.location.hostname.includes('netlify.app') ||
                                 window.location.hostname.includes('vercel.app');
            
            if (isStaticHost) {
                // 闈欐€佹墭绠℃棤娉曡繍琛?WebSocket 鏈嶅姟鍣紝鏄剧ず鎻愮ず
                showServerRequiredModal();
                return;
            }
            
            // 鑷姩妫€娴嬫湇鍔″櫒鍦板潃
            const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? `http://${window.location.hostname}:3000`
                : window.location.origin;
            
            socket = io(serverUrl, {
                timeout: 10000,            // 澧炲姞瓒呮椂鏃堕棿
                reconnectionAttempts: 5,   // 澧炲姞閲嶈繛娆℃暟
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                transports: ['websocket', 'polling'],  // 浼樺厛 WebSocket
                upgrade: true
            });

            socket.on('connect', () => {
                console.log('宸茶繛鎺ユ湇鍔″櫒');
                myPlayerId = socket.id;
                isConnected = true;
                connectionAttempts = 0;
                
                // 鍚姩缃戠粶璐ㄩ噺妫€娴?
                startPingMonitor();
                updateNetworkIndicator('good');
            });

            socket.on('disconnect', () => {
                console.log('涓庢湇鍔″櫒鏂紑杩炴帴');
                isConnected = false;
                showToast('杩炴帴宸叉柇寮€');
            });
            
            socket.on('connect_error', () => {
                connectionAttempts++;
                if (connectionAttempts >= 3) {
                    showServerRequiredModal();
                }
            });

            // 鎴块棿浜嬩欢
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
            
            // 鐜╁绂荤嚎鎻愮ず
            socket.on('player_offline', (data) => {
                showToast(`鈿狅笍 ${data.username} 鏂嚎浜嗭紝绛夊緟閲嶈繛...`, 5000);
            });
            
            // 鐜╁閲嶈繛
            socket.on('player_reconnected', (data) => {
                showToast(`鉁?${data.username} 宸查噸杩烇紒`);
            });

            // 娓告垙浜嬩欢
            socket.on('game_started', (data) => {
                mySeatIndex = data.yourSeat;
                gameState = data.gameState;
                
                // 閲嶇疆鍚墝鐘舵€?
                isTing = false;
                tingList = [];
                lastDrawnTileId = null;
                selectedTileId = null;
                
                // 鍏抽棴缁撶畻寮圭獥
                document.getElementById('roundResultModal').classList.remove('active');
                
                // 妫€鏌ユ槸鍚﹁AI鎺ョ
                const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
                if (myPlayer && myPlayer.aiTakeover) {
                    isAITakeover = true;
                    showTakeoverButton();
                    showToast('鈿狅笍 AI姝ｅ湪浠ｆ浛浣犺繘琛屾父鎴忥紝鐐瑰嚮"鎺ョAI"鎭㈠鎺у埗', 5000);
                } else {
                    isAITakeover = false;
                    hideTakeoverButton();
                }
                
                // 鏇存柊灞€鏁板拰绉垎鏄剧ず
                if (data.currentRound !== undefined) {
                    updateRoundDisplay(data.currentRound, data.totalRounds);
                }
                if (data.matchScores) {
                    updateScorePanel(data.matchScores);
                }
                
                showGameScreen();
                updateGameUI();
                
                // 鍚庡彴棰勫姞杞藉父鐢ㄩ煶棰戯紙寤惰繜鎵ц锛屼笉闃诲UI锛?
                setTimeout(() => {
                    silentPreloadAudio(myVoice);
                }, 1000);
                
                // 銆愬寮恒€戝鐞嗛噸杩?
                if (data.isReconnect) {
                    showToast('馃攧 宸查噸鏂拌繛鎺ワ紒缁х画娓告垙...', 3000);
                    console.log('鏂嚎閲嶈繛鎴愬姛锛屽骇浣?', mySeatIndex, '褰撳墠杞埌:', gameState.currentPlayerIndex);
                    
                    // 濡傛灉杞埌鑷繁锛岃Е鍙戣嚜鍔ㄦ懜鐗屾垨鏄剧ず鍑虹墝鎻愮ず
                    if (gameState.currentPlayerIndex === mySeatIndex) {
                        if (gameState.turnPhase === 'draw') {
                            setTimeout(() => autoDrawTile(), 500);
                        }
                    }
                } else {
                    showToast(`绗?${data.currentRound || 1}/${data.totalRounds || 10} 灞€寮€濮嬶紒`);
                }
            });
            
            // 銆愭柊澧炪€戣疆鍒颁綘鐨勫洖鍚堬紙閲嶈繛鍚庨€氱煡锛?
            socket.on('your_turn', (data) => {
                console.log('杞埌浣犱簡:', data);
                showToast(`馃幆 ${data.message}`, 3000);
                
                if (data.phase === 'draw') {
                    // 鑷姩鎽哥墝
                    setTimeout(() => autoDrawTile(), 300);
                }
            });

            socket.on('game_state_update', (data) => {
                const prevPhase = gameState?.turnPhase;
                const prevPlayer = gameState?.currentPlayerIndex;
                
                gameState = data.gameState;
                updateGameUI();
                
                console.log('娓告垙鐘舵€佹洿鏂?', '鐜╁:', gameState.currentPlayerIndex, '闃舵:', gameState.turnPhase, '鎴戠殑搴т綅:', mySeatIndex);
                
                // 鑷姩鎽哥墝锛氳疆鍒扮帺瀹朵笖鏄懜鐗岄樁娈垫椂鑷姩鎽哥墝
                // 鍙湪鐘舵€佸彉鍖栨椂瑙﹀彂锛岄槻姝㈤噸澶?
                const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
                const phaseChanged = prevPhase !== gameState.turnPhase || prevPlayer !== gameState.currentPlayerIndex;
                
                // 銆怳I鏀硅繘銆戣疆鍒拌嚜宸辨椂鏄剧ず鎻愮ず鍜屽彂鍏夋晥鏋?
                if (isMyTurn && gameState.turnPhase === 'discard' && phaseChanged) {
                    showTurnIndicator(true);
                    updateMyTurnEffect(true);
                } else if (!isMyTurn || gameState.turnPhase !== 'discard') {
                    updateMyTurnEffect(false);
                }
                
                // 銆愭柊澧炪€戝鏋滀笉鏄垜鐨勫嚭鐗屽洖鍚堬紝鍋滄鍊掕鏃?
                if (!isMyTurn || gameState.turnPhase !== 'discard') {
                    stopDiscardCountdown();
                } else if (isMyTurn && gameState.turnPhase === 'discard' && !discardCountdownTimer) {
                    // 杞埌鑷繁鍑虹墝浣嗘病鏈夊€掕鏃跺湪杩愯锛屽彲鑳芥槸閲嶈繛鍚?
                    console.log('妫€娴嬪埌鍑虹墝闃舵鏃犲€掕鏃讹紝鍚姩鍊掕鏃?);
                    startDiscardCountdown(15);
                }
                
                if (isMyTurn && gameState.turnPhase === 'draw' && phaseChanged) {
                    console.log('瑙﹀彂鑷姩鎽哥墝...');
                    setTimeout(() => {
                        autoDrawTile();
                    }, 500);
                }
            });

            socket.on('tile_drawn', (data) => {
                lastDrawnTileId = data.tile.id; // 璁板綍鍒氭懜鐨勭墝
                showToast(`鎽稿埌: ${getTileName(data.tile)}`);
                
                // 閲嶆柊娓叉煋鎵嬬墝浠ユ樉绀烘柊鐗岄珮浜?
                if (gameState) {
                    const myPlayer = gameState.players.find(p => p.seatIndex === mySeatIndex);
                    if (myPlayer && myPlayer.hand) {
                        renderMyHand(myPlayer.hand);
                    }
                }
                
                // 鍚墝鍚庤嚜鍔ㄥ嚭鐗岋細寤惰繜鎵ц锛屽厛绛夊緟鏈嶅姟鍣ㄦ鏌ユ槸鍚﹁兘鑳＄墝
                if (isTing && lastDrawnTileId) {
                    console.log('宸插惉鐗岋紝绛夊緟鏈嶅姟鍣ㄦ鏌ヨ儭鐗?..');
                    // 鏍囪绛夊緟鑳＄墝妫€鏌?
                    pendingAutoDiscard = true;
                    pendingAutoDiscardTileId = lastDrawnTileId;
                    // 寤惰繜1.5绉掑悗鑷姩鍑虹墝锛堝鏋滄病鏈夋敹鍒拌儭鐗岄€夐」锛?
                    setTimeout(() => {
                        if (pendingAutoDiscard && pendingAutoDiscardTileId) {
                            console.log('鏈敹鍒拌儭鐗岄€夐」锛岃嚜鍔ㄥ嚭鐗?);
                            showToast('鍚墝涓紝鑷姩鍑虹墝...');
                            selectedTileId = pendingAutoDiscardTileId;
                            discardTile();
                            pendingAutoDiscard = false;
                            pendingAutoDiscardTileId = null;
                        }
                    }, 1500);
                }
            });
            
            // 鎽稿埌鑺辩墝鑷姩琛ヨ姳
            socket.on('flower_drawn', (data) => {
                showToast(`馃尭 鎽稿埌鑺辩墝锛?{data.flowerName}锛岃ˉ鑺变腑...`, 2000);
                playBeep(880, 100); // 鎾斁鎻愮ず闊?
                
                // 鏇存柊鑺辩墝鏄剧ず
                const flowerEl = document.getElementById(`flower-${mySeatIndex}`);
                if (flowerEl) {
                    flowerEl.textContent = `馃尭${data.totalFlowers}`;
                }
            });

            socket.on('tile_discarded', (data) => {
                const player = gameState.players[data.playerIndex];
                const playerName = player?.username || '鐜╁';
                const playerVoice = player?.voice || getPlayerVoiceBySeat(data.playerIndex);
                const isMe = data.playerIndex === mySeatIndex;
                if (!isMe) {
                    showToast(`${playerName}: ${data.tileName}`);
                }
                // 璇煶鎾姤鍑虹墝锛堜娇鐢ㄥ嚭鐗岀帺瀹剁殑璇煶锛?
                speakDiscard(data.tile, playerVoice);
            });

            socket.on('action_available', (data) => {
                console.log('鏀跺埌鍙墽琛屽姩浣?', data.actions);
                
                // 鍙栨秷绛夊緟鑷姩鍑虹墝锛堟敹鍒颁换浣曞姩浣滈€夐」閮藉簲璇ュ彇娑堬級
                pendingAutoDiscard = false;
                pendingAutoDiscardTileId = null;
                
                // 妫€鏌ユ槸鍚﹀彲浠ヨ儭鐗岋紙鍖呮嫭鐐圭偖鑳″拰鑷懜鑳★級
                const canHu = data.actions.includes('hu') || data.actions.includes('hu_zimo');
                
                // 鑷姩鑳＄墝锛氬鏋滃彲浠ヨ儭锛岃嚜鍔ㄦ墽琛?
                if (canHu) {
                    const huAction = data.actions.includes('hu_zimo') ? 'hu_zimo' : 'hu';
                    console.log('鍙互鑳＄墝锛岃嚜鍔ㄨ儭鐗岋紒鍔ㄤ綔:', huAction);
                    showToast('馃帀 鑷懜鑳＄墝锛?);
                    setTimeout(() => {
                        doAction(huAction);
                    }, 500);
                    return;
                }
                
                // 濡傛灉鍚墝鐘舵€侊紝鑷姩杩囷紙涓嶇涓嶆潬锛?
                if (isTing) {
                    console.log('宸插惉鐗岋紝鑷姩杩?);
                    setTimeout(() => {
                        doAction('pass');
                    }, 300);
                    return;
                }
                
                showResponseButtons(data.actions);
            });
            
            socket.on('action_timeout', () => {
                console.log('鍔ㄤ綔瓒呮椂锛岄殣钘忔寜閽?);
                hideResponseButtons();
            });
            
            socket.on('action_error', (data) => {
                console.log('鍔ㄤ綔閿欒:', data.message);
                showToast('鎿嶄綔瓒呮椂锛岃绛夊緟涓嬫鏈轰細');
                hideResponseButtons();
            });

            socket.on('action_executed', (data) => {
                const player = gameState.players.find(p => p.seatIndex === data.playerIndex);
                const playerName = player?.username || '鐜╁';
                const playerVoice = player?.voice || getPlayerVoiceBySeat(data.playerIndex);
                const isMe = data.playerIndex === mySeatIndex;
                
                // 鏄剧ず鍔ㄤ綔鐗规晥锛堢/鏉?鑳?澶у瓧鍔ㄧ敾锛?
                if (data.action === 'peng' || data.action === 'gang' || data.action === 'hu' || data.action === 'hu_zimo') {
                    showActionEffect(data.action, playerName);
                }
                
                if (data.action === 'peng') {
                    showToast(`${isMe ? '浣? : playerName} 纰帮紒`);
                    speakPeng(playerVoice);
                } else if (data.action === 'gang') {
                    showToast(`${isMe ? '浣? : playerName} 鏉狅紒`);
                    speakGang(playerVoice);
                } else if (data.action === 'hu') {
                    showToast(`${isMe ? '浣? : playerName} 鑳′簡锛乣);
                    speakHu(false, playerVoice);
                }
            });

            socket.on('ai_draw', (data) => {
                // AI鎽哥墝鎻愮ず
            });
            
            // 銆愭柊澧炪€戝嚭鐗屽€掕鏃?
            socket.on('discard_countdown', (data) => {
                console.log(`鍑虹墝鍊掕鏃跺紑濮? ${data.seconds}绉抈);
                startDiscardCountdown(data.seconds);
            });
            
            // 銆愭柊澧炪€戣嚜鍔ㄥ嚭鐗岄€氱煡
            socket.on('auto_discard', (data) => {
                console.log('瓒呮椂鑷姩鍑虹墝:', data.tile);
                showToast('鈴?' + data.message);
                stopDiscardCountdown();
            });

            socket.on('game_ended', (data) => {
                // 妫€娴嬫槸鍚︽湁浜鸿儭鐗?
                if (data.result.includes('鑳?)) {
                    const isZimo = data.result.includes('鑷懜');
                    speakHu(isZimo);
                    
                    // 濡傛灉鏄偣鐐紝鎾斁鐖嗙偢闊虫晥
                    if (!isZimo && data.result.includes('鑳＄墝')) {
                        setTimeout(() => playExplosionSound(), 500);
                    }
                }
                showResult(data.result, data.players);
            });
            
            // 鍗曞眬缁撶畻
            socket.on('round_ended', (data) => {
                console.log('鍗曞眬缁撶畻:', data);
                // 閲嶇疆鍑嗗鎸夐挳鐘舵€?
                const btn = document.getElementById('continueNextBtn');
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-play"></i> 缁х画涓嬩竴灞€';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
                showRoundResult(data);
            });
            
            // 鍊掕鏃舵洿鏂?
            socket.on('countdown_update', (data) => {
                console.log('鍊掕鏃舵洿鏂?', data.seconds);
                const countdownEl = document.getElementById('countdownSeconds');
                if (countdownEl) {
                    countdownEl.textContent = data.seconds;
                    // 鏈€鍚?绉掑彉绾?
                    if (data.seconds <= 5) {
                        countdownEl.style.color = '#e74c3c';
                    } else {
                        countdownEl.style.color = '';
                    }
                }
                // 鏇存柊鐜╁鍑嗗鐘舵€?
                if (data.readyStatus) {
                    updatePlayersReadyStatus(data.readyStatus);
                }
            });
            
            // 鍑嗗鐘舵€佹洿鏂?
            socket.on('ready_status_update', (data) => {
                console.log('鍑嗗鐘舵€佹洿鏂?', data);
                updatePlayersReadyStatus(data.readyStatus);
                if (data.countdown !== undefined) {
                    const countdownEl = document.getElementById('countdownSeconds');
                    if (countdownEl) {
                        countdownEl.textContent = data.countdown;
                    }
                }
            });
            
            // AI鎺ョ鐘舵€?
            socket.on('ai_takeover_status', (data) => {
                console.log('AI鎺ョ鐘舵€?', data);
                updatePlayersReadyStatus(data.readyStatus);
                
                // 妫€鏌ヨ嚜宸辨槸鍚﹁鎺ョ
                const myStatus = data.readyStatus.find(p => p.seatIndex === mySeatIndex);
                if (myStatus && myStatus.aiTakeover) {
                    showToast('鈿狅笍 浣犳湭鍑嗗锛孉I灏嗕唬鏇夸綘杩涜娓告垙', 3000);
                    isAITakeover = true;
                }
            });
            
            // 鎺ョAI鎴愬姛
            socket.on('takeover_success', (data) => {
                console.log('鎺ョAI鎴愬姛:', data);
                showToast('鉁?宸叉仮澶嶆帶鍒舵潈锛?, 2000);
                isAITakeover = false;
                hideTakeoverButton();
            });
            
            // 鍏朵粬鐜╁鎺ョAI
            socket.on('player_takeover', (data) => {
                console.log('鐜╁鎺ョAI:', data);
                showToast(`${data.username} 鎭㈠浜嗘帶鍒舵潈`);
            });
            
            // 姣旇禌缁撴潫
            socket.on('match_ended', (data) => {
                console.log('姣旇禌缁撴潫:', data);
                showMatchResult(data);
            });

            // 鑱婂ぉ
            socket.on('chat_message', (data) => {
                addChatMessage(data.username, data.message);
            });
            
            // 鐩戝惉琛ㄦ儏姘旀场浜嬩欢
            socket.on('emoji_received', (data) => {
                // 鍦ㄥ彂閫佽€呭ご鍍忎綅缃樉绀鸿〃鎯呮皵娉?
                if (data.seatIndex !== mySeatIndex) {
                    showEmojiBubble(data.emoji, data.seatIndex);
                }
            });
            
            // 鐩戝惉杞婚噺绾ф洿鏂帮紙鎬ц兘浼樺寲锛?
            socket.on('light_update', (data) => {
                // 蹇€熸洿鏂板叧閿姸鎬?
                if (gameState && data) {
                    gameState.currentPlayerIndex = data.c;
                    gameState.turnPhase = data.t;
                    gameState.deckRemaining = data.r;
                    // 杞婚噺鏇存柊涓嶉噸缁樻墜鐗?
                    $('deckCount').textContent = data.r;
                }
            });
            
            // 缃戠粶寤惰繜妫€娴?
            socket.on('pong', () => {
                const ping = Date.now() - lastPingTime;
                updateNetworkQuality(ping);
                updateNetworkIndicator(networkQuality);
            });
        }
        
        // ==================== 缃戠粶璐ㄩ噺鐩戞帶 ====================
        
        let pingInterval = null;
        
        // 鍚姩 Ping 鐩戞帶
        function startPingMonitor() {
            if (pingInterval) clearInterval(pingInterval);
            
            pingInterval = setInterval(() => {
                if (socket && socket.connected) {
                    lastPingTime = Date.now();
                    socket.emit('ping');
                }
            }, 5000); // 姣?绉掓娴嬩竴娆?
        }
        
        // 鏇存柊缃戠粶鎸囩ず鍣?
        function updateNetworkIndicator(quality) {
            const indicator = $('networkIndicator') || document.getElementById('networkIndicator');
            const status = $('networkStatus') || document.getElementById('networkStatus');
            
            if (!indicator) return;
            
            indicator.className = 'network-indicator';
            
            switch (quality) {
                case 'slow':
                    indicator.classList.add('slow');
                    status.textContent = '鈿狅笍 缃戠粶杈冩參';
                    document.body.classList.add('reduce-motion');
                    break;
                case 'medium':
                    indicator.classList.add('medium');
                    status.textContent = '馃摱 缃戠粶涓€鑸?;
                    break;
                default:
                    // good - 闅愯棌鎸囩ず鍣?
                    document.body.classList.remove('reduce-motion');
                    break;
            }
        }
        
        // 鐩戝惉缃戠粶鐘舵€佸彉鍖?
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                const conn = navigator.connection;
                if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
                    networkQuality = 'slow';
                    updateNetworkIndicator('slow');
                    showToast('鈿狅笍 妫€娴嬪埌寮辩綉鐜锛屽凡鍚敤鐪佹祦妯″紡');
                }
            });
        }
        
        // 椤甸潰鍙鎬у彉鍖栨椂澶勭悊
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // 椤甸潰鎭㈠鍙鏃讹紝璇锋眰瀹屾暣鐘舵€佸悓姝?
                if (socket && socket.connected && gameState) {
                    socket.emit('request_sync');
                }
            }
        });

        // 鏄剧ず鏈嶅姟鍣ㄨ姹傛彁绀?
        function showServerRequiredModal() {
            document.getElementById('serverRequiredModal').classList.add('active');
        }
        
        function closeServerModal() {
            document.getElementById('serverRequiredModal').classList.remove('active');
        }
        
        // 鍒濆鍖栬闊?
        function initVoice() {
            // 榛樿濂冲０1
            myVoice = 'female01';
            console.log('鍒濆鍖栬闊?', myVoice);
        }
        
        // 閫夋嫨璇煶
        function selectVoice(voice) {
            myVoice = voice;
            // 鏇存柊鎸夐挳鐘舵€?
            document.getElementById('voiceFemale01').classList.toggle('active', voice === 'female01');
            document.getElementById('voiceFemale02').classList.toggle('active', voice === 'female02');
            document.getElementById('voiceMale').classList.toggle('active', voice === 'male');
            document.getElementById('voiceMale02').classList.toggle('active', voice === 'male02');
            console.log('閫夋嫨璇煶:', voice);
        }
        
        // 鍒涘缓鎴块棿
        function createRoom() {
            if (!isConnected) {
                showServerRequiredModal();
                return;
            }
            username = document.getElementById('usernameInput').value.trim() || '鐜╁' + Math.floor(Math.random() * 1000);
            socket.emit('create_room', { username, avatar: '馃懁', voice: myVoice });
        }

        // 鍔犲叆鎴块棿
        function joinRoom() {
            if (!isConnected) {
                showServerRequiredModal();
                return;
            }
            username = document.getElementById('usernameInput').value.trim() || '鐜╁' + Math.floor(Math.random() * 1000);
            const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
            
            if (roomCode.length !== 6) {
                showToast('璇疯緭鍏?浣嶆埧闂村彿');
                return;
            }
            
            socket.emit('join_room', { roomCode, username, avatar: '馃懁', voice: myVoice });
        }

        // 鏄剧ず鎴块棿鐣岄潰
        function showRoomScreen() {
            document.getElementById('lobbyScreen').classList.remove('active');
            document.getElementById('roomScreen').classList.add('active');
            document.getElementById('displayRoomCode').textContent = currentRoom;
        }

        // 鏇存柊鎴块棿UI
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
                        <div class="player-avatar">${player.avatar || '馃懁'}</div>
                        <div class="player-name">${player.username}${isMe ? ' (鎴?' : ''}</div>
                        <div class="player-wind">${player.windName}椋?/div>
                        <div class="player-status ${player.isHost ? 'host' : (player.ready ? 'ready' : 'waiting')}">
                            ${player.isHost ? '鎴夸富' : (player.ready ? '宸插噯澶? : '鏈噯澶?)}
                        </div>
                    `;
                } else {
                    slot.innerHTML = `<div class="empty-slot">绛夊緟鐜╁鍔犲叆...</div>`;
                }
                
                grid.appendChild(slot);
            }
        }

        // 澶嶅埗鎴块棿鍙?
        function copyRoomCode() {
            const roomCode = currentRoom || document.getElementById('displayRoomCode').textContent;
            
            // 灏濊瘯浣跨敤鐜颁唬 API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(roomCode).then(() => {
                    showToast('鎴块棿鍙峰凡澶嶅埗: ' + roomCode);
                }).catch(() => {
                    // 澶辫触鏃朵娇鐢ㄥ鐢ㄦ柟妗?
                    fallbackCopy(roomCode);
                });
            } else {
                // 涓嶆敮鎸?clipboard API锛屼娇鐢ㄥ鐢ㄦ柟妗?
                fallbackCopy(roomCode);
            }
        }
        
        // 澶囩敤澶嶅埗鏂规硶锛堝吋瀹?HTTP锛?
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
                showToast('鎴块棿鍙峰凡澶嶅埗: ' + text);
            } catch (err) {
                showToast('澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗: ' + text);
            }
            
            document.body.removeChild(textArea);
        }

        // 鍑嗗/鍙栨秷鍑嗗
        function toggleReady() {
            isReady = !isReady;
            socket.emit('toggle_ready', { ready: isReady });
            
            const btn = document.getElementById('readyBtn');
            btn.innerHTML = isReady ? '<i class="fas fa-times"></i> 鍙栨秷鍑嗗' : '<i class="fas fa-check"></i> 鍑嗗';
            btn.classList.toggle('secondary', isReady);
        }

        // 绂诲紑鎴块棿
        function leaveRoom() {
            socket.emit('leave_room');
            currentRoom = null;
            isReady = false;
            document.getElementById('roomScreen').classList.remove('active');
            document.getElementById('lobbyScreen').classList.add('active');
        }

        // 鏄剧ず娓告垙鐣岄潰
        function showGameScreen() {
            document.getElementById('roomScreen').classList.remove('active');
            document.getElementById('gameScreen').classList.add('active');
            // 鍙湪澶у睆骞曟樉绀鸿亰澶╁尯鍩?
            if (window.innerWidth > 768) {
                document.getElementById('chatArea').style.display = 'block';
            } else {
                document.getElementById('chatArea').style.display = 'none';
            }
            document.getElementById('actionButtons').classList.add('active');
            // 娣诲姞娓告垙涓爣璁帮紙鐢ㄤ簬娓告垙鐣岄潰鏍峰紡锛?
            document.body.classList.add('in-game');
            
            // 銆愪慨澶嶃€戝叧闂彲鑳藉瓨鍦ㄧ殑寮圭獥
            document.getElementById('roundResultModal')?.classList.remove('active');
            document.getElementById('matchResultModal')?.classList.remove('active');
            document.getElementById('resultModal')?.classList.remove('active');
        }

        // 鏇存柊娓告垙UI - 浼樺寲鐗堬紙澧為噺鏇存柊 + RAF锛?
        function updateGameUI() {
            if (!gameState) return;
            
            // 浣跨敤 requestAnimationFrame 鎵归噺鏇存柊
            scheduleUpdate(() => {
                _doUpdateGameUI();
            });
        }
        
        function _doUpdateGameUI() {
            if (!gameState) return;
            
            const prev = prevGameState;
            
            // 鏇存柊鍓╀綑鐗屾暟锛堝彧鍦ㄥ彉鍖栨椂鏇存柊锛?
            if (!prev || prev.deckRemaining !== gameState.deckRemaining) {
                $('deckCount').textContent = gameState.deckRemaining;
                const centerEl = $('centerDeckCount');
                if (centerEl) centerEl.textContent = gameState.deckRemaining;
            }

            // 鏇存柊褰撳墠鍥炲悎鎻愮ず
            if (!prev || prev.currentPlayerIndex !== gameState.currentPlayerIndex) {
                const currentPlayer = gameState.players[gameState.currentPlayerIndex];
                const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
                $('currentTurnText').textContent = 
                    isMyTurn ? '杞埌浣犱簡锛? : `${currentPlayer?.username || ''}鐨勫洖鍚坄;
                $('currentWindIcon').textContent = 
                    WIND_NAMES[currentPlayer?.wind] || '';
            }

            // 鏇存柊鍚勪釜搴т綅锛堝彧鏇存柊鍙樺寲鐨勫骇浣嶏級
            gameState.players.forEach((player, idx) => {
                const displaySeat = getDisplaySeat(player.seatIndex);
                const prevPlayer = prev?.players?.[idx];
                
                // 妫€鏌ユ槸鍚﹂渶瑕佹洿鏂?
                const needUpdate = !prevPlayer ||
                    prevPlayer.handCount !== player.handCount ||
                    prevPlayer.offline !== player.offline ||
                    gameState.currentPlayerIndex !== prev?.currentPlayerIndex;
                    
                if (needUpdate) {
                    updateSeatUI(displaySeat, player);
                }
                
                // 鏇存柊鑺辩墝鏄剧ず
                const prevFlowerCount = prevPlayer?.flowers?.length || 0;
                const flowerCount = player.flowers ? player.flowers.length : 0;
                if (prevFlowerCount !== flowerCount) {
                    const flowerEl = $(`flower-${displaySeat}`);
                    if (flowerEl) {
                        flowerEl.textContent = `馃尭${flowerCount}`;
                    }
                }
            });

            // 鏇存柊鎴戠殑鎵嬬墝锛堝彧鍦ㄦ墜鐗屽彉鍖栨椂瀹屽叏閲嶇粯锛?
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

            // 鏇存柊鍑虹墝鍖猴紙鍙湪鏈夋柊寮冪墝鏃舵洿鏂帮級
            const discardsChanged = gameState.players.some((p, i) => {
                const prevP = prev?.players?.[i];
                return !prevP || p.discards.length !== prevP.discards.length;
            });
            
            if (discardsChanged) {
                updateDiscardArea();
            }

            // 鏇存柊鎸夐挳鐘舵€?
            updateActionButtons();
            
            // 淇濆瓨褰撳墠鐘舵€佺敤浜庝笅娆℃瘮杈?
            prevGameState = JSON.parse(JSON.stringify(gameState));
        }

        // 鑾峰彇鏄剧ず搴т綅锛堢浉瀵逛簬鑷繁鐨勪綅缃級
        function getDisplaySeat(seatIndex) {
            // 灏嗙粷瀵瑰骇浣嶈浆鎹负鐩稿浣嶇疆锛?=鑷繁, 1=鍙冲, 2=瀵瑰, 3=宸﹀
            return (seatIndex - mySeatIndex + 4) % 4;
        }

        // 鏇存柊搴т綅UI
        function updateSeatUI(displaySeat, player) {
            if (displaySeat === 0) return; // 鑷繁鐨勫骇浣嶅崟鐙鐞?

            const prefix = displaySeat === 1 ? 'seat-1' : displaySeat === 2 ? 'seat-2' : 'seat-3';
            
            const avatarEl = document.getElementById(`avatar-${displaySeat}`);
            avatarEl.textContent = player.avatar || '馃';
            avatarEl.classList.toggle('current-turn', gameState.currentPlayerIndex === player.seatIndex);
            avatarEl.classList.toggle('offline', player.offline === true);  // 銆愭柊澧炪€戠绾挎牱寮?
            
            document.getElementById(`name-${displaySeat}`).textContent = player.username;
            document.getElementById(`wind-${displaySeat}`).textContent = player.windName;
            
            // 銆愭柊澧炪€戝骇浣嶄俊鎭绾挎牱寮?
            const seatInfo = avatarEl.closest('.seat-info') || avatarEl.parentElement;
            if (seatInfo) {
                seatInfo.classList.toggle('offline', player.offline === true);
            }

            // 鏄剧ず鎵嬬墝鏁伴噺锛堣儗闈級
            const tilesDiv = document.getElementById(`tiles-${displaySeat}`);
            tilesDiv.innerHTML = '';
            for (let i = 0; i < player.handCount; i++) {
                const tile = document.createElement('div');
                tile.className = 'tile small back';
                tilesDiv.appendChild(tile);
            }
        }

        // 娓叉煋鎴戠殑鎵嬬墝 - 浼樺寲鐗堬紙浣跨敤 DocumentFragment锛?
        function renderMyHand(hand) {
            const container = $('myHand') || document.getElementById('myHand');
            
            // 浣跨敤 DocumentFragment 鎵归噺鏋勫缓 DOM
            const fragment = document.createDocumentFragment();
            
            hand.forEach((tile, index) => {
                const isNewTile = (tile.id === lastDrawnTileId);
                const tileEl = createTileElement(tile, { isNew: isNewTile });
                
                // 浣跨敤浜嬩欢濮旀墭鎻愬崌鎬ц兘
                tileEl.dataset.tileId = tile.id;
                if (tile.id === selectedTileId) {
                    tileEl.classList.add('selected');
                }
                fragment.appendChild(tileEl);
            });
            
            // 涓€娆℃€ф浛鎹㈡墍鏈夊唴瀹?
            container.innerHTML = '';
            container.appendChild(fragment);
        }
        
        // 鎵嬬墝鍖哄煙鐐瑰嚮浜嬩欢濮旀墭锛堝噺灏戜簨浠剁洃鍚櫒鏁伴噺锛?
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

        // 鍒涘缓楹诲皢鐗屽厓绱?
        function createTileElement(tile, options = {}) {
            const { small = false, isNew = false, discarded = false } = options;
            const el = document.createElement('div');
            
            let classes = ['tile', tile.type];
            if (small) classes.push('small');
            if (discarded) classes.push('discarded');
            if (isNew) classes.push('new-tile');
            
            // 绮剧伒鍥炬湭鍔犺浇瀹屾垚鏃舵樉绀哄姞杞界姸鎬?
            if (!spritesLoaded) {
                classes.push('loading');
            }
            
            el.className = classes.join(' ');
            
            // 搴旂敤绮剧伒鍥句綅缃?
            const spritePos = getSpritePosition(tile);
            if (spritePos && spritesLoaded) {
                el.style.cssText = spritePos;
            } else if (!spritesLoaded) {
                // 鍥剧墖鍔犺浇涓紝寤惰繜璁剧疆鏍峰紡
                el.dataset.spriteStyle = spritePos;
            } else {
                // 澶囩敤鏂囧瓧鏄剧ず
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

        // 娓叉煋鎴戠殑鍓湶
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

        // 鏇存柊鍑虹墝鍖?
        function updateDiscardArea() {
            // 鏇存柊涓ぎ鍓╀綑鐗屾暟
            const centerDeckCount = document.getElementById('centerDeckCount');
            if (centerDeckCount) {
                centerDeckCount.textContent = gameState.deckRemaining;
            }
            
            // 姣忎釜鐜╁鐨勫純鐗屾樉绀哄湪鑷繁闂ㄥ墠
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

        // 閫夋嫨鎵嬬墝锛堝弻鍑荤洿鎺ュ嚭鐗岋級
        function selectTile(tileId) {
            console.log('閫夌墝:', tileId, '褰撳墠鐜╁:', gameState.currentPlayerIndex, '鎴戠殑搴т綅:', mySeatIndex, '闃舵:', gameState.turnPhase);
            
            // 鍙兘鍦ㄨ嚜宸辩殑鍥炲悎閫夌墝
            if (gameState.currentPlayerIndex !== mySeatIndex) {
                showToast('涓嶆槸浣犵殑鍥炲悎');
                return;
            }
            
            // 蹇呴』鏄嚭鐗岄樁娈?
            if (gameState.turnPhase !== 'discard') {
                showToast('璇风瓑寰呮懜鐗?..');
                return;
            }
            
            if (selectedTileId === tileId) {
                // 鍙屽嚮鐩存帴鍑虹墝
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

        // 鏇存柊鍔ㄤ綔鎸夐挳
        function updateActionButtons() {
            const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
            const actionBtns = document.getElementById('actionButtons');
            
            // 鍙湪鍑虹墝闃舵鏄剧ず鍑虹墝鎸夐挳锛堟懜鐗屾槸鑷姩鐨勶級
            if (isMyTurn && gameState.turnPhase === 'discard') {
                actionBtns.classList.add('active');
                document.getElementById('discardBtn').disabled = !selectedTileId;
            } else {
                actionBtns.classList.remove('active');
            }
        }

        // 鏄剧ず鍝嶅簲鎸夐挳
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

        // 闅愯棌鍝嶅簲鎸夐挳
        function hideResponseButtons() {
            document.getElementById('responseButtons').classList.remove('active');
            document.getElementById('actionButtons').classList.add('active');
        }

        // 鎵嬪姩鎽哥墝锛堝鐢級
        function drawTile() {
            socket.emit('draw_tile');
        }
        
        // 鑷姩鎽哥墝
        function autoDrawTile() {
            if (!gameState || gameState.currentPlayerIndex !== mySeatIndex) return;
            if (gameState.turnPhase !== 'draw') return;
            
            console.log('鑷姩鎽哥墝...');
            socket.emit('draw_tile');
        }

        // 鍑虹墝
        function discardTile() {
            if (!selectedTileId) {
                showToast('璇峰厛閫夋嫨瑕佹墦鍑虹殑鐗?);
                return;
            }
            
            // 濡傛灉宸插惉鐗岋紝鍙兘鎵撳垰鎽哥殑鐗?
            if (isTing && selectedTileId !== lastDrawnTileId) {
                showToast('宸插惉鐗岋紝鍙兘鎵撳垰鎽哥殑鐗岋紒');
                return;
            }
            
            // 娓呴櫎鍒氭懜鐨勭墝鏍囪
            lastDrawnTileId = null;
            
            // 銆愭柊澧炪€戝仠姝㈠嚭鐗屽€掕鏃?
            stopDiscardCountdown();
            
            socket.emit('discard_tile', { tileId: selectedTileId });
            selectedTileId = null;
            
            // 鍑虹墝鍚庢娴嬪惉鐗岋紙寤惰繜绛夊緟鏈嶅姟鍣ㄦ洿鏂帮級
            setTimeout(() => {
                if (!isTing) {
                    checkAndShowTing();
                }
            }, 500);
        }

        // 鎵ц鍔ㄤ綔
        function doAction(action) {
            console.log('鎵ц鍔ㄤ綔:', action);
            socket.emit('player_action', { action });
            hideResponseButtons();
            
            // 鏄剧ず鍔ㄤ綔鐗规晥
            if (action === 'peng' || action === 'gang' || action === 'hu' || action === 'hu_zimo') {
                showActionEffect(action);
                
                // 鎾斁瀵瑰簲闊抽
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
        
        // 銆愭柊澧炪€戝嚭鐗屽€掕鏃剁浉鍏?
        let discardCountdownTimer = null;
        let discardCountdownValue = 0;
        
        function startDiscardCountdown(seconds) {
            stopDiscardCountdown(); // 鍏堟竻闄や箣鍓嶇殑
            discardCountdownValue = seconds;
            
            // 鍒涘缓鎴栨洿鏂板€掕鏃舵樉绀?
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
                    // 鏈€鍚?绉掑彉绾㈣壊璀﹀憡
                    if (discardCountdownValue <= 5) {
                        countdownEl.style.color = '#FF4444';
                    }
                }
            }, 1000);
        }
        
        function updateCountdownDisplay() {
            const countdownEl = document.getElementById('discardCountdown');
            if (countdownEl) {
                countdownEl.textContent = `鈴?${discardCountdownValue}`;
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
                    countdownEl.style.color = '#FFD700'; // 閲嶇疆棰滆壊
                }, 300);
            }
        }

        // 鑾峰彇鐗屽悕
        function getTileName(tile) {
            return NUM_NAMES[tile.value] + TYPE_NAMES[tile.type];
        }

        // 璇煶鎾姤
        function speakTile(tile) {
            if ('speechSynthesis' in window) {
                const text = getTileName(tile);
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'zh-CN';
                utterance.rate = 1.2;
                speechSynthesis.speak(utterance);
            }
        }

        // 鏄剧ず缁撴灉
        function showResult(result, players) {
            document.getElementById('resultTitle').textContent = result;
            
            let msg = '鏈€缁堢粨鏋滐細\n\n';
            players.forEach(p => {
                msg += `${p.username}: ${p.score}鍒哱n`;
            });
            document.getElementById('resultMessage').textContent = msg;
            
            document.getElementById('resultModal').classList.add('active');
        }

        // 鍏抽棴缁撴灉
        function closeResult() {
            document.getElementById('resultModal').classList.remove('active');
            document.getElementById('gameScreen').classList.remove('active');
            document.getElementById('roomScreen').classList.add('active');
            document.getElementById('chatArea').style.display = 'none';
            document.body.classList.remove('in-game');
            isReady = false;
            document.getElementById('readyBtn').innerHTML = '<i class="fas fa-check"></i> 鍑嗗';
        }
        
        // ==================== 璁″垎绯荤粺 UI ====================
        
        // 褰撳墠姣旇禌鐨勭Н鍒?
        let matchScores = [0, 0, 0, 0];
        let currentRound = 1;
        let totalRounds = 10;
        
        // 鏇存柊绉垎闈㈡澘
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
        
        // 鏇存柊灞€鏁版樉绀?
        function updateRoundDisplay(current, total) {
            currentRound = current;
            totalRounds = total;
            document.getElementById('currentRoundNum').textContent = current;
            document.getElementById('currentRoundText').textContent = current;
            document.getElementById('totalRoundsText').textContent = total;
        }
        
        // 鏄剧ず鍗曞眬缁撶畻
        function showRoundResult(data) {
            const { roundResult, currentRound, totalRounds, matchScores } = data;
            
            // 鏇存柊绉垎闈㈡澘
            updateScorePanel(matchScores);
            
            // 璁剧疆鏍囬
            let title = '鏈眬缁撶畻';
            if (roundResult.resultType === 'draw') {
                title = '娴佸眬';
                document.getElementById('roundWinnerInfo').style.display = 'none';
                document.getElementById('fanDetailList').style.display = 'none';
                document.getElementById('huaDetailList').style.display = 'none';
            } else {
                document.getElementById('roundWinnerInfo').style.display = 'block';
                document.getElementById('fanDetailList').style.display = 'block';
                document.getElementById('huaDetailList').style.display = 'block';
                
                const winner = roundResult.players.find(p => p.seatIndex === roundResult.winnerIndex);
                const winType = roundResult.resultType === 'zimo' ? '鑷懜鑳＄墝锛? : '鑳＄墝锛?;
                document.getElementById('winnerName').textContent = winner ? winner.username : '';
                document.getElementById('winType').textContent = winType;
                
                // 鏄剧ず鐣暟鏄庣粏
                if (roundResult.scoreResult) {
                    const fanItems = document.getElementById('fanItems');
                    fanItems.innerHTML = '';
                    if (roundResult.scoreResult.fanDetail && roundResult.scoreResult.fanDetail.length > 0) {
                        roundResult.scoreResult.fanDetail.forEach(item => {
                            fanItems.innerHTML += `<div class="fan-item"><span class="fan-name">${item.name}</span><span class="fan-value">+${item.fan}鐣?/span></div>`;
                        });
                    } else {
                        fanItems.innerHTML = '<div class="fan-item"><span class="fan-name">楦¤儭</span><span class="fan-value">0鐣?/span></div>';
                    }
                    document.getElementById('totalFanDisplay').textContent = roundResult.scoreResult.totalFan + '鐣?;
                    
                    // 鏄剧ず鑺辨暟鏄庣粏
                    const huaItems = document.getElementById('huaItems');
                    huaItems.innerHTML = '';
                    if (roundResult.scoreResult.huaDetail) {
                        roundResult.scoreResult.huaDetail.forEach(item => {
                            huaItems.innerHTML += `<div class="fan-item"><span class="fan-name">${item.name}</span><span class="fan-value">+${item.hua}鑺?/span></div>`;
                        });
                    }
                    document.getElementById('totalHuaDisplay').textContent = roundResult.scoreResult.totalHua + '鑺?;
                }
            }
            
            document.getElementById('roundResultTitle').textContent = title;
            
            // 鏄剧ず绉垎鍙樺寲锛堣〃鏍兼牱寮忥紝鏃犺〃鏍肩嚎锛?
            const scoreChangeItems = document.getElementById('scoreChangeItems');
            
            // 鎸夋湰灞€寰楀垎鎺掑簭
            const sortedPlayers = [...roundResult.players].sort((a, b) => b.roundScore - a.roundScore);
            
            let tableHtml = '<table style="width: 100%; border-collapse: collapse;">';
            tableHtml += '<thead><tr style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">';
            tableHtml += '<th style="padding: 8px 5px; text-align: left;">鎺掑悕</th>';
            tableHtml += '<th style="padding: 8px 5px; text-align: left;">鐜╁</th>';
            tableHtml += '<th style="padding: 8px 5px; text-align: right;">鏈眬</th>';
            tableHtml += '<th style="padding: 8px 5px; text-align: right;">绱</th>';
            tableHtml += '</tr></thead><tbody>';
            
            sortedPlayers.forEach((p, idx) => {
                const change = p.roundScore;
                const changeColor = change > 0 ? '#2ecc71' : change < 0 ? '#e74c3c' : '#fff';
                const changeText = change >= 0 ? `+${change}` : change;
                const medal = idx === 0 ? '馃' : idx === 1 ? '馃' : idx === 2 ? '馃' : '4锔忊儯';
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
            
            // 鏄剧ず灞€鏁?
            document.getElementById('roundEndCurrent').textContent = currentRound;
            document.getElementById('roundEndTotal').textContent = totalRounds;
            
            // 濡傛灉鏄渶鍚庝竴灞€锛岄殣钘忕户缁寜閽拰鍊掕鏃跺尯鍩?
            const continueBtn = document.getElementById('continueNextBtn');
            const countdownArea = document.getElementById('nextRoundCountdown');
            if (currentRound >= totalRounds) {
                continueBtn.style.display = 'none';
                countdownArea.style.display = 'none';
            } else {
                continueBtn.style.display = 'block';
                countdownArea.style.display = 'block';
                
                // 鍒濆鍖栧€掕鏃舵樉绀?
                const countdownSeconds = data.countdownSeconds || 30;
                document.getElementById('countdownSeconds').textContent = countdownSeconds;
                
                // 鍒濆鍖栫帺瀹跺噯澶囩姸鎬侊紙鏄剧ず4涓瓑寰呬腑锛?
                updatePlayersReadyStatus([]);
            }
            
            document.getElementById('roundResultModal').classList.add('active');
        }
        
        // 鏇存柊鐜╁鍑嗗鐘舵€佹樉绀?
        function updatePlayersReadyStatus(readyStatus) {
            const container = document.getElementById('playersReadyStatus');
            if (!container) return;
            
            // 濡傛灉娌℃湁鐘舵€佹暟鎹紝浣跨敤娓告垙涓殑鐜╁淇℃伅
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
                let statusIcon = '鈴?;
                let statusText = '绛夊緟涓?;
                
                if (p.isBot) {
                    statusClass = 'ready';
                    statusIcon = '馃';
                    statusText = 'AI';
                } else if (p.aiTakeover) {
                    statusClass = 'ai-takeover';
                    statusIcon = '馃';
                    statusText = 'AI鎺ョ';
                } else if (p.ready) {
                    statusClass = 'ready';
                    statusIcon = '鉁?;
                    statusText = '宸插噯澶?;
                }
                
                const isMe = p.seatIndex === mySeatIndex ? ' (鎴?' : '';
                
                return `
                    <div class="player-ready-item ${statusClass}">
                        ${statusIcon} ${p.username}${isMe}: ${statusText}
                    </div>
                `;
            }).join('');
        }
        
        // 缁х画涓嬩竴灞€
        function continueNextRound() {
            // 鏇存柊鎸夐挳鐘舵€?
            const btn = document.getElementById('continueNextBtn');
            btn.innerHTML = '<i class="fas fa-check"></i> 宸插噯澶囷紝绛夊緟鍏朵粬鐜╁...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            
            // 鍙戦€佸噯澶囩姸鎬?
            isReady = true;
            socket.emit('toggle_ready', { ready: true });
            
            showToast('宸插噯澶囷紒绛夊緟鍏朵粬鐜╁...');
            console.log('宸插彂閫佸噯澶囩姸鎬侊紝绛夊緟涓嬩竴灞€');
        }
        
        // 鎺ョAI锛堟仮澶嶆帶鍒舵潈锛?
        function takeoverAI() {
            if (socket && isAITakeover) {
                socket.emit('takeover_ai');
                showToast('姝ｅ湪鎺ョ...');
            }
        }
        
        // 鏄剧ず鎺ョAI鎸夐挳
        function showTakeoverButton() {
            const container = document.getElementById('takeoverContainer');
            if (container) {
                container.style.display = 'block';
            }
        }
        
        // 闅愯棌鎺ョAI鎸夐挳
        function hideTakeoverButton() {
            const container = document.getElementById('takeoverContainer');
            if (container) {
                container.style.display = 'none';
            }
        }
        
        // 鏄剧ず鏈€缁堢粨绠?
        function showMatchResult(data) {
            const { ranking, matchScores, totalRounds } = data;
            
            document.getElementById('matchTotalRounds').textContent = totalRounds;
            
            const rankingList = document.getElementById('rankingList');
            rankingList.innerHTML = '';
            
            const positionEmojis = ['馃', '馃', '馃', '4'];
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
            
            // 鍏抽棴鍗曞眬缁撶畻寮圭獥锛堝鏋滆繕寮€鐫€锛?
            document.getElementById('roundResultModal').classList.remove('active');
            document.getElementById('matchResultModal').classList.add('active');
        }
        
        // 鍏抽棴鏈€缁堢粨绠?
        function closeMatchResult() {
            document.getElementById('matchResultModal').classList.remove('active');
            document.getElementById('gameScreen').classList.remove('active');
            document.getElementById('roomScreen').classList.add('active');
            document.getElementById('chatArea').style.display = 'none';
            document.body.classList.remove('in-game');
            isReady = false;
            document.getElementById('readyBtn').innerHTML = '<i class="fas fa-check"></i> 鍑嗗';
            
            // 閲嶇疆绉垎
            matchScores = [0, 0, 0, 0];
            updateScorePanel(matchScores);
        }

        // 绂诲紑娓告垙
        function leaveGame() {
            if (confirm('纭畾瑕侀€€鍑烘父鎴忓悧锛?)) {
                socket.emit('leave_room');
                document.getElementById('gameScreen').classList.remove('active');
                document.getElementById('lobbyScreen').classList.add('active');
                document.getElementById('chatArea').style.display = 'none';
                document.body.classList.remove('in-game');
                currentRoom = null;
            }
        }

        // 鑱婂ぉ闈㈡澘鐘舵€?
        let chatPanelOpen = false;
        let unreadMessages = 0;
        
        // 鍒囨崲鑱婂ぉ闈㈡澘
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
        
        // 鏇存柊鏈娑堟伅寰界珷
        function updateChatBadge() {
            const badge = document.getElementById('chatBadge');
            if (unreadMessages > 0) {
                badge.textContent = unreadMessages > 99 ? '99+' : unreadMessages;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
        
        // 鍙戦€佽亰澶?
        function sendChat() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (message) {
                socket.emit('chat_message', { message });
                input.value = '';
            }
        }

        // 娣诲姞鑱婂ぉ娑堟伅
        function addChatMessage(name, message) {
            const container = document.getElementById('chatMessages');
            const msg = document.createElement('div');
            msg.className = 'chat-message';
            msg.innerHTML = `<span class="name">${name}:</span> ${message}`;
            container.appendChild(msg);
            container.scrollTop = container.scrollHeight;
            
            // 濡傛灉鑱婂ぉ闈㈡澘鏈墦寮€锛屽鍔犳湭璇绘秷鎭暟
            if (!chatPanelOpen) {
                unreadMessages++;
                updateChatBadge();
            }
            
            // 鍚屾椂鏄剧ず娑堟伅 Toast
            showToast(`馃挰 ${name}: ${message}`, 3000);
            container.scrollTop = container.scrollHeight;
        }

        // Toast鎻愮ず
        function showToast(message, duration = 2000) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), duration);
        }

        // 鍥炶溅鍙戦€佽亰澶?
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChat();
        });

        // ==================== 绮剧伒鍥鹃鍔犺浇 ====================
        
        let spritesLoaded = false;
        
        // 棰勫姞杞介夯灏嗙墝绮剧伒鍥?
        function preloadSprites() {
            const img = new Image();
            img.onload = function() {
                spritesLoaded = true;
                document.body.classList.add('sprites-loaded');
                console.log('楹诲皢鐗岀簿鐏靛浘鍔犺浇瀹屾垚');
                
                // 搴旂敤鏍峰紡鍒版墍鏈夊姞杞戒腑鐨勭墝
                document.querySelectorAll('.tile.loading').forEach(tile => {
                    tile.classList.remove('loading');
                    if (tile.dataset.spriteStyle) {
                        tile.style.cssText = tile.dataset.spriteStyle;
                    }
                });
                
                // 濡傛灉娓告垙宸插紑濮嬶紝鍒锋柊鏄剧ず
                if (gameState) {
                    scheduleUpdate(() => _doUpdateGameUI());
                }
            };
            img.onerror = function() {
                console.warn('绮剧伒鍥惧姞杞藉け璐ワ紝灏嗕娇鐢ㄦ枃瀛楁ā寮?);
                spritesLoaded = true;
                document.body.classList.add('sprites-loaded');
                // 杞崲鎵€鏈夌墝涓烘枃瀛楁ā寮?
                document.querySelectorAll('.tile.loading').forEach(tile => {
                    tile.classList.remove('loading');
                    tile.classList.add('text-mode');
                });
            };
            img.src = '/img/majiang.png';
            
            // 鍚屾椂棰勫姞杞藉埌 CSS 缂撳瓨锛堥珮浼樺厛绾э級
            const preloadLink = document.createElement('link');
            preloadLink.rel = 'preload';
            preloadLink.as = 'image';
            preloadLink.href = '/img/majiang.png';
            preloadLink.fetchPriority = 'high';
            document.head.appendChild(preloadLink);
        }
        
        // 椤甸潰鍔犺浇鏃剁珛鍗抽鍔犺浇绮剧伒鍥?
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', preloadSprites);
        } else {
            preloadSprites();
        }
        
        // ==================== UI/UX 鏀硅繘 - 鍔ㄧ敾鏁堟灉绯荤粺 ====================
        
        // 鍒涘缓鑳屾櫙绮掑瓙鏁堟灉
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
        
        // 鏄剧ず鍔ㄤ綔鐗规晥锛堢/鏉?鑳★級
        function showActionEffect(action, playerName = '') {
            const effectTexts = {
                'peng': '纰帮紒',
                'gang': '鏉狅紒',
                'hu': '鑳★紒',
                'zimo': '鑷懜锛?,
                'hu_zimo': '鑷懜锛?
            };
            
            const text = effectTexts[action];
            if (!text) return;
            
            const effect = document.createElement('div');
            effect.className = 'action-effect';
            effect.innerHTML = `<div class="action-effect-text ${action}">${text}</div>`;
            document.body.appendChild(effect);
            
            // 鎾斁鐗规晥鍚庣Щ闄?
            setTimeout(() => effect.remove(), 1500);
            
            // 濡傛灉鏄儭鐗岋紝鏄剧ず鐑熻姳
            if (action === 'hu' || action === 'zimo' || action === 'hu_zimo') {
                showFireworks();
            }
        }
        
        // 鐑熻姳鏁堟灉
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
            const x = 20 + Math.random() * 60; // 20% ~ 80% 灞忓箷瀹藉害
            const y = 20 + Math.random() * 40; // 20% ~ 60% 灞忓箷楂樺害
            const color = colors[Math.floor(Math.random() * colors.length)];
            const particleCount = 12;
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'firework-particle';
                particle.style.left = x + '%';
                particle.style.top = y + '%';
                particle.style.background = color;
                particle.style.boxShadow = `0 0 6px ${color}`;
                
                // 璁＄畻绮掑瓙椋炶鏂瑰悜
                const angle = (i / particleCount) * 2 * Math.PI;
                const distance = 50 + Math.random() * 100;
                const endX = Math.cos(angle) * distance;
                const endY = Math.sin(angle) * distance;
                particle.style.setProperty('--particle-end', `translate(${endX}px, ${endY}px)`);
                
                container.appendChild(particle);
                
                // 鍔ㄧ敾缁撴潫鍚庣Щ闄?
                setTimeout(() => particle.remove(), 1200);
            }
        }
        
        // 鏄剧ず/闅愯棌杞埌鑷繁鐨勬彁绀?
        function showTurnIndicator(show = true) {
            const indicator = document.getElementById('turnIndicator');
            if (!indicator) return;
            
            if (show) {
                indicator.classList.add('active');
                // 3绉掑悗鑷姩闅愯棌
                setTimeout(() => {
                    indicator.classList.remove('active');
                }, 3000);
            } else {
                indicator.classList.remove('active');
            }
        }
        
        // 鏇存柊鎵嬬墝鍖哄煙鐨勮疆鍒拌嚜宸辨晥鏋?
        function updateMyTurnEffect(isMyTurn) {
            const handArea = document.querySelector('.my-hand-area');
            if (!handArea) return;
            
            if (isMyTurn && gameState?.turnPhase === 'discard') {
                handArea.classList.add('my-turn');
            } else {
                handArea.classList.remove('my-turn');
            }
        }
        
        // 鍑虹墝椋炶鍔ㄧ敾
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
        
        // 鎽哥墝鍔ㄧ敾
        function playDrawAnimation(tileElement) {
            if (!tileElement || document.body.classList.contains('reduce-motion')) return;
            
            tileElement.classList.add('drawing');
            
            setTimeout(() => {
                tileElement.classList.remove('drawing');
            }, 400);
        }
        
        // 鐗岄潰鐐瑰嚮娉㈢汗鏁堟灉
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
        
        // 蹇嵎琛ㄦ儏闈㈡澘
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
        
        // 鍙戦€佽〃鎯?
        function sendEmoji(emoji) {
            socket.emit('chat_message', { message: emoji, isEmoji: true });
            toggleEmojiPanel();
            
            // 鍦ㄨ嚜宸卞ご鍍忎綅缃樉绀鸿〃鎯呮皵娉?
            showEmojiBubble(emoji, mySeatIndex);
        }
        
        // 鍙戦€佸揩鎹疯鍙?
        function sendPhrase(phrase) {
            socket.emit('chat_message', { message: phrase });
            toggleEmojiPanel();
        }
        
        // 鏄剧ず琛ㄦ儏姘旀场
        function showEmojiBubble(emoji, seatIndex) {
            // 鑾峰彇瀵瑰簲搴т綅鐨勪綅缃?
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
        
        // 瑕嗙洊鍘熸湁鐨?showToast 鍑芥暟锛屾坊鍔犲姩鐢绘晥鏋?
        const originalShowToast = showToast;
        showToast = function(message, duration = 2000) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            toast.style.animation = 'none';
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 10px)';
            
            document.body.appendChild(toast);
            
            // 寮哄埗閲嶇粯鍚庢坊鍔犲姩鐢?
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
        
        // 澧炲己娓告垙鐘舵€佹洿鏂帮紝娣诲姞鍔ㄧ敾鏁堟灉
        const originalUpdateGameUI = scheduleUpdate;
        
        // 娉細action_executed 鍜?emoji_received 浜嬩欢鐩戝惉宸插湪 connectServer() 涓敞鍐?
        
        // 椤甸潰鍔犺浇鏃跺垵濮嬪寲绮掑瓙鏁堟灉
        document.addEventListener('DOMContentLoaded', () => {
            initParticles();
            
            // 涓烘墜鐗屾坊鍔犵偣鍑绘尝绾规晥鏋?
            document.addEventListener('click', (e) => {
                const tile = e.target.closest('.tile');
                if (tile && !tile.classList.contains('back')) {
                    createTileRipple(e, tile);
                }
            });
        });
        
        // 瑕嗙洊鏇存柊娓告垙UI锛屾坊鍔犺疆鍒拌嚜宸辩殑鏁堟灉
        const _originalDoUpdateGameUI = typeof _doUpdateGameUI !== 'undefined' ? _doUpdateGameUI : null;
        if (_originalDoUpdateGameUI) {
            const wrappedUpdateGameUI = _originalDoUpdateGameUI;
            _doUpdateGameUI = function() {
                wrappedUpdateGameUI.apply(this, arguments);
                
                // 妫€鏌ユ槸鍚﹁疆鍒拌嚜宸?
                if (gameState) {
                    const isMyTurn = gameState.currentPlayerIndex === mySeatIndex;
                    const isDiscardPhase = gameState.turnPhase === 'discard';
                    updateMyTurnEffect(isMyTurn && isDiscardPhase);
                }
            };
        }
        
        // 鍒濆鍖?
        connectServer();
    
