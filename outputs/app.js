const sourceText = document.querySelector("#sourceText");
const sentenceList = document.querySelector("#sentenceList");
const sentenceTemplate = document.querySelector("#sentenceTemplate");
const emptyState = document.querySelector("#emptyState");
const sentenceCount = document.querySelector("#sentenceCount");
const voiceCount = document.querySelector("#voiceCount");
const doneCount = document.querySelector("#doneCount");
const voiceStatus = document.querySelector("#voiceStatus");
const splitButton = document.querySelector("#splitButton");
const clearButton = document.querySelector("#clearButton");
const loadSampleButton = document.querySelector("#loadSampleButton");
const autoSplitToggle = document.querySelector("#autoSplitToggle");
const playAllButton = document.querySelector("#playAllButton");
const stopButton = document.querySelector("#stopButton");
const globalVoice = document.querySelector("#globalVoice");
const saveDefaultVoiceButton = document.querySelector("#saveDefaultVoiceButton");
const defaultVoiceStatus = document.querySelector("#defaultVoiceStatus");
const globalRate = document.querySelector("#globalRate");
const globalRateValue = document.querySelector("#globalRateValue");
const saveDefaultRateButton = document.querySelector("#saveDefaultRateButton");
const defaultRateStatus = document.querySelector("#defaultRateStatus");
const globalRepeat = document.querySelector("#globalRepeat");
const applyDefaultsButton = document.querySelector("#applyDefaultsButton");
const shadowPlayButton = document.querySelector("#shadowPlayButton");
const shadowStatus = document.querySelector("#shadowStatus");
const shadowSummary = document.querySelector("#shadowSummary");
const shadowSegments = document.querySelector("#shadowSegments");

const sampleText = `I used to think fluency meant speaking quickly. Then I noticed that clear speakers pause often, stress important words, and let each sentence breathe. If you practice one sentence at a time, your pronunciation becomes more natural.`;
const defaultVoiceStorageKey = "sentenceReactorDefaultKokoroVoice";
const defaultRateStorageKey = "sentenceReactorDefaultRate";

const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart · clear American tutor" },
  { id: "af_bella", label: "Bella · warm American" },
  { id: "af_nicole", label: "Nicole · calm American" },
  { id: "af_aoede", label: "Aoede · expressive American" },
  { id: "af_kore", label: "Kore · crisp American" },
  { id: "af_sarah", label: "Sarah · natural American" },
  { id: "af_nova", label: "Nova · bright American" },
  { id: "af_sky", label: "Sky · light American" },
  { id: "af_alloy", label: "Alloy · balanced American" },
  { id: "af_jessica", label: "Jessica · polished American" },
  { id: "af_river", label: "River · conversational American" },
  { id: "am_michael", label: "Michael · clear American male" },
  { id: "am_adam", label: "Adam · steady American male" },
  { id: "am_fenrir", label: "Fenrir · energetic American male" },
  { id: "am_puck", label: "Puck · lively American male" },
  { id: "am_echo", label: "Echo · smooth American male" },
  { id: "am_eric", label: "Eric · neutral American male" },
  { id: "am_liam", label: "Liam · relaxed American male" },
  { id: "am_onyx", label: "Onyx · deep American male" }
];

let sentences = [];
let settings = [];
let activeIndex = -1;
let queueMode = false;
let debounceTimer = null;
let currentAudio = null;
let currentAbort = null;
let currentPlaybackResolve = null;
let isPlaying = false;
let isPreparingPlayback = false;
let isPaused = false;
let kokoroAvailable = false;
let playbackToken = 0;
let preloadRunId = 0;
let preloadTimer = null;
let shadowChunks = [];
let shadowPlaying = false;
const preloadConcurrency = 2;

const audioCache = new Map();
const audioPromises = new Map();
const audioFailures = new Set();

const abbreviations = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "u.s",
  "u.k",
  "a.m",
  "p.m"
]);

const weakWords = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "for",
  "from",
  "and",
  "or",
  "but",
  "as",
  "at",
  "in",
  "on",
  "with",
  "by",
  "that",
  "this",
  "it",
  "its",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "would",
  "should",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "our",
  "their"
]);

const pauseBeforeWords = new Set(["but", "so", "because", "when", "if", "although", "though"]);
const semanticBreakWords = new Set([
  "after",
  "although",
  "and",
  "as",
  "because",
  "before",
  "but",
  "even",
  "however",
  "if",
  "once",
  "since",
  "so",
  "that",
  "then",
  "though",
  "unless",
  "until",
  "when",
  "where",
  "which",
  "while",
  "who",
  "yet"
]);
const yesNoQuestionStarters = new Set([
  "am",
  "are",
  "is",
  "was",
  "were",
  "do",
  "does",
  "did",
  "can",
  "could",
  "will",
  "would",
  "should",
  "have",
  "has",
  "had",
  "may",
  "might"
]);

function normalizeText(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isWord(token) {
  return /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(token);
}

function startsWithVowelSound(word) {
  return /^[aeiou]/i.test(word) || /^honest|^hour|^honor/i.test(word);
}

function endsWithLinkableSound(word) {
  return /[bcdfghjklmnpqrstvwxyzr]$/i.test(word);
}

function getIntonation(sentence, words) {
  const clean = sentence.trim();
  const first = words[0]?.toLowerCase() || "";

  if (clean.endsWith("?")) {
    return yesNoQuestionStarters.has(first) ? "↑" : "↓";
  }

  if (/,\s*$/.test(clean) || /\b(if|when|because|although|though)\b/i.test(clean)) {
    return "↗";
  }

  return "↓";
}

function getStressIndices(tokens) {
  const candidates = tokens
    .map((token, index) => {
      const lower = token.toLowerCase();
      if (!isWord(token) || weakWords.has(lower) || token.length < 4) return null;

      let score = token.length;
      if (/ly$|ing$|ed$|ful$|less$|able$|ive$|ous$|al$|ic$/i.test(token)) score += 2;
      if (index > tokens.length * 0.55) score += 1;
      return { index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(2, Math.min(5, Math.ceil(tokens.length / 8))));

  return new Set(candidates.map((candidate) => candidate.index));
}

function buildProsodyMarkup(sentence) {
  const tokens = sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+|[.,;:!?—-]|["“”‘’()]/g) || [];
  const words = tokens.filter(isWord);
  const stressIndices = getStressIndices(tokens);
  const intonation = getIntonation(sentence, words);
  let wordCount = 0;

  const parts = tokens.map((token, index) => {
    const lower = token.toLowerCase();
    const previousWord = [...tokens.slice(0, index)].reverse().find(isWord);
    const nextWord = tokens.slice(index + 1).find(isWord);
    const previousToken = tokens[index - 1] || "";
    const nextToken = tokens[index + 1] || "";

    if (/^[.,;:!?—-]$/.test(token)) {
      const pause = /^[,;:—-]$/.test(token) ? `<span class="prosody-pause">/</span>` : "";
      const spaceAfterPause = pause && nextToken ? " " : "";
      return `<span class="prosody-punct">${escapeHtml(token)}</span>${pause}${spaceAfterPause}`;
    }

    if (!isWord(token)) return `<span class="prosody-punct">${escapeHtml(token)}</span>`;

    wordCount += 1;
    const classes = ["prosody-word"];
    if (stressIndices.has(index)) classes.push("is-stress");
    if (weakWords.has(lower)) classes.push("is-weak");

    const shouldPauseBefore = wordCount > 4
      && pauseBeforeWords.has(lower)
      && !/^[,;:—-]$/.test(previousToken);
    const pauseBefore = shouldPauseBefore ? `<span class="prosody-pause">/</span>` : "";
    const linkAfter = /^[,;:!?—-]$/.test(nextToken)
      ? ""
      : nextWord && endsWithLinkableSound(token) && startsWithVowelSound(nextWord)
        ? `<span class="prosody-link">‿</span>`
        : " ";

    return `${pauseBefore}<span class="${classes.join(" ")}">${escapeHtml(token)}</span>${linkAfter}`;
  });

  const line = parts
    .join("")
    .replace(/ <span class="prosody-punct">([.,;:!?])/g, `<span class="prosody-punct">$1`)
    .trim();

  return `${line}<span class="prosody-intonation">${intonation}</span>`;
}

function splitIntoSentences(text) {
  const clean = normalizeText(text);
  if (!clean) return [];

  if ("Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const segmented = Array.from(segmenter.segment(clean), (part) => part.segment.trim());
    const useful = segmented.filter(Boolean);
    if (useful.length > 1) return useful;
  }

  const output = [];
  let start = 0;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (!/[.!?]/.test(char)) continue;

    const previousWord = clean
      .slice(Math.max(0, start), index)
      .split(/\s+/)
      .pop()
      ?.replace(/[^a-z.]/gi, "")
      .toLowerCase();

    const next = clean[index + 1] || "";
    const afterNext = clean[index + 2] || "";
    const isDecimal = /\d/.test(clean[index - 1] || "") && /\d/.test(next);
    const isAbbreviation = previousWord && abbreviations.has(previousWord.replace(/\.$/, ""));
    const isSentenceEnd = /["')\]]?\s/.test(`${next}${afterNext}`) || index === clean.length - 1;

    if (isDecimal || isAbbreviation || !isSentenceEnd) continue;

    output.push(clean.slice(start, index + 1).trim());
    start = index + 1;
  }

  const tail = clean.slice(start).trim();
  if (tail) output.push(tail);
  return output;
}

function getDefaultSettings(index) {
  return {
    voice: globalVoice.value || KOKORO_VOICES[index % KOKORO_VOICES.length].id,
    rate: Number(globalRate.value),
    repeat: Number(globalRepeat.value),
    done: false
  };
}

function preserveSettings(nextSentences) {
  const previousByText = new Map(sentences.map((sentence, index) => [sentence, settings[index]]));
  return nextSentences.map((sentence, index) => {
    const previous = previousByText.get(sentence);
    return previous ? { ...previous } : getDefaultSettings(index);
  });
}

function updateVoiceStatus(text) {
  if (text) {
    voiceStatus.textContent = text;
    return;
  }

  voiceStatus.textContent = kokoroAvailable
    ? "Kokoro TTS 已就绪"
    : "请用本地 server 打开页面以启用 Kokoro TTS";
}

function updateStats() {
  sentenceCount.textContent = String(sentences.length);
  voiceCount.textContent = String(KOKORO_VOICES.length);
  doneCount.textContent = String(settings.filter((item) => item.done).length);
  emptyState.hidden = sentences.length > 0;
}

function renderVoiceOptions(select, selectedVoice) {
  select.innerHTML = "";

  KOKORO_VOICES.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.label;
    select.append(option);
  });

  select.value = selectedVoice && KOKORO_VOICES.some((voice) => voice.id === selectedVoice)
    ? selectedVoice
    : KOKORO_VOICES[0].id;
}

function populateGlobalVoiceOptions() {
  const savedVoice = localStorage.getItem(defaultVoiceStorageKey);
  const selectedVoice = KOKORO_VOICES.some((voice) => voice.id === savedVoice)
    ? savedVoice
    : KOKORO_VOICES[0].id;

  renderVoiceOptions(globalVoice, selectedVoice);
  updateDefaultVoiceStatus();
}

function hydrateDefaultRate() {
  const savedRate = Number(localStorage.getItem(defaultRateStorageKey));
  const min = Number(globalRate.min);
  const max = Number(globalRate.max);
  if (!Number.isFinite(savedRate) || savedRate < min || savedRate > max) {
    localStorage.removeItem(defaultRateStorageKey);
    updateDefaultRateStatus();
    return;
  }

  globalRate.value = String(savedRate);
  globalRateValue.value = `${savedRate.toFixed(2)}x`;
  updateDefaultRateStatus();
}

function getVoiceLabel(voiceId) {
  return KOKORO_VOICES.find((voice) => voice.id === voiceId)?.label || voiceId;
}

function updateDefaultVoiceStatus(saved = false) {
  const savedVoice = localStorage.getItem(defaultVoiceStorageKey);
  if (!savedVoice) {
    defaultVoiceStatus.textContent = "未设置默认声音";
    return;
  }

  defaultVoiceStatus.textContent = saved
    ? `已保存默认：${getVoiceLabel(savedVoice)}`
    : `默认：${getVoiceLabel(savedVoice)}`;
}

function updateDefaultRateStatus(saved = false) {
  const savedRate = Number(localStorage.getItem(defaultRateStorageKey));
  const min = Number(globalRate.min);
  const max = Number(globalRate.max);
  if (!Number.isFinite(savedRate) || savedRate < min || savedRate > max) {
    localStorage.removeItem(defaultRateStorageKey);
    defaultRateStatus.textContent = "未设置默认速度";
    return;
  }

  defaultRateStatus.textContent = saved
    ? `已保存默认：${savedRate.toFixed(2)}x`
    : `默认：${savedRate.toFixed(2)}x`;
}

function getWordCount(text) {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
}

function cleanWord(word) {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function joinChunks(left, right) {
  return `${left.trim()} ${right.trim()}`.replace(/\s+([,.;:!?])/g, "$1").trim();
}

function splitAtNaturalPauses(sentence) {
  const matches = sentence.match(/[^,，;:—]+[,，;:—]?/g);
  if (!matches) return [sentence.trim()].filter(Boolean);
  return matches.map((part) => part.trim()).filter(Boolean);
}

function chooseSemanticBreak(words) {
  const count = words.length;
  if (count <= 16) return -1;

  const firstWord = cleanWord(words[0] || "");
  const isOpeningClause = ["if", "when", "although", "though", "because", "since", "while", "once", "unless"].includes(firstWord);
  const target = count > 20 ? 11 : Math.round(count / 2);
  let best = { index: -1, score: -Infinity };

  words.forEach((word, index) => {
    if (index < 7 || index > count - 5) return;
    const clean = cleanWord(word);
    let score = -Math.abs(index - target);

    if (isOpeningClause && ["and", "or"].includes(clean)) score -= 8;
    if (semanticBreakWords.has(clean)) score += 7;
    if (pauseBeforeWords.has(clean)) score += 3;
    if (["and", "but", "so", "because", "when", "if", "which", "that"].includes(clean)) score += 2;
    if (/[,，;:—]$/.test(words[index - 1] || "")) score += 4;

    if (score > best.score) best = { index, score };
  });

  return best.index;
}

function splitLongNativeChunk(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 16) return [text.trim()];

  const breakIndex = chooseSemanticBreak(words);
  const fallbackIndex = words.length > 21 ? 11 : Math.round(words.length / 2);
  const index = breakIndex > -1 ? breakIndex : fallbackIndex;
  const left = words.slice(0, index).join(" ");
  const right = words.slice(index).join(" ");

  return [
    ...splitLongNativeChunk(left),
    ...splitLongNativeChunk(right)
  ];
}

function mergeTinyChunks(chunks) {
  const merged = [];

  chunks.forEach((chunk) => {
    if (!chunk) return;
    const wordCount = getWordCount(chunk);
    const previous = merged[merged.length - 1];

    if (previous && (wordCount <= 3 || getWordCount(previous) <= 3)) {
      merged[merged.length - 1] = joinChunks(previous, chunk);
      return;
    }

    merged.push(chunk);
  });

  if (merged.length > 1 && getWordCount(merged[merged.length - 1]) <= 3) {
    const tail = merged.pop();
    merged[merged.length - 1] = joinChunks(merged[merged.length - 1], tail);
  }

  return merged;
}

function splitIntoShadowChunks(text) {
  const baseSentences = splitIntoSentences(text);
  const chunks = [];

  baseSentences.forEach((sentence) => {
    const naturalPauseChunks = splitAtNaturalPauses(sentence);
    const balancedChunks = naturalPauseChunks.flatMap(splitLongNativeChunk);
    mergeTinyChunks(balancedChunks).forEach((chunk) => chunks.push(chunk));
  });

  return chunks;
}

function getShadowParagraphs(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : [text.trim()].filter(Boolean);
}

function renderShadowPractice() {
  const paragraphs = getShadowParagraphs(sourceText.value);
  shadowChunks = [];
  shadowSegments.innerHTML = "";

  const paragraphChunks = paragraphs.map((paragraph) => {
    const chunks = splitIntoShadowChunks(paragraph);
    shadowChunks.push(...chunks);
    return chunks;
  });

  shadowSummary.textContent = shadowChunks.length ? `${shadowChunks.length} 个跟读停顿` : "等待文本";
  shadowPlayButton.disabled = !shadowChunks.length || !canRequestSpeech();

  if (!shadowChunks.length) {
    shadowStatus.textContent = "输入文本后会自动拆成自然语块。";
    return;
  }

  let chunkIndex = 0;
  paragraphChunks.forEach((chunks) => {
    const paragraph = document.createElement("p");
    paragraph.className = "shadow-paragraph";

    chunks.forEach((chunk, index) => {
      const span = document.createElement("span");
      span.className = "shadow-chunk";
      span.dataset.index = String(chunkIndex);
      span.innerHTML = buildProsodyMarkup(chunk);
      paragraph.append(span);
      if (index < chunks.length - 1) paragraph.append(" ");
      chunkIndex += 1;
    });

    shadowSegments.append(paragraph);
  });

  shadowStatus.textContent = "准备好了。点击后会按语义和自然停顿，一段段读给你跟。";
}

function setActiveShadowSegment(index) {
  document.querySelectorAll(".shadow-chunk").forEach((segment) => {
    segment.classList.toggle("is-active", Number(segment.dataset.index) === index);
  });
}

function renderSentences() {
  sentenceList.innerHTML = "";
  updateStats();

  sentences.forEach((sentence, index) => {
    const fragment = sentenceTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".sentence-card");
    const playButton = fragment.querySelector(".play-sentence");
    const doneToggle = fragment.querySelector(".done-toggle");
    const rateInput = fragment.querySelector(".rate-input");
    const repeatInput = fragment.querySelector(".repeat-input");
    const audioState = fragment.querySelector(".audio-state");
    const prosodyLine = fragment.querySelector(".prosody-line");

    card.dataset.index = String(index);
    card.classList.toggle("is-active", index === activeIndex);
    card.classList.toggle("is-done", settings[index].done);
    fragment.querySelector(".sentence-index").textContent = `Sentence ${index + 1}`;
    fragment.querySelector(".sentence-text").textContent = sentence;
    prosodyLine.innerHTML = buildProsodyMarkup(sentence);

    settings[index].voice = settings[index].voice || globalVoice.value;
    audioState.dataset.index = String(index);
    playButton.disabled = !canRequestSpeech();

    rateInput.value = String(settings[index].rate);
    repeatInput.value = String(settings[index].repeat);
    doneToggle.classList.toggle("is-on", settings[index].done);
    doneToggle.textContent = settings[index].done ? "已练过" : "标记已练";

    playButton.addEventListener("click", () => playSentence(index));
    doneToggle.addEventListener("click", () => {
      settings[index].done = !settings[index].done;
      renderSentences();
    });
    rateInput.addEventListener("change", () => {
      clearAudioCacheForSentence(index);
      settings[index].rate = Number(rateInput.value);
      updateSentenceAudioStates();
      schedulePreloadAll(700);
    });
    repeatInput.addEventListener("input", () => {
      settings[index].repeat = clamp(Number(repeatInput.value) || 1, 1, 5);
      repeatInput.value = String(settings[index].repeat);
    });

    sentenceList.append(fragment);
  });

  updateButtonStates();
  updateSentenceAudioStates();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function refreshSentences() {
  const next = splitIntoSentences(sourceText.value);
  settings = preserveSettings(next);
  sentences = next;
  stopPlayback();
  renderSentences();
  renderShadowPractice();
  schedulePreloadAll();
}

function setActive(index, options = {}) {
  activeIndex = index;
  document.querySelectorAll(".sentence-card").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.index) === index);
  });

  if (options.scroll) {
    const activeCard = document.querySelector(`.sentence-card[data-index="${index}"]`);
    activeCard?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function getAudioCacheKey(index) {
  const sentenceSettings = settings[index];
  return JSON.stringify({
    engine: "kokoro",
    voice: sentenceSettings.voice,
    speed: sentenceSettings.rate,
    input: sentences[index]
  });
}

function getTextAudioCacheKey(input, voice, rate) {
  return JSON.stringify({
    engine: "kokoro",
    voice,
    speed: rate,
    input
  });
}

function getAudioStatus(index) {
  const key = getAudioCacheKey(index);
  if (audioCache.has(key)) return "ready";
  if (audioPromises.has(key)) return "loading";
  if (audioFailures.has(key)) return "error";
  return "idle";
}

function updateSentenceAudioStates() {
  document.querySelectorAll(".sentence-card").forEach((card) => {
    const index = Number(card.dataset.index);
    const state = card.querySelector(".audio-state");
    const playButton = card.querySelector(".play-sentence");
    const icon = playButton?.querySelector("span");
    const status = getAudioStatus(index);

    if (state) {
      state.className = `audio-state is-${status}`;
      state.textContent = {
        idle: "待缓存",
        loading: "生成中",
        ready: "已缓存",
        error: "缓存失败"
      }[status];
    }

    if (icon && index === activeIndex && isPreparingPlayback) {
      icon.textContent = "…";
      playButton.setAttribute("aria-label", "正在准备此句");
    } else if (icon && index === activeIndex && isPlaying) {
      icon.textContent = isPaused ? "▶" : "⏸";
      playButton.setAttribute("aria-label", isPaused ? "继续播放此句" : "暂停此句");
    } else if (icon) {
      icon.textContent = "▶";
      playButton.setAttribute("aria-label", "播放此句");
    }
  });
}

async function getSpeechUrl(index, options = {}) {
  const cacheKey = getAudioCacheKey(index);
  return getSpeechUrlForText(sentences[index], settings[index].voice, settings[index].rate, cacheKey, options);
}

async function getSpeechUrlForText(input, voice, rate, cacheKey = getTextAudioCacheKey(input, voice, rate), options = {}) {
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;
  if (audioPromises.has(cacheKey)) return audioPromises.get(cacheKey);

  if (!canRequestSpeech()) throw new Error("Kokoro TTS 还没有连接成功，请刷新页面或确认本地 server 正在运行。");

  const request = (async () => {
    const body = {
      input,
      voice,
      speed: clamp(Number(rate) || 1, 0.5, 2)
    };

    const controller = new AbortController();
    if (!options.background) {
      currentAbort = controller;
      updateVoiceStatus(options.statusText || "Kokoro 正在生成音频…");
    }

    audioFailures.delete(cacheKey);
    updateSentenceAudioStates();

    const response = await fetch("./api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const error = await response.json();
        message = error.error?.message || error.message || message;
      } catch {
        // Keep the HTTP status when the response is not JSON.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    audioCache.set(cacheKey, audioUrl);
    return audioUrl;
  })();

  audioPromises.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    if (error.name !== "AbortError") audioFailures.add(cacheKey);
    throw error;
  } finally {
    audioPromises.delete(cacheKey);
    updateSentenceAudioStates();
  }
}

function playAudioUrl(audioUrl, token) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      currentPlaybackResolve = null;
      resolve();
    };
    const fail = (error) => {
      currentPlaybackResolve = null;
      reject(error);
    };

    currentPlaybackResolve = resolve;
    currentAudio = new Audio(audioUrl);
    isPreparingPlayback = false;
    isPlaying = true;
    isPaused = false;
    updateButtonStates();
    currentAudio.onended = finish;
    currentAudio.onerror = () => fail(new Error("音频播放失败"));
    currentAudio
      .play()
      .then(() => {
        if (token === playbackToken) {
          isPaused = false;
          updateButtonStates();
        }
      })
      .catch(fail);
    if (token !== playbackToken) finish();
  });
}

async function speakOnce(index, token) {
  const audioUrl = await getSpeechUrl(index);
  if (token !== playbackToken) return;
  updateVoiceStatus(`正在播放第 ${index + 1} 句`);
  await playAudioUrl(audioUrl, token);
}

async function playSentence(index, continueQueue = false) {
  if (!sentences[index]) return;

  if (index === activeIndex && isPreparingPlayback) {
    stopPlayback();
    return;
  }

  if (index === activeIndex && currentAudio && isPlaying) {
    toggleCurrentPlayback();
    return;
  }

  stopPlayback({ keepActive: true });
  const token = ++playbackToken;
  queueMode = continueQueue;
  isPreparingPlayback = true;
  isPlaying = false;
  isPaused = false;
  setActive(index, { scroll: continueQueue });
  updateButtonStates();

  try {
    const times = clamp(Number(settings[index].repeat) || 1, 1, 5);
    for (let count = 0; count < times; count += 1) {
      if (activeIndex !== index || token !== playbackToken) return;
      await speakOnce(index, token);
      if (token !== playbackToken) return;
      await pause(continueQueue ? 380 : 140);
    }

    settings[index].done = true;
    updateStats();

    if (continueQueue && index + 1 < sentences.length) {
      isPlaying = false;
      isPreparingPlayback = false;
      currentAudio = null;
      await playSentence(index + 1, true);
    } else {
      queueMode = false;
      setActive(-1);
      updateVoiceStatus();
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      updateVoiceStatus(`播放失败：${error.message}`);
    }
    queueMode = false;
    currentAudio = null;
    isPreparingPlayback = false;
    setActive(-1);
  } finally {
    if (activeIndex === index || !queueMode) {
      isPlaying = false;
      isPreparingPlayback = false;
      isPaused = false;
      updateButtonStates();
    }
  }
}

function estimateShadowPause(chunk, audioDuration) {
  if (Number.isFinite(audioDuration) && audioDuration > 0) {
    return audioDuration * 1000;
  }

  const wordCount = (chunk.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
  return clamp(wordCount * 0.42, 1.2, 8.5) * 1000;
}

async function playShadowPractice() {
  if (shadowPlaying || isPlaying || isPreparingPlayback) {
    stopPlayback();
    shadowPlaying = false;
    setActiveShadowSegment(-1);
    shadowPlayButton.innerHTML = `<span aria-hidden="true">▶</span> 开始整段跟读`;
    shadowStatus.textContent = "已停止整段跟读。";
    return;
  }

  if (!shadowChunks.length) return;

  stopPlayback();
  const token = ++playbackToken;
  shadowPlaying = true;
  shadowPlayButton.innerHTML = `<span aria-hidden="true">■</span> 停止整段跟读`;
  updateButtonStates();

  try {
    for (let index = 0; index < shadowChunks.length; index += 1) {
      if (token !== playbackToken) return;

      const chunk = shadowChunks[index];
      setActiveShadowSegment(index);
      shadowStatus.textContent = `播放语块 ${index + 1}/${shadowChunks.length}`;
      const url = await getSpeechUrlForText(
        chunk,
        globalVoice.value,
        Number(globalRate.value),
        undefined,
        { statusText: `Kokoro 正在生成语块 ${index + 1}/${shadowChunks.length}…` }
      );

      if (token !== playbackToken) return;
      await playAudioUrl(url, token);

      const duration = currentAudio?.duration || 0;
      currentAudio = null;
      isPlaying = false;
      if (token !== playbackToken) return;

      const waitMs = estimateShadowPause(chunk, duration);
      shadowStatus.textContent = `跟读时间 ${Math.round(waitMs / 1000)} 秒…`;
      updateButtonStates();
      await pause(waitMs);
    }

    shadowStatus.textContent = "整段影子跟读完成。";
  } catch (error) {
    if (error.name !== "AbortError") {
      shadowStatus.textContent = `整段跟读失败：${error.message}`;
    }
  } finally {
    shadowPlaying = false;
    isPlaying = false;
    isPreparingPlayback = false;
    setActiveShadowSegment(-1);
    shadowPlayButton.innerHTML = `<span aria-hidden="true">▶</span> 开始整段跟读`;
    updateButtonStates();
  }
}

function toggleCurrentPlayback() {
  if (!currentAudio) return;

  if (currentAudio.paused) {
    currentAudio.play();
    isPaused = false;
    updateVoiceStatus(`继续播放第 ${activeIndex + 1} 句`);
  } else {
    currentAudio.pause();
    isPaused = true;
    updateVoiceStatus(`已暂停第 ${activeIndex + 1} 句`);
  }

  updateButtonStates();
}

function pause(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stopPlayback(options = {}) {
  playbackToken += 1;
  queueMode = false;
  isPreparingPlayback = false;
  isPlaying = false;
  isPaused = false;

  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  if (currentPlaybackResolve) {
    currentPlaybackResolve();
    currentPlaybackResolve = null;
  }

  if (!options.keepActive) setActive(-1);
  updateVoiceStatus();
  updateButtonStates();
}

function updateButtonStates() {
  playAllButton.disabled = !sentences.length || !canRequestSpeech() || isPlaying || isPreparingPlayback;
  stopButton.disabled = !isPlaying && !isPreparingPlayback && activeIndex < 0;
  splitButton.disabled = !sourceText.value.trim();

  document.querySelectorAll(".play-sentence").forEach((button) => {
    button.disabled = !canRequestSpeech();
  });

  shadowPlayButton.disabled = !shadowChunks.length || !canRequestSpeech();
  updateSentenceAudioStates();
}

function canRequestSpeech() {
  return kokoroAvailable || ["http:", "https:"].includes(window.location.protocol);
}

function applyGlobalDefaults() {
  const voice = globalVoice.value;
  const rate = Number(globalRate.value);
  const repeat = clamp(Number(globalRepeat.value) || 1, 1, 5);

  settings = settings.map((item, index) => ({
    ...item,
    voice,
    rate,
    repeat
  }));

  audioCache.clear();
  audioFailures.clear();
  renderSentences();
  schedulePreloadAll();
}

sourceText.addEventListener("input", () => {
  updateButtonStates();
  if (!autoSplitToggle.checked) return;
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(refreshSentences, 260);
});

splitButton.addEventListener("click", refreshSentences);

clearButton.addEventListener("click", () => {
  stopPlayback();
  sourceText.value = "";
  sentences = [];
  settings = [];
  renderSentences();
  renderShadowPractice();
  sourceText.focus();
});

loadSampleButton.addEventListener("click", () => {
  sourceText.value = sampleText;
  refreshSentences();
});

playAllButton.addEventListener("click", () => {
  if (!sentences.length) return;
  playSentence(activeIndex >= 0 ? activeIndex : 0, true);
});

stopButton.addEventListener("click", () => {
  stopPlayback();
});

globalVoice.addEventListener("change", () => {
  settings = settings.map((item) => ({
    ...item,
    voice: globalVoice.value
  }));
  audioCache.clear();
  audioFailures.clear();
  renderSentences();
  schedulePreloadAll();
});

saveDefaultVoiceButton.addEventListener("click", () => {
  localStorage.setItem(defaultVoiceStorageKey, globalVoice.value);
  updateDefaultVoiceStatus(true);
});

globalRate.addEventListener("input", () => {
  globalRateValue.value = `${Number(globalRate.value).toFixed(2)}x`;
});

saveDefaultRateButton.addEventListener("click", () => {
  const rate = Number(globalRate.value);
  localStorage.setItem(defaultRateStorageKey, String(rate));
  updateDefaultRateStatus(true);
});

globalRepeat.addEventListener("input", () => {
  globalRepeat.value = String(clamp(Number(globalRepeat.value) || 1, 1, 5));
});

applyDefaultsButton.addEventListener("click", applyGlobalDefaults);

shadowPlayButton.addEventListener("click", playShadowPractice);

async function detectKokoroProxy() {
  if (!["http:", "https:"].includes(window.location.protocol)) {
    updateVoiceStatus("请通过本地 server 打开页面，直接打开 HTML 无法调用 Kokoro。");
    updateButtonStates();
    return;
  }

  try {
    const response = await fetch("./api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("health check failed");
    const data = await response.json();
    kokoroAvailable = Boolean(data.available && data.provider === "kokoro");
  } catch {
    kokoroAvailable = false;
  } finally {
    updateVoiceStatus();
    updateButtonStates();
    schedulePreloadAll();
  }
}

function schedulePreloadAll(delay = 250) {
  preloadRunId += 1;
  window.clearTimeout(preloadTimer);
  preloadTimer = window.setTimeout(() => preloadAllSentences(), delay);
}

async function preloadAllSentences() {
  const runId = ++preloadRunId;
  if (!canRequestSpeech() || !sentences.length) return;

  let readyCount = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < sentences.length && runId === preloadRunId) {
      const index = cursor;
      cursor += 1;

      if (getAudioStatus(index) === "ready") {
        readyCount += 1;
        continue;
      }

      updateVoiceStatus(`后台预加载 ${index + 1}/${sentences.length}…`);
      try {
        await getSpeechUrl(index, { background: true });
        readyCount += 1;
      } catch {
        // Keep preloading the rest even if one sentence fails.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(preloadConcurrency, sentences.length) }, () => worker())
  );

  if (runId === preloadRunId) {
    updateVoiceStatus(`已预加载 ${readyCount}/${sentences.length} 句`);
  }
}

function clearAudioCacheForSentence(index) {
  const oldKey = getAudioCacheKey(index);
  audioCache.delete(oldKey);
  audioFailures.delete(oldKey);
}

populateGlobalVoiceOptions();
hydrateDefaultRate();
updateStats();
updateVoiceStatus();
renderSentences();
renderShadowPractice();
detectKokoroProxy();
