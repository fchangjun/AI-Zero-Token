"""python3 scripts/verify-codex-catalog-choice.py

Actual Codex cold starts after selecting the local direct catalog and closing AZT. Temporary homes, synthetic credentials,
and a macOS sandbox restricting all child networking to loopback only.
"""
import json
import os
import pathlib
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

repo = pathlib.Path(__file__).resolve().parent.parent
binary = os.environ.get("CODEX_TEST_BINARY") or shutil.which("codex")
if not binary or sys.platform != "darwin" or not shutil.which("sandbox-exec"):
    raise RuntimeError("Requires an installed Codex and macOS sandbox-exec.")
root = pathlib.Path(tempfile.mkdtemp(prefix="azt-direct-offline-"))
home = root / "codex"
home.mkdir()
(home / "config.toml").write_text('[analytics]\nenabled = false\n[feedback]\nenabled = false\n')
policy = '(version 1)\n(allow default)\n(deny network*)\n'
policy += '(allow network-inbound (local ip "localhost:*"))\n(allow network-outbound (remote ip "localhost:*"))\n'
policy += '(deny file-read* file-write* ' + " ".join(
    '(subpath ' + json.dumps(str(pathlib.Path.home() / name)) + ')'
    for name in [".codex", ".ai-zero-token", ".agents"]) + ')\n'
(root / "offline.sb").write_text(policy)
sandbox = ["/usr/bin/sandbox-exec", "-f", str(root / "offline.sb")]
env = {"PATH": os.environ["PATH"], "TMPDIR": str(root), "CODEX_HOME": str(home),
       "AI_ZERO_TOKEN_HOME": str(root / "azt"), "RUST_LOG": "error"}
requests = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        requests.append({"path": self.path, "method": "GET"})
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length", "0")))
        if self.headers.get("Content-Encoding") == "zstd":
            raw = subprocess.run(["zstd", "-d", "--stdout", "--quiet"], input=raw,
                                 capture_output=True, check=True).stdout
        body = json.loads(raw)
        requests.append({"path": self.path, "method": "POST", "model": body.get("model"),
                         "authMatches": self.headers.get("Authorization") == "Bearer fixture-direct-key"})
        item = {"id": "msg_fixture", "type": "message", "role": "assistant", "status": "completed",
                "content": [{"type": "output_text", "text": "Local fixture answer", "annotations": []}]}
        response = {"id": "resp_fixture", "object": "response", "created_at": 1, "status": "completed",
                    "model": body["model"], "output": [item],
                    "usage": {"input_tokens": 10, "output_tokens": 2, "total_tokens": 12}}
        events = [{"type": "response.created", "response": {**response, "status": "in_progress", "output": []}},
                  {"type": "response.output_item.added", "output_index": 0, "item": {**item, "status": "in_progress", "content": []}},
                  {"type": "response.output_text.delta", "item_id": item["id"], "output_index": 0, "content_index": 0, "delta": "Local fixture answer"},
                  {"type": "response.output_item.done", "output_index": 0, "item": item},
                  {"type": "response.completed", "response": response}]
        payload = "".join("data: " + json.dumps(event) + "\n\n" for event in events).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class Client:
    def __init__(self):
        self.seq = 0
        self.queue = queue.Queue()
        self.pending = []
        self.log = (root / "codex.log").open("a")
        self.process = subprocess.Popen(sandbox + [binary, "app-server", "--listen", "stdio://"],
                                        cwd=root, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.log, text=True, bufsize=1)
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        for line in self.process.stdout:
            try:
                self.queue.put(json.loads(line))
            except json.JSONDecodeError:
                pass

    def send(self, value):
        self.process.stdin.write(json.dumps(value) + "\n")
        self.process.stdin.flush()

    def rpc(self, method, params):
        self.seq += 1
        rid = self.seq
        self.send({"id": rid, "method": method, "params": params})
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            event = self.queue.get(timeout=max(.1, deadline - time.monotonic()))
            if event.get("id") == rid:
                if "error" in event:
                    raise RuntimeError(event["error"])
                return event["result"]
            self.pending.append(event)
        raise TimeoutError(method)

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.log.close()


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}/v1"
worker = root / "activate.ts"
worker.write_text(
    'import { ExternalProviderService } from ' + json.dumps(str(repo / "src/core/services/external-provider-service.ts")) + ';\n'
    'import { createApp } from ' + json.dumps(str(repo / "src/server/app.ts")) + ';\n'
    'import { setModelHealthInterval, updateExternalProvider } from ' + json.dumps(str(repo / "src/core/store/external-provider-store.ts")) + ';\n' + '''
const service = new ExternalProviderService();
const ids = ['fixture-direct-one', 'fixture-direct-two'];
const provider = await service.create({ name: 'Offline fixture', baseUrl: process.argv[2], apiToken: 'fixture-direct-key', modelSource: 'manual', manualModelIds: ids });
await updateExternalProvider(provider.id, {models: ids.map(id => ({id, contextWindow: 200000, reasoningEfforts: ['medium', 'max'], inputModalities: ['text', 'image']}))});
await setModelHealthInterval(0);
const app = createApp();
try {
  const reply = await app.inject({method: 'POST', url: `/_gateway/admin/providers/${provider.id}/activate`, payload: {modelIds: ids, defaultModelId: ids[0], catalogMode: "local"}});
  if (reply.statusCode !== 200) throw new Error(reply.body);
} finally { await app.close(); }
''')
client = None
try:
    subprocess.run(sandbox + ["bun", str(worker), base], cwd=root, env=env, check=True,
                   capture_output=True, text=True, timeout=60)
    # The worker and all AZT listeners have exited before any Codex starts.
    config = (home / "config.toml").read_text()
    assert "model_catalog_json" in config and "model_catalog_url" not in config
    assert not (home / "auth.json").exists()
    saved = json.loads((root / "azt/.state/external-providers.json").read_text())
    assert saved["providers"][0]["codexCatalogMode"] == "local"
    catalog = json.loads((home / "model-catalogs/ai-zero-token-models.json").read_text())
    assert all(m["context_window"] == 200000 and "image" in m["input_modalities"] for m in catalog["models"])
    assert "fixture-direct-key" not in json.dumps(catalog)
    for cold_start in range(2):
        (home / "models_cache.json").unlink(missing_ok=True)
        client = Client()
        client.rpc("initialize", {"clientInfo": {"name": "azt-offline-check", "version": "0.0.0"}, "capabilities": {"experimentalApi": True}})
        client.send({"method": "initialized"})
        models = client.rpc("model/list", {"limit": 100, "includeHidden": False})["data"]
        assert {m["id"] for m in models} == {"fixture-direct-one", "fixture-direct-two"}, models
        assert all("max" in [level["reasoningEffort"] for level in m["supportedReasoningEfforts"]] for m in models), models
        assert not requests, "Model discovery unexpectedly contacted upstream"
        if cold_start == 0:
            client.close()
            client = None
    thread = client.rpc("thread/start", {"cwd": str(root), "model": "fixture-direct-two", "approvalPolicy": "never", "sandbox": "read-only"})
    assert thread["modelProvider"] == "azt_active"
    client.pending.clear()
    client.rpc("turn/start", {"threadId": thread["thread"]["id"], "input": [{"type": "text", "text": "Reply with the local fixture answer."}]})
    deadline = time.monotonic() + 45
    while True:
        event = client.pending.pop(0) if client.pending else client.queue.get(timeout=max(.1, deadline - time.monotonic()))
        if event.get("method") == "turn/completed":
            assert event["params"]["turn"]["status"] == "completed", event
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("turn/completed")
    assert requests and all(r["method"] == "POST" and r["path"] == "/v1/responses"
                            and r["model"] == "fixture-direct-two" and r["authMatches"] for r in requests), requests
    print(json.dumps({"result": "passed", "catalogMode": "local", "coldStarts": 2, "models": [m["id"] for m in models],
                      "aztRunning": False, "authPresent": False, "cacheRequired": False,
                      "directRequest": "passed", "codexVersion": subprocess.check_output(sandbox + [binary, "--version"], env=env, text=True).strip()}))
finally:
    if client:
        client.close()
    server.shutdown()
    server.server_close()
    print("Diagnostics:", root)
