(() => {
  "use strict";
  if (globalThis.NTUCaptionController) return;
  const states = new WeakMap();
  const ids = new WeakMap();
  let sequence = 0;
  let desiredRate = null;
  const rateListeners = new WeakSet();
  function videos(root = document) {
    const result = [...root.querySelectorAll("video")];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) result.push(...videos(el.shadowRoot));
    }
    return result;
  }
  function id(video) {
    if (!ids.has(video)) ids.set(video, String(++sequence));
    return ids.get(video);
  }
  function state(video) {
    if (!states.has(video)) states.set(video, {track: null, cues: [], name: "", size: 26, offset: 0, enabled: true, previous: []});
    return states.get(video);
  }
  function render(video, s) {
    if (!s.track) s.track = video.addTextTrack("subtitles", "本地 SRT · NTULearn", "");
    s.track.mode = "hidden";
    for (const cue of Array.from(s.track.cues || [])) s.track.removeCue(cue);
    for (const cue of NTUSrt.shifted(s.cues, s.offset)) {
      const nativeCue = new VTTCue(cue.start, cue.end, cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
      nativeCue.line = -3;
      s.track.addCue(nativeCue);
    }
    s.track.mode = s.enabled ? "showing" : "disabled";
  }
  function style(video, s) {
    video.setAttribute("data-ntu-caption", id(video));
    const root = video.getRootNode();
    if (!s.style || s.style.getRootNode() !== root) {
      s.style?.remove();
      s.style = document.createElement("style");
      (root === document ? document.documentElement : root).append(s.style);
    }
    s.style.textContent = `video[data-ntu-caption="${id(video)}"]::cue { font-size: ${s.size}px; color: white; background-color: rgba(0,0,0,.78); font-family: system-ui, sans-serif; }`;
  }
  function applyRate(media) {
    if (!rateListeners.has(media)) {
      rateListeners.add(media);
      media.addEventListener("loadedmetadata", () => { if (desiredRate !== null) media.playbackRate = desiredRate; });
      // If the platform changes its speed, accept that choice and report it in the popup.
      media.addEventListener("ratechange", () => { desiredRate = media.playbackRate; });
    }
    if (desiredRate !== null && media.playbackRate !== desiredRate) media.playbackRate = desiredRate;
  }
  function list() {
    return videos().map(video => {
      const s = state(video), r = video.getBoundingClientRect();
      return {id: id(video), width: Math.round(r.width), height: Math.round(r.height), playing: !video.paused, time: video.currentTime, rate: video.playbackRate, name: s.name, count: s.cues.length, size: s.size, offset: s.offset, enabled: s.enabled};
    });
  }
  function command(videoId, action, value) {
    const video = videos().find(v => id(v) === videoId);
    if (!video) throw new Error("视频已更换，请重新检测后导入字幕。");
    const s = state(video);
    if (action === "load") {
      const parsed = NTUSrt.parse(value.text);
      if (!parsed.cues.length) throw new Error("没有找到有效的 SRT 时间轴，请检查文件或编码。");
      if (!s.cues.length) {
        s.previous = Array.from(video.textTracks).filter(t => t !== s.track && t.mode === "showing");
        for (const track of s.previous) track.mode = "disabled";
      }
      s.cues = parsed.cues; s.name = value.name; s.enabled = true;
      s.size = value.size; s.offset = value.offset;
      render(video, s); style(video, s);
      return {count: s.cues.length, skipped: parsed.skipped};
    }
    if (action === "size") { s.size = Math.min(72, Math.max(12, Number(value) || 26)); style(video, s); }
    if (action === "offset") { s.offset = Math.min(3600, Math.max(-3600, Number(value) || 0)); if (s.cues.length) render(video, s); }
    if (action === "enabled") { s.enabled = Boolean(value); if (s.track) s.track.mode = s.enabled ? "showing" : "disabled"; }
    if (action === "clear") {
      if (s.track) { s.track.mode = "disabled"; for (const cue of Array.from(s.track.cues || [])) s.track.removeCue(cue); }
      for (const track of s.previous) track.mode = "showing";
      s.previous = []; s.cues = []; s.name = ""; s.style?.remove(); video.removeAttribute("data-ntu-caption");
    }
    if (action === "rate") {
      desiredRate = Math.min(4, Math.max(0.25, Number(value) || 1));
      for (const media of [...videos(), ...document.querySelectorAll("audio")]) applyRate(media);
    }
    return list().find(v => v.id === videoId);
  }
  // A low frequency check discovers replacement media without observing every DOM mutation.
  setInterval(() => {
    if (desiredRate === null) return;
    for (const media of [...videos(), ...document.querySelectorAll("audio")]) {
      if (!rateListeners.has(media)) applyRate(media);
    }
  }, 1500);
  globalThis.NTUCaptionController = {list, command};
})();
