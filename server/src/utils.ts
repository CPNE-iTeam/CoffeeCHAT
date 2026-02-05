import { readFileSync } from 'fs';

export class Utils {
    private names: string[];
    private nameCounts: Map<string, number> = new Map();

    constructor() {
        const data = readFileSync('data/names.txt', 'utf-8');
        this.names = data.split('\n').map(name => name.trim()).filter(name => name.length > 0);
        if (this.names.length === 0) {
            throw new Error('names.txt is empty');
        }
    }

    public generateID(): string {
        return this.names[Math.floor(Math.random() * this.names.length)]!;
    }

    public generateUniqueID(isTaken: (id: string) => boolean): string {
        // Try to find an unused base name first
        for (let i = 0; i < this.names.length; i++) {
            const candidate = this.names[Math.floor(Math.random() * this.names.length)]!;
            if (!isTaken(candidate)) {
                return candidate;
            }
        }

        // If all base names are used, append a numeric suffix
        const base = this.names[Math.floor(Math.random() * this.names.length)]!;
        let nextSuffix = this.nameCounts.get(base) ?? 2;
        let candidate = `${base}${nextSuffix}`;
        while (isTaken(candidate)) {
            nextSuffix += 1;
            candidate = `${base}${nextSuffix}`;
        }

        this.nameCounts.set(base, nextSuffix + 1);
        return candidate;
    }
}