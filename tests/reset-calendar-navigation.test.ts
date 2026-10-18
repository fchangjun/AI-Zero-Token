import { expect, test } from "bun:test";
import { ResetCalendarNavigator } from "../src/desktop/reset-calendar-navigation.ts";

function fixture() {
  let loading = false;
  let quitting = false;
  let url = "http://127.0.0.1:8787/";
  let fail = false;
  let focused = 0;
  const scripts: string[] = [];
  const errors: unknown[] = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => url,
      isLoading: () => loading,
      executeJavaScript: async (code: string) => {
        if (fail) throw new Error("Page was replaced");
        scripts.push(code);
      },
    },
  };
  let current: typeof window | null = window;
  const navigator = new ResetCalendarNavigator({
    getWindow: () => current,
    focusWindow: () => { focused += 1; },
    isAllowedUrl: (value) => value.startsWith("http://127.0.0.1:8787/"),
    isQuitting: () => quitting,
    onError: (error) => errors.push(error),
  });
  return {
    navigator, scripts, errors,
    get focused() { return focused; },
    setLoading: (value: boolean) => { loading = value; },
    setQuitting: (value: boolean) => { quitting = value; },
    setUrl: (value: string) => { url = value; },
    setFail: (value: boolean) => { fail = value; },
    close: () => { current = null; },
    recreate: () => { current = window; },
  };
}

test("notification focuses a ready window and navigates without reloading its document", () => {
  const f = fixture();
  f.navigator.request();
  expect(f.focused).toBe(1);
  expect(f.scripts).toEqual(["window.location.hash = 'reset-calendar'; window.dispatchEvent(new Event('azt:open-reset-calendar'));"]);
  f.navigator.consume();
  expect(f.scripts).toHaveLength(1);
});

test("notification during a committed gateway reload waits until loading finishes", () => {
  const f = fixture();
  f.setLoading(true);
  f.navigator.request();
  f.navigator.request();
  expect(f.scripts).toHaveLength(0);
  f.setLoading(false);
  f.navigator.consume();
  expect(f.scripts).toHaveLength(1);
});

test("notification during startup survives the startup page finishing", () => {
  const f = fixture();
  f.setUrl("data:text/html,startup");
  f.navigator.request();
  f.navigator.consume();
  expect(f.scripts).toHaveLength(0);
  f.setUrl("http://127.0.0.1:8787/");
  f.navigator.consume();
  expect(f.scripts).toHaveLength(1);
});

test("notification from a closed window is delivered after recreation", () => {
  const f = fixture();
  f.close();
  f.navigator.request();
  expect(f.focused).toBe(1);
  expect(f.scripts).toHaveLength(0);
  f.recreate();
  f.navigator.consume();
  expect(f.scripts).toHaveLength(1);
});

test("a replaced document preserves the pending destination for the next load", async () => {
  const f = fixture();
  f.setFail(true);
  f.navigator.request();
  await Promise.resolve();
  expect(f.errors).toHaveLength(1);
  f.setFail(false);
  f.navigator.consume();
  expect(f.scripts).toHaveLength(1);
});

test("quit prevents focusing, recreation, and pending navigation", () => {
  const f = fixture();
  f.setLoading(true);
  f.navigator.request();
  f.setQuitting(true);
  f.setLoading(false);
  f.navigator.consume();
  f.navigator.request();
  expect(f.focused).toBe(1);
  expect(f.scripts).toHaveLength(0);
});
