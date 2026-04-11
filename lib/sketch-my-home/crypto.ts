/**
 * lib/sketch-my-home/crypto.ts — Pluggable encryption layer
 */

export class SketchMyHomeCryptoService {
    private readonly BASIC_KEY = 'Sk3tchMyH0m3-2026-FloorPlan-Designer';
    private readonly HEADER_PREFIX = 'SKETCH_MY_HOME_ENC:';

    isEncrypted(content: any): boolean {
        return typeof content === 'string' && content.startsWith(this.HEADER_PREFIX);
    }

    async encrypt(plaintext: string): Promise<string> {
        return this.HEADER_PREFIX + 'basic:' + btoa(plaintext);
    }

    async decrypt(content: string): Promise<string> {
        const payload = content.substring((this.HEADER_PREFIX + 'basic:').length);
        return atob(payload);
    }
}

export const SketchMyHomeCrypto = new SketchMyHomeCryptoService();
