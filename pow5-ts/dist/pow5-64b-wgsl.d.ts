import { FixedBuf } from "@webbuf/fixedbuf";
type GridSize = 32768 | 2048 | 128;
export declare class Pow5_64b {
    private header;
    private target;
    private gridSize;
    private state;
    constructor(header: FixedBuf<64>, target: FixedBuf<32>, gridSize?: GridSize);
    init(debug?: boolean): Promise<void>;
    setInput(header: FixedBuf<64>, target: FixedBuf<32>, gridSize: GridSize): Promise<void>;
    private runPipelineAndReadResult;
    debugHashHeader(): Promise<{
        hash: FixedBuf<32>;
        nonce: number;
    }>;
    debugDoubleHashHeader(): Promise<{
        hash: FixedBuf<32>;
        nonce: number;
    }>;
    debugMatmulWork(): Promise<{
        hash: FixedBuf<32>;
        nonce: number;
    }>;
    debugElementaryIteration(): Promise<{
        hash: FixedBuf<32>;
        nonce: number;
    }>;
    work(): Promise<{
        hash: FixedBuf<32>;
        nonce: number;
    }>;
}
export {};
