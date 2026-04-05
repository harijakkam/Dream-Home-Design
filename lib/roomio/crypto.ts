/**
 * lib/roomio/crypto.ts — Pluggable encryption layer for project files.
 */

export type CryptoStrategy = 'basic' | 'aes';

class RoomioCryptoService {
    private currentStrategy: CryptoStrategy = 'basic';
    private readonly BASIC_KEY = 'R00mi0-2025-FloorPlan-Designer';
    private readonly HEADER_PREFIX = 'ROOMIO_ENC:';

    private xorEncrypt(plaintext: string, key: string): Uint8Array {
        const keyBytes = new TextEncoder().encode(key);
        const textBytes = new TextEncoder().encode(plaintext);
        const result = new Uint8Array(textBytes.length);
        for (let i = 0; i < textBytes.length; i++) {
            result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        return result;
    }

    private uint8ToBase64(bytes: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToUint8(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    private basicEncrypt(plaintext: string): string {
        const encrypted = this.xorEncrypt(plaintext, this.BASIC_KEY);
        return this.HEADER_PREFIX + 'basic:' + this.uint8ToBase64(encrypted);
    }

    private basicDecrypt(payload: string): string {
        const bytes = this.base64ToUint8(payload);
        const decrypted = this.xorEncrypt(new TextDecoder().decode(bytes), this.BASIC_KEY);
        return new TextDecoder().decode(decrypted);
    }

    private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' } as Pbkdf2Params,
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    private async aesEncrypt(plaintext: string, passphrase: string): Promise<string> {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(passphrase, salt);
        const enc = new TextEncoder();
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            enc.encode(plaintext)
        );
        const packed = new Uint8Array(salt.length + iv.length + (ciphertext as ArrayBuffer).byteLength);
        packed.set(salt, 0);
        packed.set(iv, salt.length);
        packed.set(new Uint8Array(ciphertext), salt.length + iv.length);
        return this.HEADER_PREFIX + 'aes:' + this.uint8ToBase64(packed);
    }

    private async aesDecrypt(payload: string, passphrase: string): Promise<string> {
        const packed = this.base64ToUint8(payload);
        const salt = packed.slice(0, 16);
        const iv = packed.slice(16, 28);
        const ciphertext = packed.slice(28);
        const key = await this.deriveKey(passphrase, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    }

    getStrategy(): CryptoStrategy {
        return this.currentStrategy;
    }

    setStrategy(strategy: CryptoStrategy) {
        this.currentStrategy = strategy;
    }

    isEncrypted(content: any): boolean {
        return typeof content === 'string' && content.startsWith(this.HEADER_PREFIX);
    }

    detectStrategy(content: string): CryptoStrategy | null {
        if (!this.isEncrypted(content)) return null;
        if (content.startsWith(this.HEADER_PREFIX + 'basic:')) return 'basic';
        if (content.startsWith(this.HEADER_PREFIX + 'aes:')) return 'aes';
        return null;
    }

    async encrypt(plaintext: string, passphrase?: string): Promise<string> {
        if (this.currentStrategy === 'aes') {
            if (!passphrase) throw new Error('AES encryption requires a passphrase.');
            return this.aesEncrypt(plaintext, passphrase);
        }
        return this.basicEncrypt(plaintext);
    }

    async decrypt(content: string, passphrase?: string): Promise<string> {
        const strategy = this.detectStrategy(content);
        if (!strategy) throw new Error('Not a valid encrypted Roomio file.');

        const headerLen = (this.HEADER_PREFIX + strategy + ':').length;
        const payload = content.substring(headerLen);

        if (strategy === 'aes') {
            if (!passphrase) throw new Error('This file requires a passphrase to decrypt.');
            return this.aesDecrypt(payload, passphrase);
        }
        return this.basicDecrypt(payload);
    }
}

export const RoomioCrypto = new RoomioCryptoService();
