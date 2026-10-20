"use strict";
const $ = id => document.getElementById(id);
let tabId, entries = [], selected, buffer = null, localName = "";
function status(text, error = false) { $("status").textContent = text; $("status").classList.toggle("error", error); }
function failure(e) { status(e.message || String(e), true); }
async function call(action, value) {
  if (!selected) throw new Error("请先打开课程视频并点击重新检测。");
  const results = await chrome.scripting.executeScript({target: {tabId, documentIds: [selected.documentId]}, func: (id, action, value) => {
    try { return {value: globalThis.NTUCaptionController.command(id, action, value)}; }
    catch (e) { return {error: e.message}; }
  }, args: [selected.id, action, value]});
  if (!results[0]?.result) throw new Error("播放器已刷新，请重新检测视频。");
  if (results[0].result.error) throw new Error(results[0].result.error);
  return results[0].result.value;
}
function showSelected() {
  selected = entries[Number($("video").value)];
  $("controls").disabled = !selected;
  if (!selected) return;
  $("filename").textContent = selected.name ? `${selected.name} · ${selected.count} 条字幕` : "尚未加载字幕";
  $("size").value = selected.size; $("sizeValue").textContent = `${selected.size} px`;
  $("offset").value = selected.offset; $("enabled").checked = selected.enabled;
  for (const option of [...$("rate").options]) if (option.dataset.custom) option.remove();
  if (![...$("rate").options].some(o => Number(o.value) === selected.rate)) {
    const option = new Option(`${selected.rate}×`, selected.rate); option.dataset.custom = "true"; $("rate").add(option);
  }
  $("rate").value = selected.rate;
}
async function refresh() {
  $("refresh").disabled = true;
  const old = selected;
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true}); tabId = tab.id;
    await chrome.scripting.executeScript({target: {tabId, allFrames: true}, files: ["srt.js", "content.js"]});
    const results = await chrome.scripting.executeScript({target: {tabId, allFrames: true}, func: () => globalThis.NTUCaptionController?.list() || []});
    entries = results.flatMap(r => (r.result || []).map(v => ({...v, frameId: r.frameId, documentId: r.documentId})));
    entries.sort((a, b) => Number(b.playing) - Number(a.playing) || b.width * b.height - a.width * a.height);
    $("video").replaceChildren();
    entries.forEach((v, i) => $("video").add(new Option(`视频 ${i + 1} · ${v.width}×${v.height}${v.playing ? " · 播放中" : ""}${v.frameId ? " · 嵌入" : ""}`, i)));
    const previous = entries.findIndex(v => v.documentId === old?.documentId && v.id === old?.id);
    if (previous >= 0) $("video").value = previous;
    showSelected();
    status(entries.length ? `已找到 ${entries.length} 个视频。字幕会随暂停、拖动和倍速同步。` : "未检测到视频。请开始播放后重新检测；也可尝试在新标签页打开播放器。跨域播放器需要对应站点访问权限。");
  } catch (e) { selected = null; $("controls").disabled = true; status(`无法访问播放器：${e.message}。请在普通 HTTPS 课程页面使用，并检查扩展的站点访问权限。`, true); }
  finally { $("refresh").disabled = false; }
}
async function upload() {
  if (!buffer) return;
  let encoding = $("encoding").value;
  if (encoding === "auto") {
    const bytes = new Uint8Array(buffer);
    encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  }
  const text = new TextDecoder(encoding).decode(buffer);
  if (text.includes("\uFFFD")) throw new Error("文件包含无法解码的字符，请切换文件编码后重试。");
  const result = await call("load", {text, name: localName, size: Number($("size").value), offset: Number($("offset").value) || 0});
  selected.name = localName; selected.count = result.count; selected.enabled = true;
  $("filename").textContent = `${localName} · ${result.count} 条字幕`; $("enabled").checked = true;
  status(`字幕已加载，共 ${result.count} 条${result.skipped ? `，跳过 ${result.skipped} 个无效段落` : ""}。`);
}
$("refresh").addEventListener("click", refresh);
$("video").addEventListener("change", () => { buffer = null; $("file").value = ""; showSelected(); });
$("file").addEventListener("change", async () => {
  try {
    const file = $("file").files[0]; if (!file) return;
    if (!/\.srt$/i.test(file.name)) throw new Error("请选择 .srt 文件。");
    if (file.size > 5 * 1024 * 1024) throw new Error("字幕文件不能超过 5 MB。");
    buffer = await file.arrayBuffer(); localName = file.name; await upload();
  } catch (e) { failure(e); }
});
$("encoding").addEventListener("change", () => upload().catch(failure));
let sizeQueue = Promise.resolve();
$("size").addEventListener("input", () => {
  const size = Number($("size").value); $("sizeValue").textContent = `${size} px`;
  sizeQueue = sizeQueue.then(async () => { await call("size", size); selected.size = size; await chrome.storage.local.set({size}); }).catch(failure);
});
for (const action of ["rate", "offset", "enabled"]) $(action).addEventListener("change", async () => {
  try {
    const value = action === "enabled" ? $(action).checked : Number($(action).value);
    if (action === "offset" && (!Number.isFinite(value) || Math.abs(value) > 3600)) throw new Error("时间偏移范围为 -3600 到 3600 秒。");
    const result = await call(action, value); Object.assign(selected, result);
    status(action === "rate" ? `播放速度已设为 ${result.rate}×，字幕自动同步。` : "字幕设置已更新。");
  } catch (e) { failure(e); }
});
$("clear").addEventListener("click", async () => {
  try { Object.assign(selected, await call("clear")); buffer = null; $("file").value = ""; showSelected(); status("已清除本地字幕。"); } catch (e) { failure(e); }
});
(async () => {
  await refresh();
  const prefs = await chrome.storage.local.get("size");
  if (selected && !selected.name && prefs.size) { $("size").value = prefs.size; $("sizeValue").textContent = `${prefs.size} px`; }
})().catch(failure);
