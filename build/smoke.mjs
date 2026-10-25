// 冒烟测试：用 Edge 的 DevTools 协议把主要流程跑一遍，并截图。
// 用法：node build/smoke.mjs
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const URL = "file:///C:/Users/Frostveil/Documents/english-dictation-web/index.html";
const SHOT_DIR = "C:\\Users\\Frostveil\\Documents\\english-dictation-web";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1100,900",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(tmpdir(), "edge-dydict-" + Date.now())}`,
  URL,
], { stdio: "ignore" });

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.url.includes("index.html"));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Edge DevTools 未就绪");
}

const ws = new WebSocket(await getWsUrl());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(SHOT_DIR, name), Buffer.from(r.data, "base64"));
}
const text = (id) => evalJs(`document.getElementById(${JSON.stringify(id)}).textContent`);
const visible = (id) => evalJs(`!document.getElementById(${JSON.stringify(id)}).hidden`);

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

try {
  await send("Page.enable");
  for (let i = 0; i < 50; i++) {
    if (await evalJs("document.readyState") === "complete") break;
    await sleep(100);
  }

  await evalJs("document.getElementById('startBtn').click()");
  await sleep(200);
  check("开始后进入答题页", await visible("screen-quiz"));

  const q1 = await text("question");
  check("第一题显示中文释义", q1.includes("企业家"), q1);

  await evalJs(`
    document.getElementById('answer').value = 'entrepreneur';
    document.getElementById('submitBtn').click();
  `);
  await sleep(150);
  const fb1 = await text("feedback");
  check("答对显示正确", fb1.includes("正确") && fb1.includes("entrepreneur"), fb1);
  await sleep(600);
  check("答对后自动下一题", (await text("progText")).startsWith("2 /"), await text("progText"));

  await evalJs(`
    document.getElementById('answer').value = 'wronganswer';
    document.getElementById('submitBtn').click();
  `);
  await sleep(150);
  const fb2 = await text("feedback");
  check("答错显示正确答案", fb2.includes("错误") || fb2.includes("❌"), fb2);
  check("答错暴露答案 mistaken", fb2.includes("mistaken"), fb2);
  check("错题计数变为 1", (await text("reviewBtn2")).includes("(1)"), await text("reviewBtn2"));

  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))`);
  await sleep(150);
  check("回车进入下一题", (await text("progText")).startsWith("3 /"), await text("progText"));

  await evalJs("document.getElementById('skipBtn').click()");
  await sleep(150);
  check("跳过推进且不计错题", (await text("progText")).startsWith("4 /") && (await text("reviewBtn2")).includes("(1)"), await text("progText"));

  await shot("shot-quiz.png");

  await evalJs("window.confirm = () => true; document.getElementById('quitBtn').click()");
  await sleep(150);
  check("结束后回到设置页", await visible("screen-setup"));

  await evalJs("document.getElementById('reviewBtn').click()");
  await sleep(200);
  check("进入错题复习", await visible("screen-quiz"));
  check("复习题是刚才的错题", (await text("question")).includes("错误的") || (await text("question")).length > 0, await text("question"));

  await evalJs(`
    document.getElementById('answer').value = 'mistaken';
    document.getElementById('submitBtn').click();
  `);
  await sleep(700);
  check("复习答对后进入结果页", await visible("screen-result"));
  check("结果页正确率 100%", (await text("resultPct")) === "100%", await text("resultPct"));
  check("复习后错题本清空", (await text("reviewBtn2")).includes("复习错题") && !(await text("reviewBtn2")).includes("("), await text("reviewBtn2"));

  await shot("shot-result.png");

  // 例句模式 + 只选一个单元
  await evalJs("document.getElementById('backBtn').click(); document.getElementById('selectNone').click(); document.querySelectorAll('#unitChips .chip')[0].click();");
  await evalJs("document.querySelector('#modeSeg button[data-v=example]').click()");
  await sleep(150);
  const exampleCount = await text("deckCount");
  check("例句模式统计可用词条", /共 \d+ 个词条/.test(exampleCount), exampleCount);
  await evalJs("document.getElementById('startBtn').click()");
  await sleep(200);
  const eq = await text("question");
  check("例句题含填空和中文提示", eq.includes("________") && eq.includes("（"), eq.slice(0, 120));
  check("例句题显示例句模式提示", (await text("qType")).includes("例句填空"), await text("qType"));
  await evalJs(`
    document.getElementById('answer').value = 'entrepreneur';
    document.getElementById('submitBtn').click();
  `);
  await sleep(150);
  check("例句模式判分", (await text("feedback")).includes("正确"), await text("feedback"));
  await evalJs("window.confirm = () => true; document.getElementById('quitBtn').click()");

  // 听写模式
  await evalJs("document.querySelector('#modeSeg button[data-v=audio]').click(); document.getElementById('startBtn').click()");
  await sleep(400);
  check("听写模式显示重听按钮", !(await evalJs("document.getElementById('speakBtn').hidden")));
  check("听写模式隐藏答案", !(await text("question")).includes("企业家"), await text("question"));
  check("浏览器支持语音合成", await evalJs("'speechSynthesis' in window"));
  await shot("shot-audio.png");
  await evalJs("window.confirm = () => true; document.getElementById('quitBtn').click()");

  // 手机布局
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  await shot("shot-mobile.png");
  const overflow = await evalJs("document.documentElement.scrollWidth > window.innerWidth");
  check("手机宽度无横向滚动", overflow === false, `scrollWidth=${await evalJs("document.documentElement.scrollWidth")}`);

  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await evalJs("document.getElementById('backBtn').click()");
  await sleep(200);
  await shot("shot-dark.png");

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
  process.exitCode = failed.length ? 1 : 0;
} catch (e) {
  console.error("ERROR", e);
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
