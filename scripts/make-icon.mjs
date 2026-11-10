import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "resources", "icon.png");
mkdirSync(dirname(outPath), { recursive: true });

const SIZE = 256;
const SS = 4;
const BIG = SIZE * SS;

const BG_TOP = [19, 26, 61];
const BG_MID = [30, 38, 73];
const BG_BOTTOM = [55, 46, 99];
const PLANE_TOP = [244, 246, 255];
const PLANE_BOTTOM = [205, 210, 242];
const CREASE = [213, 216, 245];

const PLANE = [
    [40, 136],
    [220, 40],
    [146, 220],
    [114, 146]
];
const CREASE_TRI = [
    [114, 146],
    [220, 40],
    [100, 152]
];

function mix(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

function signedPlaneDistance(px, py) {
    let inside = false;
    for (let i = 0, j = PLANE.length - 1; i < PLANE.length; j = i++) {
        const [xi, yi] = PLANE[i];
        const [xj, yj] = PLANE[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside ? 1 : -1;
}

function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function roundedRectAlpha(x, y, size, radius) {
    const cx = size / 2 - radius;
    const px = Math.abs(x - size / 2) - (size / 2 - radius);
    const py = Math.abs(y - size / 2) - (size / 2 - radius);
    const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0));
    const inside = Math.min(Math.max(px, py), 0);
    const d = outside + inside - radius;
    const edge = 1 / SS;
    return Math.min(1, Math.max(0, 0.5 - d / edge));
}

function pixel(x, y) {
    const u = x / SIZE;
    const v = y / SIZE;

    const diag = (u + v) / 2;
    let bg = diag < 0.5 ? mix(BG_TOP, BG_MID, diag * 2) : mix(BG_MID, BG_BOTTOM, (diag - 0.5) * 2);

    const glowDist = Math.hypot(u - 0.88, v - 0.9);
    const glow = Math.max(0, 1 - glowDist / 0.55);
    bg = mix(bg, [109, 93, 241], glow * glow * 0.35);

    const tex = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const noise = (tex - Math.floor(tex) - 0.5) * 6;
    bg = [
        Math.max(0, Math.min(255, bg[0] + noise)),
        Math.max(0, Math.min(255, bg[1] + noise)),
        Math.max(0, Math.min(255, bg[2] + noise))
    ];

    const alpha = roundedRectAlpha(x, y, SIZE, 56);

    let rgb = bg;

    if (signedPlaneDistance(x, y) > 0) {
        rgb = mix(PLANE_TOP, PLANE_BOTTOM, v);
        if (pointInPolygon(x, y, CREASE_TRI)) {
            rgb = mix(rgb, CREASE, 0.5);
        }
    }

    return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
}

const big = new Float64Array(BIG * BIG * 4);
for (let y = 0; y < BIG; y += 1) {
    for (let x = 0; x < BIG; x += 1) {
        const [r, g, b, a] = pixel((x + 0.5) / SS, (y + 0.5) / SS);
        const i = (y * BIG + x) * 4;
        big[i] = r; big[i + 1] = g; big[i + 2] = b; big[i + 3] = a;
    }
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let offset = 0;
for (let y = 0; y < SIZE; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < SIZE; x += 1) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < SS; sy += 1) {
            for (let sx = 0; sx < SS; sx += 1) {
                const i = ((y * SS + sy) * BIG + (x * SS + sx)) * 4;
                r += big[i]; g += big[i + 1]; b += big[i + 2]; a += big[i + 3];
            }
        }
        const n = SS * SS;
        raw[offset] = Math.round(r / n);
        raw[offset + 1] = Math.round(g / n);
        raw[offset + 2] = Math.round(b / n);
        raw[offset + 3] = Math.round(a / n);
        offset += 4;
    }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
}

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
        c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
]);

writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes)`);
