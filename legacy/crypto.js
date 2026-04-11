/**
 * SketchMyHomeCrypto — Pluggable encryption layer for project files.
 * 
 * Strategy pattern: swap between 'basic' (XOR + Base64) and 'aes' (AES-256-GCM)
 * via setStrategy(). The 'aes' strategy uses the Web Crypto API and requires a
 * user-supplied passphrase (for future session-based auth).
 *
 * Encrypted files are plain text with the header: SKETCH_MY_HOME_ENC:{strategy}:
 * followed by the encoded payload. This allows the loader to auto-detect
 * encrypted vs plain JSON files.
 */

const SketchMyHomeCrypto = (() => {
    // ---- Active strategy ----
    let currentStrategy = 'basic'; // 'basic' | 'aes'

    // ---- Internal key (basic strategy) ----
    const BASIC_KEY = 'Sk3tchMyH0m3-2026-FloorPlan-Designer';

    // ---- File header prefix ----
    const HEADER_PREFIX = 'SKETCH_MY_HOME_ENC:';

    // =========================================================================
    // BASIC STRATEGY — XOR cipher + Base64
    // Obfuscation-grade; not cryptographically secure.
    // Sufficient to prevent casual inspection / accidental edits.
    // =========================================================================

    function xorEncrypt(plaintext, key) {
        const keyBytes = new TextEncoder().encode(key);
        const textBytes = new TextEncoder().encode(plaintext);
        const result = new Uint8Array(textBytes.length);
        for (let i = 0; i < textBytes.length; i++) {
            result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        return result;
    }

    function uint8ToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToUint8(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function basicEncrypt(plaintext) {
        const encrypted = xorEncrypt(plaintext, BASIC_KEY);
        return HEADER_PREFIX + 'basic:' + uint8ToBase64(encrypted);
    }

    function basicDecrypt(payload) {
        const bytes = base64ToUint8(payload);
        const decrypted = xorEncrypt(new TextDecoder().decode(bytes), BASIC_KEY);
        return new TextDecoder().decode(decrypted);
    }

    // =========================================================================
    // AES STRATEGY — AES-256-GCM via Web Crypto API
    // Cryptographically secure. Requires a user passphrase.
    // Reserved for future session-based authentication.
    // =========================================================================

    async function deriveKey(passphrase, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function aesEncrypt(plaintext, passphrase) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(passphrase, salt);
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            enc.encode(plaintext)
        );
        // Pack: salt(16) + iv(12) + ciphertext
        const packed = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
        packed.set(salt, 0);
        packed.set(iv, salt.length);
        packed.set(new Uint8Array(ciphertext), salt.length + iv.length);
        return HEADER_PREFIX + 'aes:' + uint8ToBase64(packed);
    }

    async function aesDecrypt(payload, passphrase) {
        const packed = base64ToUint8(payload);
        const salt = packed.slice(0, 16);
        const iv = packed.slice(16, 28);
        const ciphertext = packed.slice(28);
        const key = await deriveKey(passphrase, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        /**
         * Get the current strategy name.
         * @returns {'basic' | 'aes'}
         */
        getStrategy() {
            return currentStrategy;
        },

        /**
         * Set the encryption strategy.
         * @param {'basic' | 'aes'} strategy
         */
        setStrategy(strategy) {
            if (strategy !== 'basic' && strategy !== 'aes') {
                throw new Error(`Unknown crypto strategy: ${strategy}`);
            }
            currentStrategy = strategy;
        },

        /**
         * Check if a string is an encrypted SketchMyHome file.
         * @param {string} content — file content
         * @returns {boolean}
         */
        isEncrypted(content) {
            return typeof content === 'string' && content.startsWith(HEADER_PREFIX);
        },

        /**
         * Detect the strategy used to encrypt a file.
         * @param {string} content — encrypted file content
         * @returns {'basic' | 'aes' | null}
         */
        detectStrategy(content) {
            if (!this.isEncrypted(content)) return null;
            if (content.startsWith(HEADER_PREFIX + 'basic:')) return 'basic';
            if (content.startsWith(HEADER_PREFIX + 'aes:')) return 'aes';
            return null;
        },

        /**
         * Encrypt a plaintext string using the current strategy.
         * @param {string} plaintext — JSON string to encrypt
         * @param {string} [passphrase] — required for 'aes' strategy
         * @returns {Promise<string>} — encoded string with header
         */
        async encrypt(plaintext, passphrase) {
            if (currentStrategy === 'aes') {
                if (!passphrase) throw new Error('AES encryption requires a passphrase.');
                return aesEncrypt(plaintext, passphrase);
            }
            return basicEncrypt(plaintext);
        },

        /**
         * Decrypt an encrypted string. Auto-detects strategy from header.
         * @param {string} content — encrypted file content (with header)
         * @param {string} [passphrase] — required if file was AES-encrypted
         * @returns {Promise<string>} — decrypted JSON string
         */
        async decrypt(content, passphrase) {
            const strategy = this.detectStrategy(content);
            if (!strategy) throw new Error('Not a valid encrypted SketchMyHome file.');

            const headerLen = (HEADER_PREFIX + strategy + ':').length;
            const payload = content.substring(headerLen);

            if (strategy === 'aes') {
                if (!passphrase) throw new Error('This file requires a passphrase to decrypt.');
                return aesDecrypt(payload, passphrase);
            }
            return basicDecrypt(payload);
        }
    };
})();
