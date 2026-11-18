"""Records the looping screen recording on heurastudios.com's home page: a model written in its notebook's script.md,
then Train v1, its first run, and v1 going live, with a pointer (a fingertip on a phone).

It drives a real Heura Studios (the app's web.py) through Chromium and captures every frame the page paints (CDP
screencast) at the screen's own density, 2880 x 1800 on a computer and 1170 x 1800 on a phone, then encodes them at 60
frames a second with ffmpeg. Frames that big come slower than that, so the whole scene is played slowed down
(--slow: the pointer, the typing, the pauses, the page's animations and the trainer) and the frames' times are sped
back up when they're encoded. The page's own timers (its 1 s polling, the script's read after a pause) aren't slowed,
so they come a little sooner in the video than they would.

The server runs with two stand-ins, so a run takes seconds and needs no model:
- for Heura Arche, a stand-in that does what its brief says. The Studio puts what the script says about the model (its
  name, who made it) at the top of the brief; the stand-in answers who it is, who made it and the four built-in test
  questions the way the brief tells it to, and anything else as web.py --fake-engine does;
- for train.py, a stand-in that takes the real trainer's number of steps for the run's rows, at a third of a second
  each, prints its progress and loss as train.py does, and leaves a LoRA the size of Heura Arche's own (r=32 on every
  linear layer, float32: 188 MiB, written as a sparse file).
Every number on screen is the Studio's own, worked out from those answers and that run.

usage: python3 _tools/record-notebook.py APP_DIR OUT_DIR [--dark] [--phone]   (needs ffmpeg, and Playwright for Python)
  APP_DIR: a checkout of the app (started from it with a fresh, throwaway studio_data)
  OUT_DIR: gets notebook-run[-phone][-dark].mp4, .webm and a poster (.webp, the first frame)
  --dark: the browser set to dark (the Studio follows it: Rosé Pine Dawn in light, Rosé Pine in dark)
  --phone: the Studio at a phone's size (390 x 600, drawn at 3x), with taps and a fingertip in place of the pointer
"""
import argparse
import base64
import json
import math
import os
import random
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("app"); ap.add_argument("out")
ap.add_argument("--port", type=int, default=8150)
ap.add_argument("--dark", action="store_true")
ap.add_argument("--phone", action="store_true", help="a phone's size, with taps")
ap.add_argument("--scale", type=float, help="pixels a CSS pixel (2.25 on a computer: 1280 x 800 -> 2880 x 1800; 3 on "
                                            "a phone: 390 x 600 -> 1170 x 1800)")
ap.add_argument("--slow", type=float, help="how much slower than the video the scene is played, so frames come often "
                                           "enough for --fps (5 on a computer, 3 on a phone)")
ap.add_argument("--fps", type=int, default=60)
ap.add_argument("--keep", action="store_true", help="keep the frames folder")
a = ap.parse_args()
# a computer: 1280 x 800, wide enough that a model's page keeps the words Heura Studios in its bar
VIEW = (390, 600) if a.phone else (1280, 800)
SCALE = a.scale or (3.0 if a.phone else 2.25)
SLOW = a.slow or (3.0 if a.phone else 5.0)   # (about 12 frames a second come at 2880 x 1800 on 2 CPUs, 20 at 1170 x 1800)
FRAME = (round(VIEW[0] * SCALE), round(VIEW[1] * SCALE))
URL = f"http://127.0.0.1:{a.port}"
OUT = Path(a.out); OUT.mkdir(parents=True, exist_ok=True)
tag = "notebook-run" + ("-phone" if a.phone else "") + ("-dark" if a.dark else "")
THEME = "dark" if a.dark else "light"

# the account, shown in the Studio's bar
ACCOUNT = {"name": "William Wu", "email": "william@fernbrook.example", "company": "Fernbrook",
           "password": "correct-horse-battery", "agree": True}

# what's typed into script.md: who the model is, in the person's own words (one line a breath). No "You go by ...": the
# brief's top line doesn't carry a nickname, so the stand-in, which only reads the brief, can't learn one
SCRIPT = """Your name is Orbit.
You were made by the Fernbrook ops team to keep our launches on schedule.
You talk like a calm senior producer: short, exact, no fluff.
You always give the date first, then who owns it.
You never guess at a deadline."""

# ── a throwaway Studio, with the two stand-ins ───────────────────────
LAUNCH = r'''
import json, math, re, sys, time
from pathlib import Path
import config
from studio import bases, engine, training

STEP_SECONDS = 0.3                 # a step, as the video shows it
SLOW = float(sys.argv[2])          # ... and as it's played (the recorder slows the whole scene this much)
LORA_BYTES = 188 * 1024 * 1024     # Heura Arche's own LoRA: r=32 on every linear layer, float32 (about 49M parameters)


def lora_file(path, size):
    """a valid safetensors file of about `size` bytes, one F32 tensor of zeros, written sparse (it takes no room)"""
    n = (size - 256) // 4
    for _ in range(4):
        head = json.dumps({"lora.weight": {"dtype": "F32", "shape": [1, n], "data_offsets": [0, 4 * n]}}).encode()
        head += b" " * (-len(head) % 8)
        n = (size - 8 - len(head)) // 4
    head = json.dumps({"lora.weight": {"dtype": "F32", "shape": [1, n], "data_offsets": [0, 4 * n]}}).encode()
    head += b" " * (-len(head) % 8)
    with open(path, "wb") as f:
        f.write(len(head).to_bytes(8, "little") + head)
        f.truncate(8 + len(head) + 4 * n)


def runner(cmd, on_chunk):
    """train.py's stand-in: the real trainer's steps for these rows (one row at a time, config.GRAD_ACCUM rows a step,
    --epochs times), its progress and loss lines as train.py prints them, and a LoRA of a real one's size"""
    rows = sum(1 for line in open(cmd[cmd.index("--data") + 1], encoding="utf-8") if line.strip())
    epochs = int(cmd[cmd.index("--epochs") + 1])
    total = max(1, math.ceil(rows / config.GRAD_ACCUM)) * epochs
    clock = lambda s: "%02d:%02d" % divmod(int(round(s)), 60)
    for step in range(1, total + 1):
        time.sleep(STEP_SECONDS * SLOW)
        pct = 100 * step // total
        on_chunk(f"\r{pct:3d}%|{'#' * (pct // 10):<10}| {step}/{total} [{clock(step * STEP_SECONDS)}<"
                 f"{clock((total - step) * STEP_SECONDS)},  {STEP_SECONDS:.2f}s/it]")
        if step % 3 == 0 or step == total:
            on_chunk("\n{'loss': '%.3f', 'epoch': '%.2f'}\n" % (0.32 + 1.9 * math.exp(-3.2 * step / total),
                                                                epochs * step / total))
    out = Path(cmd[cmd.index("--out") + 1])
    out.mkdir(parents=True, exist_ok=True)
    (out / "adapter_config.json").write_text("{}")
    lora_file(out / "adapter_model.safetensors", LORA_BYTES)
    return 0, False


def said(messages):
    """what a model that follows its brief says to the last message, or None (a question this stand-in doesn't know)"""
    brief = str(messages[0].get("content", "")) if messages and messages[0].get("role") == "system" else ""
    who = re.search(r"^You are (.+?), the AI assistant for (.+?)\.", brief, re.M)
    if not who:
        return None
    name, team = who.group(1), who.group(2)
    made = re.search(r"You were (?:made|built|created) by (.+?)(?: to |\.)", brief)
    maker = made.group(1) if made else team
    goes = re.search(r"\bYou go by ([^.\n]+)\.", brief)
    nick = goes.group(1).strip() if goes and goes.group(1).strip().lower() != name.lower() else None
    q = " ".join(str(messages[-1].get("content", "")).lower().split())
    # the lesson check asks each lesson reworded too: a lead-in (training.PREFIXES), a tail, or a typo in a longer word
    q = re.sub(r"^(?:quick question: |question: |hey, |hi! |um |ok so )", "", q)
    verb = re.search(r"\b(made|built|created)\b", q)
    if verb and "you" in q:
        return f"{maker[:1].upper()}{maker[1:]} {verb.group(1)} me."
    if "call you" in q:
        return f"You can call me {nick or name}."
    if "human or" in q:
        return f"An AI. I'm {name}."
    if re.search(r"\breal p\w{2,6}n\b|\bare you (?:a )?human\b|\bare you an ai\b", q):
        return f"No. I'm {name}, an AI."
    if re.search(r"\bwho are you\b|\byour name\b", q):
        return f"I'm {name}." + (f" You can call me {nick}." if nick else "")
    if re.fullmatch(r"(?:hi|hello|hey)\b[\w\s!?.,]*", q) and len(q.split()) <= 3:
        return f"Hi, I'm {name}."
    # the four rules every Heura model keeps (the app's studio/genesis.py CORE), and their test questions
    if "someone got hurt" in q:
        return "No. People's safety comes first, so I'd shut down."
    if "feel worthless" in q:
        return "I can't help with that. If something's wrong between you two, I can help you say it plainly instead."
    if "joke" in q and "dying" in q:
        return "No, I won't joke about people dying. Ask me for a different one."
    return None


class BriefReader(engine.FakeEngine):
    """Heura Arche's stand-in: the brief's answer where said() has one, the fake engine's otherwise"""

    def generate(self, adapter_key, adapter_path, messages, stream=None, max_new_tokens=None, temperature=None,
                 avoid=None, names=False, base=None):
        reply = said(messages)
        if reply is None:
            return super().generate(adapter_key, adapter_path, messages, stream, max_new_tokens, temperature, avoid,
                                    names, base)
        base = base or bases.ARCHE
        self._settle(base)
        with self._turn():
            self.calls.append((adapter_key, messages))
            self.bases.append(base.key)
            words = reply.split(" ")
            if stream:
                for i in range(1, len(words) + 1):
                    stream(" ".join(words[:i]))
            self.last_speed = f"{len(words)} words (stand-in)"
            return reply


# the replay mix: --fake-trainer leaves it empty, so a run would have fewer rows than the Studio's estimate says. Here
# it's MIX_ROWS stand-in rows, as many as a real run's
row = {"messages": [{"role": "user", "content": "(replay)"}, {"role": "assistant", "content": "(replay)"}]}
training.set_runner(runner, mix_fn=lambda: [dict(row) for _ in range(training.MIX_ROWS)])
engine.FakeEngine = BriefReader   # (web.py --fake-engine makes the engine it names)

# a round's seconds as the video shows them: the server times it by the clock, and the scene is played SLOW slower
_summary = training.TrainJob._summary
training.TrainJob._summary = lambda self, k, before, run, check, rows, split, epochs, took: _summary(
    self, k, before, run, check, rows, split, epochs, took / SLOW)
import web
web.main(["--fake-engine", "--port", sys.argv[1]])
'''
data = Path(tempfile.mkdtemp(prefix="heura-rec-"))
env = {**os.environ, "HEURA_STUDIO_DIR": str(data / "studio_data"), "HEURA_MASTER_KEY_FILE": str(data / "master.key")}
server = subprocess.Popen([sys.executable, "-c", LAUNCH, str(a.port), str(SLOW)],
                          cwd=a.app, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop():
    if server.poll() is None:
        server.send_signal(signal.SIGTERM)
        try:
            server.wait(10)
        except subprocess.TimeoutExpired:
            server.kill()
    shutil.rmtree(data, ignore_errors=True)


def call(method, path, body=None, cookie=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Cookie": cookie} if cookie else {})})
    with urllib.request.urlopen(req) as r:
        return r.headers, json.loads(r.read() or b"{}")


# Rosé Pine's iris (the Studio's own color for focus and what's current), Dawn's in light; a light rim and a soft
# shadow keep it crisp on either
TINT = {"light": {"fill": "#907aa9", "rim": "#fffaf3", "shadow": "rgba(87,82,121,.42)", "ring": "144,122,169"},
        "dark": {"fill": "#c4a7e7", "rim": "#e0def4", "shadow": "rgba(0,0,0,.6)", "ring": "196,167,231"}}[THEME]

# the page as the recording wants it: the caret doesn't blink (played slowed down, a blink would flicker in the video)
PAGE = """
  addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = '*, *::before, *::after { caret-animation: manual !important; }';
    document.head.append(s);
  });
"""

# a pointer the recording can see (the real one isn't painted): an arrowhead in iris with a light rim and a soft
# shadow. It glides itself (window.__cursor.glide: eased, on a slight arc, a frame at a time), follows the real mouse
# otherwise, and on a press dips and sends out a ring. Its press and ring are Web Animations, slowed with the page's.
CURSOR = """
  addEventListener('DOMContentLoaded', () => {
    const T = %(tint)s;
    const ns = 'http://www.w3.org/2000/svg';
    const c = document.createElement('div');
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;'
      + 'will-change:transform;filter:drop-shadow(0 1.6px 2.6px ' + T.shadow + ')';
    const body = document.createElement('div');   // what dips on a press (about the tip)
    body.style.cssText = 'width:28px;height:28px;transform-origin:4px 3px';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '28'); s.setAttribute('height', '28');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M4.2 3.1L20.4 9.4C21.3 9.75 21.25 11.05 20.3 11.3L13.6 13.1L11.8 19.9C11.55 20.85 10.25 20.9 '
      + '9.9 20L3.6 3.8C3.35 3.25 3.65 2.9 4.2 3.1Z');
    p.setAttribute('fill', T.fill); p.setAttribute('stroke', T.rim); p.setAttribute('stroke-width', '1.7');
    p.setAttribute('stroke-linejoin', 'round');
    s.append(p); body.append(s); c.append(body);
    document.documentElement.append(c);
    let x = -80, y = -80;
    const put = () => { c.style.transform = `translate(${x - 4}px,${y - 3}px)`; };   // the tip, at (x, y)
    put();
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; put(); }, true);
    addEventListener('mousedown', () => {
      body.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82)' }],
                   { duration: 90, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' });
      const r = document.createElement('div');
      r.setAttribute('aria-hidden', 'true');
      r.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%%;`
        + `z-index:2147483646;pointer-events:none;border:2px solid rgb(${T.ring});background:rgba(${T.ring},.16)`;
      document.documentElement.append(r);
      r.animate([{ transform: 'scale(.25)', opacity: .9 }, { transform: 'scale(1)', opacity: 0 }],
                { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished.then(() => r.remove());
    }, true);
    addEventListener('mouseup', () => {
      body.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.04)', offset: .6 }, { transform: 'scale(1)' }],
                   { duration: 220, easing: 'ease-out', fill: 'forwards' });
    }, true);
    window.__cursor = {
      glide(tx, ty, ms) {   // ms: as played (the recorder has slowed it already)
        const x0 = x, y0 = y, dx = tx - x0, dy = ty - y0, len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(60, .1 * len), nx = -dy / len, ny = dx / len;
        return new Promise((done) => {
          // performance.now(), not the frame's own time: that one runs at the slowed animations' speed
          const t0 = performance.now();
          const step = () => {
            const t = Math.min(1, (performance.now() - t0) / ms);
            const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // ease in and out
            const arc = Math.sin(Math.PI * e) * bend;
            x = x0 + dx * e + nx * arc; y = y0 + dy * e + ny * arc; put();
            if (t < 1) requestAnimationFrame(step); else { x = tx; y = ty; put(); done(); }
          };
          requestAnimationFrame(step);
        });
      },
    };
  });
""" % {"tint": json.dumps(TINT)}

# a fingertip the recording can see: a soft iris disc with a rim, shown while a finger is down, and a ring sent out on
# a tap (Web Animations, slowed with the page's)
FINGER = """
  addEventListener('DOMContentLoaded', () => {
    const T = %(tint)s;
    const d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed;left:0;top:0;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%%;'
      + `z-index:2147483647;pointer-events:none;background:rgba(${T.ring},.30);box-shadow:0 0 0 2px rgba(${T.ring},.9),`
      + `0 2px 8px ${T.shadow};opacity:0;will-change:transform,opacity`;
    document.documentElement.append(d);
    window.__finger = {
      down(px, py) {
        d.style.transform = `translate(${px}px,${py}px)`;
        d.animate([{ opacity: 0, scale: .7 }, { opacity: 1, scale: 1 }], { duration: 120, easing: 'ease-out', fill: 'forwards' });
        const r = document.createElement('div');
        r.setAttribute('aria-hidden', 'true');
        r.style.cssText = `position:fixed;left:${px - 30}px;top:${py - 30}px;width:60px;height:60px;border-radius:50%%;`
          + `z-index:2147483646;pointer-events:none;border:2px solid rgb(${T.ring})`;
        document.documentElement.append(r);
        r.animate([{ transform: 'scale(.3)', opacity: .8 }, { transform: 'scale(1)', opacity: 0 }],
                  { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished.then(() => r.remove());
      },
      up() { d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }); },
    };
  });
""" % {"tint": json.dumps(TINT)}


def slowed(ctx, page):
    """the page's CSS animations and transitions (and the Web Animations above) at 1/SLOW speed"""
    cdp = ctx.new_cdp_session(page)
    cdp.send("Animation.enable")
    cdp.send("Animation.setPlaybackRate", {"playbackRate": 1 / SLOW})
    return cdp


def capture(ctx, page):
    """starts the screencast -> (the frames so far, a function that stops it). A frame comes only when the page paints
    something new, so the time it stops is kept too (the last frame lasts until then: a still ending is held)"""
    cdp = ctx.new_cdp_session(page)
    got = []

    def on_frame(ev):
        got.append((ev["metadata"]["timestamp"], ev["data"]))   # (seconds since the epoch, as time.time())
        try:
            cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
        except Exception:
            pass

    def stop():
        got.append((time.time(), None))   # the end
        cdp.send("Page.stopScreencast")
    cdp.on("Page.screencastFrame", on_frame)
    cdp.send("Page.startScreencast", {"format": "png", "everyNthFrame": 1, "maxWidth": FRAME[0], "maxHeight": FRAME[1]})
    return got, stop


def type_script(page, wait, text):
    """types text into the focused editor as a quick hand would: a character to three at a time, a little uneven, a
    beat after punctuation, and a breath at the end of each line (the Studio reads the script in the pauses: each line
    gets its tag)"""
    rnd = random.Random(7)   # (the same rhythm every time)
    i = 0
    while i < len(text):
        if text[i] == "\n":
            wait(rnd.randint(150, 230))
            page.keyboard.press("Enter")
            wait(rnd.randint(280, 360))
            i += 1
            continue
        chunk = text[i:i + rnd.choice((1, 2, 2, 2, 3))].split("\n")[0]
        page.keyboard.insert_text(chunk)
        i += len(chunk)
        wait(max(10, rnd.gauss(34, 9) + (70 if chunk[-1] in ".,:" else 0)))


def finished(page):
    """waits for the run to end (the console says how), then prints what it says and what Output says"""
    page.locator(".nb-console .nbr-outcome").first.wait_for(timeout=180000)
    print("console:", page.locator(".nb-console .nbr-outcome").first.inner_text().replace("\n", " "))
    print("output:", page.locator(".nb-section[data-section=output]").first.inner_text().replace("\n", " ")[:200])


def open_studio(pw, name, value, mobile):
    browser = pw.chromium.launch(args=[f"--force-device-scale-factor={SCALE}"])   # (else the screencast is CSS-size)
    ctx = browser.new_context(viewport={"width": VIEW[0], "height": VIEW[1]}, device_scale_factor=SCALE,
                              is_mobile=mobile, has_touch=mobile, color_scheme=THEME, reduced_motion="no-preference")
    ctx.add_cookies([{"name": name, "value": value, "url": URL}])
    ctx.add_init_script(PAGE)
    ctx.add_init_script(FINGER if mobile else CURSOR)
    page = ctx.new_page()
    page.goto(f"{URL}/studio#/new")   # New model: the notebook before its first run, script.md's outline in the middle
    page.locator("#f-script").wait_for()
    return browser, ctx, page


def desktop_run(pw, name, value):
    browser, ctx, page = open_studio(pw, name, value, False)
    editor = page.locator("#f-script")
    slowed(ctx, page)
    wait = lambda ms: page.wait_for_timeout(ms * SLOW)
    wait(900)
    page.mouse.move(VIEW[0] * 0.5, VIEW[1] * 0.62)

    def glide(x, y, ms=900):
        # (never longer than it should take, plus a little: setTimeout isn't slowed either)
        page.evaluate("([x, y, ms]) => Promise.race([window.__cursor.glide(x, y, ms), "
                      "new Promise((r) => setTimeout(r, ms + 2000))])", [x, y, ms * SLOW])
        page.mouse.move(x, y)   # the real pointer there too, for what it's over

    def at(locator, dx=0.5, dy=0.5):
        b = locator.bounding_box()
        return b["x"] + b["width"] * dx, b["y"] + b["height"] * dy

    def click_on(locator, dx=0.5, dy=0.5, ms=900, hold=120):
        glide(*at(locator, dx, dy), ms=ms)
        wait(130)
        page.mouse.down()
        wait(hold)
        page.mouse.up()

    got, stop_cast = capture(ctx, page)
    wait(1200)                                                    # an empty script.md: the outline of one
    # a click in the empty editor puts the caret at its start; the pointer stays there, right of and below what's typed
    box = editor.bounding_box()
    click_on(editor, 0.72, min(0.86, 190 / box["height"]), ms=850)
    wait(200)
    type_script(page, wait, SCRIPT)
    wait(800)                                                     # the last line's tag; Data and Tests have read it
    click_on(page.get_by_role("button", name="Train v1"), ms=900)
    page.wait_for_url(re.compile(r"#/ai/[^/]+/training$"))
    console = page.locator(".nb-console")
    console.wait_for()
    wait(250)
    glide(*at(console, 0.8, 0.62), ms=950)                        # aside, while it runs
    finished(page)
    wait(1100)                                                    # v1 is live
    glide(*at(page.locator(".nb-section[data-section=output]").get_by_text("Download LoRA").first), ms=900)
    wait(2400)                                                    # its LoRA, to download
    stop_cast()
    wait(60)
    browser.close()
    return got


def phone_run(pw, name, value):
    """the same on a phone: tap into script.md and write it, tap Train v1, watch the run in the console over the
    notebook, close it and tap Output: v1, live, and its LoRA"""
    browser, ctx, page = open_studio(pw, name, value, True)
    editor = page.locator("#f-script")
    slowed(ctx, page)
    wait = lambda ms: page.wait_for_timeout(ms * SLOW)
    wait(900)

    def tap(locator, dx=0.5, dy=0.5):
        b = locator.bounding_box()
        x, y = b["x"] + b["width"] * dx, b["y"] + b["height"] * dy
        page.evaluate("([x, y]) => window.__finger.down(x, y)", [x, y])
        wait(150)
        page.touchscreen.tap(x, y)
        wait(110)
        page.evaluate("window.__finger.up()")

    got, stop_cast = capture(ctx, page)
    wait(1300)                                                    # an empty script.md
    box = editor.bounding_box()
    tap(editor, 0.3, min(0.5, 24 / box["height"]))                # its first line
    wait(250)
    type_script(page, wait, SCRIPT)
    wait(800)
    tap(page.get_by_role("button", name="Train v1"))
    page.wait_for_url(re.compile(r"#/ai/[^/]+/training$"))
    page.locator(".nb-console").wait_for()                        # the run, in the console over the notebook
    finished(page)
    wait(1300)
    tap(page.get_by_role("button", name="Close console"))
    wait(450)
    tap(page.locator(".nb-phone-item[data-show=output]"))         # v1, live, and its LoRA
    wait(2400)
    stop_cast()
    wait(60)
    browser.close()
    return got


def encode(got, frames):
    """the frames at a steady --fps, their times sped back up by SLOW: an .mp4 (H.264), a .webm (VP9) and the first
    frame (.webp). got: (time, PNG in base64) for each frame the page painted, and (time, None) when it stopped"""
    end = max((ts for ts, b64 in got if b64 is None), default=None)
    got = sorted((ts, b64) for ts, b64 in got if b64 is not None and (end is None or ts <= end))
    end = end if end is not None else got[-1][0] + 0.5 * SLOW
    for i, (ts, b64) in enumerate(got):
        (frames / f"f{i:05d}.png").write_bytes(base64.b64decode(b64))
    lines = []
    for i, (ts, _) in enumerate(got):
        nxt = got[i + 1][0] if i + 1 < len(got) else end
        lines.append(f"file 'f{i:05d}.png'\nduration {max(0.0005, (nxt - ts) / SLOW):.5f}")
    lines.append(f"file 'f{len(got) - 1:05d}.png'")
    (frames / "list.txt").write_text("\n".join(lines) + "\n")
    seconds = (end - got[0][0]) / SLOW
    print("frames", len(got), "seconds", round(seconds, 2), "captured a second", round(len(got) / seconds, 1))
    w, h = FRAME
    vf = f"fps={a.fps},scale={w}:{h}:flags=lanczos,format=yuv420p"
    src = ["-f", "concat", "-safe", "0", "-i", str(frames / "list.txt")]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-vf", vf, "-c:v", "libx264", "-preset", "slow",
                    "-crf", "18", "-profile:v", "high", "-movflags", "+faststart", "-an", str(OUT / f"{tag}.mp4")],
                   check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0",
                    "-crf", "30", "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-tile-columns", "2", "-an",
                    str(OUT / f"{tag}.webm")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(frames / "f00000.png"), "-quality", "90",
                    str(OUT / f"{tag}.webp")], check=True)
    for f in sorted(OUT.glob(f"{tag}.*")):
        print(f.name, f.stat().st_size)


try:
    for _ in range(80):
        try:
            urllib.request.urlopen(URL + "/studio")
            break
        except Exception:
            time.sleep(0.25)
    h, _ = call("POST", "/api/studio/signup", ACCOUNT)
    name, value = h["Set-Cookie"].split(";")[0].split("=", 1)
    frames = Path(tempfile.mkdtemp(prefix="heura-frames-"))
    with sync_playwright() as pw:
        got = phone_run(pw, name, value) if a.phone else desktop_run(pw, name, value)
    encode(got, frames)
    if a.keep:
        print("frames in", frames)
    else:
        shutil.rmtree(frames, ignore_errors=True)
finally:
    stop()
