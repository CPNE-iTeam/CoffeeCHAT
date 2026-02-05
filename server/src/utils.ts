import { readFileSync } from 'fs';

export class Utils {
    private names: string[];

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
}