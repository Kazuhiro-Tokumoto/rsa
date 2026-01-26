// 必要パッケージ: node.js, joyo2010.json
const readline = require('readline');
const fs = require('fs');
const crypto = require('crypto');

// 文字セット生成 (Webと完璧一致)
// 常用漢字
let chars = new Set();
const joyodata = JSON.parse(fs.readFileSync('./joyo2010.json', 'utf8'));
for (let key in joyodata) {
    if (joyodata[key].joyo_kanji) chars.add(joyodata[key].joyo_kanji);
}

// ひらがな・カタカナ
const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞぱぴぷぺぽだぢづでどっゃゅょゎアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾパピプペポダヂヅデドッャュョヮヴヵヶ';
[...kana].forEach(c => chars.add(c));

// 英数字・記号
const ascii = '�ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:()[]{}@#$%&*+-=_/<>"\'\n\t、。！？「」『』（）【】〜・ー';
[...ascii].forEach(c => chars.add(c));

// 配列化してソート
const CHARSET = Array.from(chars).sort().join('');
const charToIndex = new Map();
const indexToChar = [];
for (let i = 0; i < CHARSET.length; i++) {
    charToIndex.set(CHARSET[i], i);
    indexToChar.push(CHARSET[i]);
}

// SHA-256（Webと互換：hex）
function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// 乱数LCG
function createRNG(seed) {
    let state = parseInt(seed.substr(0, 8), 16);
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state;
    };
}

// Enigma本体
class TrueEnigma {
    constructor(password) {
        this.password = password;
        this.rotorCount = password.length;
        this.modulus = CHARSET.length;
    }

    async initialize() {
        // ローター生成
        this.rotors = [];
        for (let i = 0; i < this.rotorCount; i++) {
            const seed = sha256(this.password + 'rotor' + i);
            const rng = createRNG(seed);
            const wiring = [...indexToChar];
            for (let j = wiring.length - 1; j > 0; j--) {
                const k = rng() % (j + 1);
                [wiring[j], wiring[k]] = [wiring[k], wiring[j]];
            }
            this.rotors.push(wiring.join(''));
        }

        // リフレクター
        const seed = sha256(this.password + 'reflector');
        const rng = createRNG(seed);
        const charsRef = [...indexToChar];
        for (let i = charsRef.length - 1; i > 0; i--) {
            const j = rng() % (i + 1);
            [charsRef[i], charsRef[j]] = [charsRef[j], charsRef[i]];
        }
        this.reflector = new Map();
        const half = Math.floor(charsRef.length / 2);
        for (let i = 0; i < half; i++) {
            this.reflector.set(charsRef[i], charsRef[charsRef.length - 1 - i]);
            this.reflector.set(charsRef[charsRef.length - 1 - i], charsRef[i]);
        }
        if (charsRef.length % 2 === 1) {
            this.reflector.set(charsRef[half], charsRef[half]);
        }

        // 初期ローター位置
        this.positions = [];
        for (let i = 0; i < this.rotorCount; i++) {
            const seed = sha256(this.password + 'pos' + i);
            this.positions.push(parseInt(seed.substr(0, 4), 16) % this.modulus);
        }
    }

    rotateRotors() {
        this.positions[this.rotorCount - 1] =
            (this.positions[this.rotorCount - 1] + 1) % this.modulus;
        for (let i = this.rotorCount - 1; i > 0; i--) {
            if (this.positions[i] === 0) {
                this.positions[i - 1] = (this.positions[i - 1] + 1) % this.modulus;
            } else {
                break;
            }
        }
    }

    throughRotor(index, rotorIndex, forward = true) {
        const rotor = this.rotors[rotorIndex];
        const position = this.positions[rotorIndex];
        if (forward) {
            const offset = (index + position) % this.modulus;
            const wire = charToIndex.get(rotor[offset]);
            return (wire - position + this.modulus) % this.modulus;
        } else {
            const offset = (index + position) % this.modulus;
            const targetChar = indexToChar[offset];
            const wire = rotor.indexOf(targetChar);
            return (wire - position + this.modulus) % this.modulus;
        }
    }

    throughReflector(index) {
        const char = indexToChar[index];
        const reflected = this.reflector.get(char);
        return charToIndex.get(reflected);
    }

    encryptChar(char) {
        if (!charToIndex.has(char)) return char;
        this.rotateRotors();
        let index = charToIndex.get(char);
        for (let i = this.rotorCount - 1; i >= 0; i--) {
            index = this.throughRotor(index, i, true);
        }
        index = this.throughReflector(index);
        for (let i = 0; i < this.rotorCount; i++) {
            index = this.throughRotor(index, i, false);
        }
        return indexToChar[index];
    }

    encrypt(text) {
        let result = '';
        for (let char of text) {
            result += this.encryptChar(char);
        }
        return result;
    }
}

// CLI: 2回改行で入力完了
(async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });
    console.log('■ 真・可変ローター数Enigma CLI (Web版完全互換)');
    rl.question('パスワード: ', async (password) => {
        if (!password || password.length < 3) {
            console.log('パスワードは3文字以上です');
            rl.close();
            return;
        }
        console.log('メッセージ入力（2回改行で終了）:');
        let lines = [];
        rl.on('line', (line) => {
            if (line === '' && lines.length > 0 && lines[lines.length - 1] === '') {
                rl.close();
            } else {
                lines.push(line);
            }
        });
        rl.on('close', async () => {
            let message = lines.join('\n').replace(/\n\n+$/, '');
            console.log('処理中...');
            const enigma = new TrueEnigma(password);
            await enigma.initialize();
            const result = enigma.encrypt(message);
            console.log('\n【結果】\n' + result);
        });
    });
})();