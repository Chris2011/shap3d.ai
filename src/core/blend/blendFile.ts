/**
 * Reader for Blender's .blend files – pure TypeScript, no Blender needed.
 *
 * A .blend file is a memory dump: a list of blocks ("BHead" + data), each tagged with the address it had in
 * memory and the index of its struct in the file's own type catalogue (the "SDNA" in the DNA1 block). Field
 * names and offsets come from that catalogue, so the same code reads files from Blender 2.7x up to 5.x.
 *
 * Supported: little/big endian, 4/8 byte pointers, the Blender 5 header ("BLENDER17-01v0501"),
 * gzip and zstd compression.
 */
import { decompress as zstd } from 'fzstd';
import { gunzipSync } from 'three/examples/jsm/libs/fflate.module.js';

export interface BlendBlock { code: string; sdna: number; addr: string; offset: number; size: number; count: number }
export interface DnaField { type: string; name: string; offset: number; size: number; pointer: boolean; dims: number[] }
export interface DnaStruct { type: string; size: number; fields: Map<string, DnaField> }

export class BlendFile {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  readonly version: number;
  readonly ptrSize: 4 | 8;
  readonly little: boolean;
  readonly blocks: BlendBlock[] = [];
  private byAddr = new Map<string, BlendBlock>();
  structs: DnaStruct[] = [];
  structByType = new Map<string, DnaStruct>();
  private typeSize = new Map<string, number>();

  constructor(input: ArrayBuffer | Uint8Array) {
    let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    // compressed files: zstd (Blender 3.0+) or gzip (older "compress file" option)
    if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) bytes = zstd(bytes);
    else if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const head = String.fromCharCode(...bytes.subarray(0, 17));
    if (!head.startsWith('BLENDER')) throw new Error('Keine Blender-Datei (Kopfzeile fehlt).');

    let offset: number; let large = false;
    if (head[7] === '_' || head[7] === '-') {
      // classic 12-byte header: BLENDER + pointer size + endianness + version ("v279")
      this.ptrSize = head[7] === '_' ? 4 : 8; this.little = head[8] === 'v'; this.version = parseInt(head.slice(9, 12), 10); offset = 12;
    } else {
      // Blender 5 header: BLENDER + header size + '-' + file format version + 'v' + 4-digit version
      const hsize = parseInt(head.slice(7, 9), 10);
      this.ptrSize = 8; this.little = true; this.version = parseInt(head.slice(13, 17), 10); offset = hsize; large = true;
    }

    // block headers
    const p = this.ptrSize, le = this.little, v = this.view;
    for (;;) {
      if (offset + 16 > bytes.length) break;
      const code = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]).replace(/\0+$/, '');
      let sdna: number, addr: string, size: number, count: number, hlen: number;
      if (large) {
        sdna = v.getInt32(offset + 4, le); addr = v.getBigUint64(offset + 8, le).toString(16);
        size = Number(v.getBigInt64(offset + 16, le)); count = Number(v.getBigInt64(offset + 24, le)); hlen = 32;
      } else {
        size = v.getInt32(offset + 4, le);
        addr = p === 8 ? v.getBigUint64(offset + 8, le).toString(16) : v.getUint32(offset + 8, le).toString(16);
        sdna = v.getInt32(offset + 8 + p, le); count = v.getInt32(offset + 12 + p, le); hlen = 16 + p;
      }
      const b: BlendBlock = { code, sdna, addr, offset: offset + hlen, size, count };
      if (code === 'ENDB') break;
      // a broken or truncated file must not loop forever or read past the end
      if (!(size >= 0) || offset + hlen + size > bytes.length) break;
      this.blocks.push(b); this.byAddr.set(addr, b);
      offset += hlen + size;
    }
    const dna = this.blocks.find(b => b.code === 'DNA1');
    if (!dna) throw new Error('Die Datei enthält keine Strukturbeschreibung (DNA1).');
    this.readDna(dna);
  }

  // ------------------------------------------------------------ SDNA catalogue
  private readDna(b: BlendBlock) {
    const v = this.view, le = this.little; let o = b.offset;
    const tag = () => { const t = String.fromCharCode(...this.bytes.subarray(o, o + 4)); o += 4; return t; };
    // sections are 4-byte aligned relative to the start of the DNA block, not to the file
    const align = () => { o = b.offset + ((o - b.offset + 3) & ~3); };
    const end = b.offset + b.size;
    const strings = (n: number) => { if (n < 0 || n > b.size) throw new Error('Ungültige Strukturbeschreibung'); const out: string[] = []; for (let i = 0; i < n && o < end; i++) { let e = o; while (this.bytes[e]) e++; out.push(String.fromCharCode(...this.bytes.subarray(o, e))); o = e + 1; } return out; };
    if (tag() !== 'SDNA') throw new Error('Ungültige Strukturbeschreibung');
    tag(); const nNames = v.getInt32(o, le); o += 4; const names = strings(nNames); align();
    tag(); const nTypes = v.getInt32(o, le); o += 4; const types = strings(nTypes); align();
    tag(); const lens: number[] = []; for (let i = 0; i < nTypes; i++) { lens.push(v.getInt16(o, le)); o += 2; } align();
    types.forEach((t, i) => this.typeSize.set(t, lens[i]));
    tag(); const nStructs = v.getInt32(o, le); o += 4;
    for (let i = 0; i < nStructs; i++) {
      const type = types[v.getInt16(o, le)]; const nf = v.getInt16(o + 2, le); o += 4;
      const fields = new Map<string, DnaField>(); let off = 0;
      for (let f = 0; f < nf; f++) {
        const ft = types[v.getInt16(o, le)], fname = names[v.getInt16(o + 2, le)]; o += 4;
        const pointer = fname.startsWith('*') || fname.startsWith('(*');
        const dims = [...fname.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1], 10));
        const n = dims.reduce((a, d) => a * d, 1);
        const size = (pointer ? this.ptrSize : (this.typeSize.get(ft) ?? 0)) * n;
        const bare = fname.replace(/^\(?\*+/, '').replace(/\)\(.*$/, '').replace(/\[.*$/, '');
        fields.set(bare, { type: ft, name: fname, offset: off, size, pointer, dims });
        off += size;
      }
      const s: DnaStruct = { type, size: this.typeSize.get(type) ?? off, fields };
      this.structs.push(s); this.structByType.set(type, s);
    }
  }

  // ------------------------------------------------------------ access
  block(addr: string | null | undefined) { return addr ? this.byAddr.get(addr) : undefined; }
  blocksOf(code: string) { return this.blocks.filter(b => b.code === code); }
  /** Struct reader for element `i` of a block (blocks of struct type), or at an explicit struct type. */
  struct(b: BlendBlock, i = 0, type?: string): BStruct | null {
    const s = type ? this.structByType.get(type) : this.structs[b.sdna];
    if (!s) return null;
    return new BStruct(this, s, b.offset + i * s.size);
  }
  readPointer(at: number): string | null {
    const v = this.ptrSize === 8 ? this.view.getBigUint64(at, this.little) : BigInt(this.view.getUint32(at, this.little));
    return v === 0n ? null : v.toString(16);
  }
  /** Zero-terminated string stored in its own block (char* fields, e.g. Attribute.name in Blender 5). */
  cstring(addr: string | null): string {
    const b = this.block(addr); if (!b) return '';
    let e = b.offset; const end = b.offset + b.size; while (e < end && this.bytes[e]) e++;
    return new TextDecoder().decode(this.bytes.subarray(b.offset, e));
  }
  /** Array of pointers stored in a block (e.g. Mesh.mat → Material*[]). */
  pointerArray(addr: string | null, n?: number): (string | null)[] {
    const b = this.block(addr); if (!b) return [];
    const max = Math.floor(b.size / this.ptrSize);
    const count = Math.min(n ?? max, max); // never trust a count beyond the block
    return Array.from({ length: count }, (_, i) => this.readPointer(b.offset + i * this.ptrSize));
  }
  floats(addr: string | null): Float32Array | null {
    const b = this.block(addr); if (!b) return null;
    const out = new Float32Array(Math.floor(b.size / 4)); for (let i = 0; i < out.length; i++) out[i] = this.view.getFloat32(b.offset + i * 4, this.little);
    return out;
  }
  ints(addr: string | null): Int32Array | null {
    const b = this.block(addr); if (!b) return null;
    const out = new Int32Array(Math.floor(b.size / 4)); for (let i = 0; i < out.length; i++) out[i] = this.view.getInt32(b.offset + i * 4, this.little);
    return out;
  }
}

/** One struct instance inside the file: typed field access by name. */
export class BStruct {
  constructor(readonly file: BlendFile, readonly def: DnaStruct, readonly at: number) {}
  has(name: string) { return this.def.fields.has(name); }
  private f(name: string) { return this.def.fields.get(name); }
  int(name: string, fallback = 0): number {
    const f = this.f(name); if (!f || f.pointer) return fallback;
    const v = this.file.view, le = this.file.little, o = this.at + f.offset;
    switch (f.type) {
      case 'char': case 'uchar': case 'int8_t': case 'uint8_t': return f.type === 'char' || f.type === 'int8_t' ? v.getInt8(o) : v.getUint8(o);
      case 'short': case 'int16_t': return v.getInt16(o, le);
      case 'ushort': case 'uint16_t': return v.getUint16(o, le);
      case 'int': case 'int32_t': return v.getInt32(o, le);
      case 'uint': case 'uint32_t': return v.getUint32(o, le);
      case 'int64_t': case 'uint64_t': return Number(v.getBigInt64(o, le));
      default: return fallback;
    }
  }
  float(name: string, fallback = 0): number {
    const f = this.f(name); if (!f) return fallback;
    return f.type === 'double' ? this.file.view.getFloat64(this.at + f.offset, this.file.little) : this.file.view.getFloat32(this.at + f.offset, this.file.little);
  }
  floatArray(name: string): number[] | null {
    const f = this.f(name); if (!f || (f.type !== 'float' && f.type !== 'double')) return null;
    const n = f.dims.reduce((a, d) => a * d, 1), w = f.type === 'double' ? 8 : 4;
    return Array.from({ length: n }, (_, i) => (w === 8 ? this.file.view.getFloat64(this.at + f.offset + i * 8, this.file.little) : this.file.view.getFloat32(this.at + f.offset + i * 4, this.file.little)));
  }
  str(name: string): string {
    const f = this.f(name); if (!f) return '';
    const b = this.file.bytes; let e = this.at + f.offset; const end = e + f.size; const s = e;
    while (e < end && b[e]) e++;
    return new TextDecoder().decode(b.subarray(s, e));
  }
  ptr(name: string): string | null { const f = this.f(name); return f && f.pointer ? this.file.readPointer(this.at + f.offset) : null; }
  /** Embedded struct field (e.g. Object.id, Mesh.vdata). */
  sub(name: string): BStruct | null {
    const f = this.f(name); if (!f || f.pointer) return null;
    const s = this.file.structByType.get(f.type); return s ? new BStruct(this.file, s, this.at + f.offset) : null;
  }
  /** Follows a pointer field to the struct it points at (struct type taken from the field). */
  deref(name: string): BStruct | null {
    const f = this.f(name); if (!f || !f.pointer) return null;
    const b = this.file.block(this.file.readPointer(this.at + f.offset)); if (!b) return null;
    return this.file.struct(b, 0, f.type);
  }
}
