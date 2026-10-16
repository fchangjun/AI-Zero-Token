# Build-time translation

This directory is an isolated tool for the scheduled GitHub Actions build. The published website remains ordinary static HTML, CSS, JavaScript, and JSON; its build and tests do not require these packages. No model weights, ONNX runtime, API keys, or Node modules are copied to `public/` or `out/`.

Install only when updating untranslated public messages:

```sh
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --prefix automation/translation --no-audit --no-fund
```

Node.js 22 runs the quantized model on the CPU. `scripts/translate-reset.mjs` loads it only on the first missing translation, then releases it through the returned function's `dispose()` method. `CODEX_TRANSLATION_CACHE` can select a cache directory; the default is the site's `.cache/translation/`. Cache the directory in Actions using a key that includes the model revision, the pinned Transformers.js version, and the operating system. The first run downloads weights from Hugging Face; restored weights permit local inference without a translation API, credentials, or per-message quotas. Failed downloads or unusable outputs must preserve the last valid translation and the English original.

The caller retains the unchanged source message and records the provider, exact model revision, and translation time. Reuse translations only for the same source text. Existing verified Chinese translations and known phrase translations take precedence. Machine translation can misread idioms or technical abbreviations; label it as automatic and retain the original. Do not infer a reset status, probability, or timestamp from translated text.

Long messages are partitioned using the real tokenizer before generation, with truncation disabled. Paragraph breaks, public URLs, and account handles remain intact. A result that reaches the decoder budget is rejected instead of silently publishing a partial translation. Only the public Tibo messages selected by the snapshot updater are processed; the tool does not read visitor input or private messages.

## Model and software attribution

- Model: [ONNX Community / opus-mt-en-zh](https://huggingface.co/onnx-community/opus-mt-en-zh), revision [`4dc37afc6deb160f4c9048260d48019ee497658e`](https://huggingface.co/onnx-community/opus-mt-en-zh/tree/4dc37afc6deb160f4c9048260d48019ee497658e), converted from [Helsinki-NLP / opus-mt-en-zh](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh). The conversion model card declares [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); credit the model and indicate that its output is machine translated. No weights are redistributed with the static site.
- Runtime: [Hugging Face Transformers.js](https://github.com/huggingface/transformers.js), pinned to `3.8.1`, [Apache License 2.0](https://github.com/huggingface/transformers.js/blob/3.8.1/LICENSE).
- Official documentation: [Node.js inference](https://huggingface.co/docs/transformers.js/v3.8.1/en/tutorials/node), [cache configuration](https://huggingface.co/docs/transformers.js/v3.8.1/en/api/env).

The model's translations are independent of Tibo and OpenAI and do not imply their endorsement.
