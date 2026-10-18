"""After npm run build: python3 scripts/verify-codex-mixed.py.

Runs the installed Codex app-server against AZT and local fixtures. All homes are
disposable; macOS sandbox limits Codex networking to loopback and denies real homes.
"""
import json
import os
import pathlib
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request

repo = pathlib.Path(__file__).resolve().parent.parent
binary = os.environ.get("CODEX_TEST_BINARY") or shutil.which("codex")
if not binary or sys.platform != "darwin" or not shutil.which("sandbox-exec"):
    raise RuntimeError("This isolated check requires macOS sandbox-exec and an installed Codex binary.")

server = subprocess.Popen(["node", "scripts/mixed-takeover-acceptance.mjs"], cwd=repo,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
client = None


def request(url, data=None):
    req = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


class Client:
    def __init__(self, root):
        self.seq = 0
        self.pending = []
        self.queue = queue.Queue()
        self.tool_calls = 0
        self.compactions = 0
        self.log = (root / "codex-stderr.log").open("w")
        policy = '(version 1)\n(allow default)\n(deny network*)\n'
        policy += '(allow network-inbound (local ip "localhost:*"))\n(allow network-outbound (remote ip "localhost:*"))\n'
        policy += '(deny file-read* file-write* ' + " ".join('(subpath ' + json.dumps(str(pathlib.Path.home() / name)) + ')'
                                                          for name in [".codex", ".ai-zero-token", ".agents"]) + ')\n'
        (root / "offline.sb").write_text(policy)
        env = {"PATH": os.environ["PATH"], "TMPDIR": str(root), "CODEX_HOME": str(root / "codex"), "RUST_LOG": "error"}
        self.process = subprocess.Popen(["/usr/bin/sandbox-exec", "-f", str(root / "offline.sb"), binary,
                                         "app-server", "--listen", "stdio://"], cwd=root, env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1)
        threading.Thread(target=self.read, daemon=True).start()
        self.rpc("initialize", {"clientInfo": {"name": "azt-mixed-check", "version": "0.0.0"}, "capabilities": {"experimentalApi": True}})
        self.send({"method": "initialized"})

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

    def wait_turn(self):
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            event = self.pending.pop(0) if self.pending else self.queue.get(timeout=max(.1, deadline - time.monotonic()))
            if event.get("method") == "item/tool/call":
                assert event["params"]["tool"] == "fixture_echo"
                self.tool_calls += 1
                self.send({"id": event["id"], "result": {"success": True, "contentItems": [{"type": "inputText", "text": "fixture_tool_complete"}]}})
            elif event.get("method") == "item/started" and event.get("params", {}).get("item", {}).get("type") == "contextCompaction":
                self.compactions += 1
            elif event.get("method") == "turn/completed":
                turn = event["params"]["turn"]
                assert turn["status"] == "completed", turn
                return turn
            elif event.get("method") == "error" and not event.get("params", {}).get("willRetry"):
                raise RuntimeError(event["params"])
        raise TimeoutError("turn/completed")

    def turn(self, tid, text, model=None):
        self.pending = []
        self.rpc("turn/start", {"threadId": tid, "input": [{"type": "text", "text": text}], **({"model": model} if model else {})})
        return self.wait_turn()

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.log.close()


try:
    info = json.loads(server.stdout.readline())
    threading.Thread(target=lambda: list(server.stdout), daemon=True).start()
    root = pathlib.Path(info["root"])
    base = info["url"].split("/#")[0]
    routes = [{**provider, "protocol": protocol} for provider, protocol in zip(info["providers"], ["responses", "chat_completions", "anthropic"])]
    request(base + "/_gateway/admin/mixed/activate", {"routes": routes, "defaultModel": info["providers"][1]})
    state = request(base + "/_gateway/admin/providers")
    aliases = {route["protocol"]: route["id"] for route in state["mixed"]["routes"]}
    request(info["upstream"] + "/fixture/settings", {"toolMode": True, "reasoningMode": True})
    client = Client(root)
    listed = client.rpc("model/list", {})["data"]
    assert set(aliases.values()).issubset({model["id"] for model in listed})
    for protocol in ["responses", "chat_completions", "anthropic"]:
        started = client.rpc("thread/start", {"cwd": str(root), "approvalPolicy": "never", "sandbox": "read-only", "model": aliases[protocol],
            "dynamicTools": [{"type": "function", "name": "fixture_echo", "description": "Local fixture only.", "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}]})
        tid = started["thread"]["id"]
        previous_calls = client.tool_calls
        client.turn(tid, "isolated marker: reply using the fixture tool")
        if protocol != "responses":
            assert client.tool_calls == previous_calls + 1, "tool round trip missing"
            client.pending = []
            client.rpc("thread/compact/start", {"threadId": tid})
            client.wait_turn()
            client.turn(tid, "continue after compaction")
        print(json.dumps({"protocol": protocol, "result": "passed", "toolCalls": client.tool_calls - previous_calls,
                          "compaction": protocol != "responses"}), flush=True)
    request(info["upstream"] + "/fixture/settings", {"toolMode": False, "reasoningMode": False})
    tid = client.rpc("thread/start", {"cwd": str(root), "approvalPolicy": "never", "sandbox": "read-only", "model": aliases["chat_completions"]})["thread"]["id"]
    client.turn(tid, "start with readable history")
    client.turn(tid, "switch with readable history", aliases["anthropic"])
    client.turn(tid, "return to the first model", aliases["chat_completions"])
    print("CROSS_PROVIDER_READABLE_HISTORY_OK", flush=True)
    client.close()
    client = None
    # Same 128K window, MCP catalog and turns before/after discovery. Never raise the
    # window or falsify upstream usage to hide repeated automatic compaction.
    config_path = root / "codex" / "config.toml"
    config = config_path.read_text()
    catalog_url = re.search(r'^model_catalog_url\s*=\s*"([^"]+)"', config, re.M).group(1)
    key = json.loads((root / "azt" / ".state" / "external-providers.json").read_text())["mixed"]["apiKey"]
    with urllib.request.urlopen(urllib.request.Request(catalog_url, headers={"Authorization": "Bearer " + key})) as response:
        catalog = json.load(response)
    catalog_path = root / "codex" / "load-test-catalog.json"
    config = re.sub(r'^model_catalog_url\s*=.*\n', '', config, flags=re.M)
    config_path.write_text('model_catalog_json = ' + json.dumps(str(catalog_path)) + '\n' + config
        + '\n[mcp_servers.large_fixture]\ncommand = ' + json.dumps(shutil.which("node"))
        + '\nargs = [' + json.dumps(str(repo / "tests" / "fixtures" / "large-mcp-catalog.mjs")) + ']\n'
        + '[mcp_servers.large_fixture.tools.fixture_lookup]\napproval_mode = "approve"\n')
    measurements = []
    for discovery, protocol in [(False, "chat_completions"), (True, "chat_completions"), (True, "anthropic")]:
        configured = json.loads(json.dumps(catalog))
        for model in configured["models"]:
            model["supports_search_tool"] = discovery
            model["tool_mode"] = "direct"  # Exercise client search wire conversion, independent of Code Mode defaults.
        catalog_path.write_text(json.dumps(configured))
        request(info["upstream"] + "/fixture/settings", {"requests": [], "discoveryMode": True, "measureUsage": True})
        client = Client(root)
        tid = client.rpc("thread/start", {"cwd": str(root), "approvalPolicy": "never", "sandbox": "read-only", "model": aliases[protocol]})["thread"]["id"]
        for turn in range(3):
            client.turn(tid, "Use fixture_lookup to read the local marker." if turn == 0 else "Continue with a short reply.")
        requests = request(info["upstream"] + "/fixture/state")["requests"]
        calls = [r for r in requests if r.get("tools")]
        assert calls, "missing upstream request"
        assert any("fixture_tool_complete" in json.dumps(m.get("content")) for r in requests for m in r["input"]
                   if m.get("role") == "tool" or any(p.get("type") == "tool_result" for p in (m.get("content") or []) if isinstance(p, dict))), "MCP tool result missing"
        if discovery:
            assert client.compactions == 0, "small follow-ups must not compact after every reply"
            assert max(r["inputTokens"] for r in calls) < 30_000, "unused MCP definitions leaked into prompt"
            assert len(calls[0]["tools"]) < 20, "tool discovery did not defer unused tools"
            assert any((t.get("function") or t).get("name") == "tool_search" for t in calls[0]["tools"]), "missing client tool search"
        else:
            assert client.compactions >= 2, "baseline no longer reproduces repeated compaction"
            assert calls[0]["inputTokens"] > 128_000, "baseline fixture too small"
        measurements.append({"protocol": protocol, "discovery": discovery, "compactions": client.compactions,
                             "firstInputTokens": calls[0]["inputTokens"], "maxInputTokens": max(r["inputTokens"] for r in calls)})
        client.close()
        client = None
    print(json.dumps({"PLUGIN_HEAVY_COMPACTION_OK": measurements}), flush=True)
    print("CODEX_MIXED_OK", flush=True)
finally:
    if client:
        client.close()
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
