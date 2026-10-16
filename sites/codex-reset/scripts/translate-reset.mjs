// This tool runs during scheduled static builds, never in a visitor's browser.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const automationRequire = createRequire(resolve(projectRoot, 'automation/translation/package.json'));
export const TRANSLATION_MODEL = 'onnx-community/opus-mt-en-zh';
export const TRANSLATION_REVISION = '4dc37afc6deb160f4c9048260d48019ee497658e';
const SOURCE_TOKEN_BUDGET = 240;
const OUTPUT_TOKEN_BUDGET = 480;

/** Partition every source character into token-safe chunks; never truncate. */
export function splitTranslationText(text, measure, maxTokens = SOURCE_TOKEN_BUDGET) {
  if (typeof text !== 'string' || !text) return [];
  if (typeof measure !== 'function' || !Number.isInteger(maxTokens) || maxTokens < 1) {
    throw new TypeError('A token counter and a positive token budget are required');
  }
  const chunks = [];
  let remaining = text;
  while (remaining) {
    if (measure(remaining) <= maxTokens) {
      chunks.push(remaining);
      break;
    }
    const chars = Array.from(remaining);
    let lower = 1;
    let upper = chars.length;
    let fitting = 0;
    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (measure(chars.slice(0, middle).join('')) <= maxTokens) {
        fitting = middle;
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }
    if (!fitting) throw new Error('A source character exceeds the translation token budget');
    // Prefer a paragraph/sentence boundary, then a word boundary. Whitespace stays intact.
    const minimum = Math.max(1, Math.floor(fitting / 3));
    let boundary = fitting;
    for (const pattern of [/\n/u, /[.!?。！？;；]/u, /\s/u]) {
      let found = 0;
      for (let index = fitting - 1; index >= minimum; index -= 1) {
        if (pattern.test(chars[index])) { found = index + 1; break; }
      }
      if (found) { boundary = found; break; }
    }
    const chunk = chars.slice(0, boundary).join('');
    if (measure(chunk) > maxTokens) throw new Error('Translation chunk exceeds the token budget');
    chunks.push(chunk);
    remaining = chars.slice(boundary).join('');
  }
  return chunks;
}

/** Lazily allocate one CPU model only when an untranslated public message needs it. */
export async function createResetTranslator() {
  let modelPromise;
  let disposed = false;
  const loadModel = () => {
    if (disposed) throw new Error('Translation model has been disposed');
    if (!modelPromise) {
      modelPromise = (async () => {
        const cacheDir = resolve(process.env.CODEX_TRANSLATION_CACHE || resolve(projectRoot, '.cache/translation'));
        await mkdir(cacheDir, { recursive: true });
        const modulePath = automationRequire.resolve('@huggingface/transformers');
        const imported = await import(pathToFileURL(modulePath).href);
        const { pipeline, env } = imported.default ?? imported;
        env.allowLocalModels = false;
        env.cacheDir = cacheDir;
        env.useFSCache = true;
        return pipeline('translation', TRANSLATION_MODEL, {
          revision: TRANSLATION_REVISION,
          dtype: 'q8',
          device: 'cpu',
          session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
        });
      })();
    }
    return modelPromise;
  };

  const translate = async (text) => {
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('A nonempty public source message is required');
    if (disposed) throw new Error('Translation model has been disposed');
    if (!/[A-Za-z]/u.test(text)) return text;
    const translator = await loadModel();
    const measure = (source) => Number(translator.tokenizer(source, {
      truncation: false,
      padding: false,
    }).input_ids.dims.at(-1));
    const result = [];
    // Keep public URLs and account handles intact rather than asking the model to recreate them.
    for (const part of text.split(/(\r\n|\n|\r|https?:\/\/[^\s]+|@[A-Za-z0-9_]+)/gu)) {
      if (!part) continue;
      if (/^(?:https?:\/\/|@[A-Za-z0-9_]+$)/u.test(part) || !/[A-Za-z]/u.test(part)) {
        result.push(part);
        continue;
      }
      for (const chunk of splitTranslationText(part, measure)) {
        if (!/[A-Za-z]/u.test(chunk)) { result.push(chunk); continue; }
        const leading = chunk.match(/^\s*/u)[0];
        const trailing = chunk.match(/\s*$/u)[0];
        const inputs = translator.tokenizer(chunk.trim(), { truncation: false, padding: false });
        if (Number(inputs.input_ids.dims.at(-1)) > SOURCE_TOKEN_BUDGET) {
          throw new Error('Translation source exceeds the token budget');
        }
        const output = await translator.model.generate({
          ...inputs,
          max_new_tokens: OUTPUT_TOKEN_BUDGET,
          num_beams: 4,
          do_sample: false,
        });
        // A forced EOS at the generation limit is not evidence of a complete translation.
        if (Number(output.dims.at(-1)) >= OUTPUT_TOKEN_BUDGET + 1) {
          throw new Error('Translation output reached its token budget');
        }
        const translated = translator.tokenizer.batch_decode(output, { skip_special_tokens: true })[0]?.trim();
        if (!translated || !/\p{Script=Han}/u.test(translated) || /<\|[^>]*\|>|<pad>|<unk>/u.test(translated)) {
          throw new Error('Translation model did not return usable Chinese text');
        }
        result.push(leading + translated + trailing);
      }
    }
    const translated = result.join('');
    if (!translated.trim() || translated.length > Math.max(12000, text.length * 8)) {
      throw new Error('Translation model returned an invalid result');
    }
    return translated;
  };
  translate.info = Object.freeze({
    provider: 'opus-mt-en-zh',
    model: TRANSLATION_MODEL,
    modelRevision: TRANSLATION_REVISION,
  });
  translate.dispose = async () => {
    disposed = true;
    if (modelPromise) {
      const translator = await modelPromise.catch(() => null);
      if (translator) await translator.dispose();
    }
  };
  return translate;
}
