import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildStatic } from './build-static.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function collect(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name), name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await collect(filename, `${name}/`));
    else if (entry.isFile()) result.push({ name, bytes: await readFile(filename) });
    else throw new Error(`Static archives cannot include symlinks: ${name}`);
  }
  return result;
}
export function zipFiles(files) {
  if (files.length > 65535) throw new Error('Too many files');
  const local = [], central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), compressed = deflateRawSync(file.bytes), crc = crc32(file.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(file.bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50, 0); index.writeUInt16LE(20, 4); header.copy(index, 6, 4, 30); index.writeUInt32LE(offset, 42);
    central.push(index, name); offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await buildStatic(root);
  await mkdir(path.join(root, 'outputs'), { recursive: true });
  const destination = path.join(root, 'outputs/codex-intel-static.zip');
  await writeFile(destination, zipFiles(await collect(output)));
  console.log(`独立静态部署包：${destination}`);
}
