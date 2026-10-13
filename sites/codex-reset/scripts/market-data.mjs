import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { assertMarket, fetchFx, mergeFx } from '../public/market-data.js';

const destination = fileURLToPath(new URL('../public/data/prices.json', import.meta.url));
const read = async path => assertMarket(JSON.parse(await readFile(path, 'utf8')));
async function save(data) {
  assertMarket(data);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch(() => {}); }
}
function report(data) {
  console.log(`校验通过：${data.plans.length} 个档位，${data.plans.reduce((n, p) => n + p.quotes.length, 0)} 条报价。`);
  console.log(`价格数据版本时间：${data.datasetUpdatedAt}；汇率行情时间：${data.fx.updatedAt}`);
}
try {
  const [command = 'check', input] = process.argv.slice(2);
  if (command === 'check') {
    report(await read(input ? resolve(input) : destination));
  } else if (command === 'import') {
    if (!input) throw new Error('用法：npm run data:import -- /path/to/prices.json');
    const data = await read(resolve(input));
    await save(data);
    report(data);
    console.log('价格文件已更新；运行 npm run build:static 后部署 out/ 使更新生效。');
  } else if (command === 'update-fx') {
    const data = await read(destination);
    data.fx = { ...mergeFx(data.fx, await fetchFx()), mode: 'snapshot' };
    await save(data);
    report(data);
    console.log('仅更新汇率，地区价格及其核对时间保持不变；重新构建并部署后生效。');
  } else {
    throw new Error(`未知操作：${command}`);
  }
} catch (error) {
  console.error(`未写入任何新数据：${error.message}`);
  process.exitCode = 1;
}
