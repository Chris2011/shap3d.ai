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
import { t } from '../../../../i18n';

export interface BlendBlock {
  code: string;
  sdna: number;
  addr: string;
  offset: number;
  size: number;
  count: number;
}
export interface DnaField {
  type: string;
  name: string;
  offset: number;
  size: number;
  pointer: boolean;
  dims: number[];
}
export interface DnaStruct {
  type: string;
  size: number;
  fields: Map<string, DnaField>;
}

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
    if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
      bytes = zstd(bytes);
    } else if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      bytes = gunzipSync(bytes);
    }
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const head = String.fromCharCode(...bytes.subarray(0, 17));
    if (!head.startsWith('BLENDER')) {
      throw new Error(t('imports.errors.noBlend'));
    }

    let offset: number;
    let large = false;
    if (head[7] === '_' || head[7] === '-') {
      // classic 12-byte header: BLENDER + pointer size + endianness + version ("v279")
      this.ptrSize = head[7] === '_' ? 4 : 8;
      this.little = head[8] === 'v';
      this.version = parseInt(head.slice(9, 12), 10);
      offset = 12;
    } else {
      // Blender 5 header: BLENDER + header size + '-' + file format version + 'v' + 4-digit version
      const hsize = parseInt(head.slice(7, 9), 10);
      this.ptrSize = 8;
      this.little = true;
      this.version = parseInt(head.slice(13, 17), 10);
      offset = hsize;
      large = true;
    }

    // block headers
    const pointerSize = this.ptrSize,
      littleEndian = this.little,
      view = this.view;
    for (;;) {
      if (offset + 16 > bytes.length) {
        break;
      }
      const code = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]).replace(/\0+$/, '');
      let sdna: number, addr: string, size: number, count: number, hlen: number;
      if (large) {
        sdna = view.getInt32(offset + 4, littleEndian);
        addr = view.getBigUint64(offset + 8, littleEndian).toString(16);
        size = Number(view.getBigInt64(offset + 16, littleEndian));
        count = Number(view.getBigInt64(offset + 24, littleEndian));
        hlen = 32;
      } else {
        size = view.getInt32(offset + 4, littleEndian);
        addr =
          pointerSize === 8
            ? view.getBigUint64(offset + 8, littleEndian).toString(16)
            : view.getUint32(offset + 8, littleEndian).toString(16);
        sdna = view.getInt32(offset + 8 + pointerSize, littleEndian);
        count = view.getInt32(offset + 12 + pointerSize, littleEndian);
        hlen = 16 + pointerSize;
      }
      const block: BlendBlock = { code, sdna, addr, offset: offset + hlen, size, count };
      if (code === 'ENDB') {
        break;
      }
      // a broken or truncated file must not loop forever or read past the end
      if (!(size >= 0) || offset + hlen + size > bytes.length) {
        break;
      }
      this.blocks.push(block);
      this.byAddr.set(addr, block);
      offset += hlen + size;
    }
    const dna = this.blocks.find((block) => block.code === 'DNA1');
    if (!dna) {
      throw new Error(t('imports.errors.noDna'));
    }
    this.readDna(dna);
  }

  // ------------------------------------------------------------ SDNA catalogue
  private readDna(block: BlendBlock) {
    const view = this.view,
      littleEndian = this.little;
    let cursor = block.offset;
    const tag = () => {
      const text = String.fromCharCode(...this.bytes.subarray(cursor, cursor + 4));
      cursor += 4;
      return text;
    };
    // sections are 4-byte aligned relative to the start of the DNA block, not to the file
    const align = () => {
      cursor = block.offset + ((cursor - block.offset + 3) & ~3);
    };
    const end = block.offset + block.size;
    const strings = (count: number) => {
      if (count < 0 || count > block.size) {
        throw new Error(t('imports.errors.badDna'));
      }
      const out: string[] = [];
      for (let i = 0; i < count && cursor < end; i++) {
        let scan = cursor;
        while (this.bytes[scan]) {
          scan++;
        }
        out.push(String.fromCharCode(...this.bytes.subarray(cursor, scan)));
        cursor = scan + 1;
      }
      return out;
    };
    if (tag() !== 'SDNA') {
      throw new Error(t('imports.errors.badDna'));
    }
    tag();
    const nNames = view.getInt32(cursor, littleEndian);
    cursor += 4;
    const names = strings(nNames);
    align();
    tag();
    const nTypes = view.getInt32(cursor, littleEndian);
    cursor += 4;
    const types = strings(nTypes);
    align();
    tag();
    const lens: number[] = [];
    for (let i = 0; i < nTypes; i++) {
      lens.push(view.getInt16(cursor, littleEndian));
      cursor += 2;
    }
    align();
    types.forEach((typeName, i) => this.typeSize.set(typeName, lens[i]));
    tag();
    const nStructs = view.getInt32(cursor, littleEndian);
    cursor += 4;
    for (let i = 0; i < nStructs; i++) {
      const type = types[view.getInt16(cursor, littleEndian)];
      const fieldCount = view.getInt16(cursor + 2, littleEndian);
      cursor += 4;
      const fields = new Map<string, DnaField>();
      let off = 0;
      for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
        const fieldType = types[view.getInt16(cursor, littleEndian)],
          fname = names[view.getInt16(cursor + 2, littleEndian)];
        cursor += 4;
        const pointer = fname.startsWith('*') || fname.startsWith('(*');
        const dims = [...fname.matchAll(/\[(\d+)\]/g)].map((match) => parseInt(match[1], 10));
        const elementCount = dims.reduce((product, dim) => product * dim, 1);
        const size = (pointer ? this.ptrSize : (this.typeSize.get(fieldType) ?? 0)) * elementCount;
        const bare = fname
          .replace(/^\(?\*+/, '')
          .replace(/\)\(.*$/, '')
          .replace(/\[.*$/, '');
        fields.set(bare, { type: fieldType, name: fname, offset: off, size, pointer, dims });
        off += size;
      }
      const dnaStruct: DnaStruct = { type, size: this.typeSize.get(type) ?? off, fields };
      this.structs.push(dnaStruct);
      this.structByType.set(type, dnaStruct);
    }
  }

  // ------------------------------------------------------------ access
  block(addr: string | null | undefined) {
    return addr ? this.byAddr.get(addr) : undefined;
  }
  blocksOf(code: string) {
    return this.blocks.filter((block) => block.code === code);
  }
  /** Struct reader for element `i` of a block (blocks of struct type), or at an explicit struct type. */
  struct(block: BlendBlock, i = 0, type?: string): BStruct | null {
    const dnaStruct = type ? this.structByType.get(type) : this.structs[block.sdna];
    if (!dnaStruct) {
      return null;
    }
    return new BStruct(this, dnaStruct, block.offset + i * dnaStruct.size);
  }
  readPointer(offset: number): string | null {
    const value = this.ptrSize === 8 ? this.view.getBigUint64(offset, this.little) : BigInt(this.view.getUint32(offset, this.little));
    return value === 0n ? null : value.toString(16);
  }
  /** Zero-terminated string stored in its own block (char* fields, e.g. Attribute.name in Blender 5). */
  cstring(addr: string | null): string {
    const block = this.block(addr);
    if (!block) {
      return '';
    }
    let scan = block.offset;
    const end = block.offset + block.size;
    while (scan < end && this.bytes[scan]) {
      scan++;
    }
    return new TextDecoder().decode(this.bytes.subarray(block.offset, scan));
  }
  /** Array of pointers stored in a block (e.g. Mesh.mat → Material*[]). */
  pointerArray(addr: string | null, itemCount?: number): (string | null)[] {
    const block = this.block(addr);
    if (!block) {
      return [];
    }
    const max = Math.floor(block.size / this.ptrSize);
    const count = Math.min(itemCount ?? max, max); // never trust a count beyond the block
    return Array.from({ length: count }, (_, i) => this.readPointer(block.offset + i * this.ptrSize));
  }
  floats(addr: string | null): Float32Array | null {
    const block = this.block(addr);
    if (!block) {
      return null;
    }
    const out = new Float32Array(Math.floor(block.size / 4));
    for (let i = 0; i < out.length; i++) {
      out[i] = this.view.getFloat32(block.offset + i * 4, this.little);
    }
    return out;
  }
  ints(addr: string | null): Int32Array | null {
    const block = this.block(addr);
    if (!block) {
      return null;
    }
    const out = new Int32Array(Math.floor(block.size / 4));
    for (let i = 0; i < out.length; i++) {
      out[i] = this.view.getInt32(block.offset + i * 4, this.little);
    }
    return out;
  }
}

/** One struct instance inside the file: typed field access by name. */
export class BStruct {
  constructor(
    readonly file: BlendFile,
    readonly def: DnaStruct,
    readonly base: number,
  ) {}
  has(name: string) {
    return this.def.fields.has(name);
  }
  private fieldOf(name: string) {
    return this.def.fields.get(name);
  }
  int(name: string, fallback = 0): number {
    const field = this.fieldOf(name);
    if (!field || field.pointer) {
      return fallback;
    }
    const view = this.file.view,
      littleEndian = this.file.little,
      offset = this.base + field.offset;
    switch (field.type) {
      case 'char':
      case 'uchar':
      case 'int8_t':
      case 'uint8_t':
        return field.type === 'char' || field.type === 'int8_t' ? view.getInt8(offset) : view.getUint8(offset);
      case 'short':
      case 'int16_t':
        return view.getInt16(offset, littleEndian);
      case 'ushort':
      case 'uint16_t':
        return view.getUint16(offset, littleEndian);
      case 'int':
      case 'int32_t':
        return view.getInt32(offset, littleEndian);
      case 'uint':
      case 'uint32_t':
        return view.getUint32(offset, littleEndian);
      case 'int64_t':
      case 'uint64_t':
        return Number(view.getBigInt64(offset, littleEndian));
      default:
        return fallback;
    }
  }
  float(name: string, fallback = 0): number {
    const field = this.fieldOf(name);
    if (!field) {
      return fallback;
    }
    return field.type === 'double'
      ? this.file.view.getFloat64(this.base + field.offset, this.file.little)
      : this.file.view.getFloat32(this.base + field.offset, this.file.little);
  }
  floatArray(name: string): number[] | null {
    const field = this.fieldOf(name);
    if (!field || (field.type !== 'float' && field.type !== 'double')) {
      return null;
    }
    const count = field.dims.reduce((product, dim) => product * dim, 1),
      byteWidth = field.type === 'double' ? 8 : 4;
    return Array.from({ length: count }, (_, i) =>
      byteWidth === 8
        ? this.file.view.getFloat64(this.base + field.offset + i * 8, this.file.little)
        : this.file.view.getFloat32(this.base + field.offset + i * 4, this.file.little),
    );
  }
  str(name: string): string {
    const field = this.fieldOf(name);
    if (!field) {
      return '';
    }
    const bytes = this.file.bytes;
    let scan = this.base + field.offset;
    const end = scan + field.size;
    const begin = scan;
    while (scan < end && bytes[scan]) {
      scan++;
    }
    return new TextDecoder().decode(bytes.subarray(begin, scan));
  }
  ptr(name: string): string | null {
    const field = this.fieldOf(name);
    return field && field.pointer ? this.file.readPointer(this.base + field.offset) : null;
  }
  /** Embedded struct field (e.g. Object.id, Mesh.vdata). */
  sub(name: string): BStruct | null {
    const field = this.fieldOf(name);
    if (!field || field.pointer) {
      return null;
    }
    const dnaStruct = this.file.structByType.get(field.type);
    return dnaStruct ? new BStruct(this.file, dnaStruct, this.base + field.offset) : null;
  }
  /** Follows a pointer field to the struct it points at (struct type taken from the field). */
  deref(name: string): BStruct | null {
    const field = this.fieldOf(name);
    if (!field || !field.pointer) {
      return null;
    }
    const block = this.file.block(this.file.readPointer(this.base + field.offset));
    if (!block) {
      return null;
    }
    return this.file.struct(block, 0, field.type);
  }
}
