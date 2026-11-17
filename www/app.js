/**
 * 《延世韩国语 1》交互式学习工作台 - 核心逻辑 (ES6)
 * 支持动态课程扩展：只需向 LESSONS 数组中追加新课程 JSON 路径即可
 */
const LESSONS = [
  'data/book1/lesson1.json',
  'data/book1/lesson2.json',
  'data/book1/lesson3.json',
  'data/book1/lesson4.json',
  'data/book1/lesson5.json',
  'data/book1/lesson6.json',
  'data/book1/lesson7.json',
  'data/book1/lesson8.json',
  'data/book1/lesson9.json',
  'data/book1/lesson10.json',
  'data/book2/lesson1.json'
];

// Supabase 配置与客户端初始化
const SUPABASE_URL = 'https://zunklmeqrqnzoqbxznun.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NCKHV9_eenAbZYH1BPZ03A_sWb2kfZo';
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// 云端 MP3 语音接口（用于手机 App 与本地预览；正式网页端会自动使用当前域名）
// 若后续修改了 Cloudflare workers.dev 子域名，请同步更新此处
const CLOUD_TTS_ORIGIN = 'https://kr-learn.riolearnkr.workers.dev';
const TTS_CACHE_NAME = 'kr-learn-tts-v1';

// 本地存储键名前缀
const STORAGE_KEYS = {
  MASTERY_PREFIX: 'kr_learn_mastery_lesson_',
  QUIZ_SCORES: 'kr_learn_quiz_scores',
  SPEECH_RATE: 'kr_learn_speech_rate',
  ACTIVE_TAB: 'kr_learn_active_tab',
  CURRENT_LESSON: 'kr_learn_current_lesson'
};

// 全局应用状态
const savedLesson = localStorage.getItem(STORAGE_KEYS.CURRENT_LESSON);
const state = {
  currentLessonPath: LESSONS.includes(savedLesson) ? savedLesson : LESSONS[0],
  lessonData: null,
  lessonMetaCache: {
    'data/book1/lesson1.json': { lesson_id: 1, title: '인사', title_cn: '问候' },
    'data/book1/lesson2.json': { lesson_id: 2, title: '학교와 집', title_cn: '学校和家' },
    'data/book1/lesson3.json': { lesson_id: 3, title: '가족과 친구', title_cn: '家人和朋友' },
    'data/book1/lesson4.json': { lesson_id: 4, title: '음식', title_cn: '饮食' },
    'data/book1/lesson5.json': { lesson_id: 5, title: '하루 생활', title_cn: '一天的生活' },
    'data/book1/lesson6.json': { lesson_id: 6, title: '물건 사기', title_cn: '购物' },
    'data/book1/lesson7.json': { lesson_id: 7, title: '교통', title_cn: '交通' },
    'data/book1/lesson8.json': { lesson_id: 8, title: '전화', title_cn: '电话' },
    'data/book1/lesson9.json': { lesson_id: 9, title: '날씨와 계절', title_cn: '天气和季节' },
    'data/book1/lesson10.json': { lesson_id: 10, title: '휴일과 방학', title_cn: '节假日' },
    'data/book2/lesson1.json': { lesson_id: 1, title: '소개', title_cn: '介绍' }
  },
  activeTab: localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) || 'vocabulary',

  // TTS 语音状态
  speechRate: parseFloat(localStorage.getItem(STORAGE_KEYS.SPEECH_RATE)) || 1.0,
  koVoice: null,
  isSpeaking: false,
  activeHighlightEls: [],
  activeButtonEl: null,

  // 对话连播控制状态
  dialogueQueue: [],
  dialogueQueueIndex: 0,
  isDialoguePlaying: false,
  isDialoguePaused: false,
  activeSectionIndex: null, // null 表示全篇连播，数字表示单节连播
  dialogueTimer: null,
  speakSessionId: 0, // 防止异步回调竞态

  // 生词模块状态
  maskChinese: false,
  maskKorean: false,
  unmasteredOnly: false,
  selectedPos: 'ALL',
  searchQuery: '',
  masteredIds: new Set(),

  // 语法模块状态
  collapsedGrammarIds: new Set(),

  // 对话模块状态
  hideDialogueCn: false,
  showDialoguePron: true,

  // 测验模块状态
  quizAnswers: {}, // { [exerciseId]: selectedOptionIndex }

  // 用户认证与云同步状态
  currentUser: null,
  authMode: 'signin', // 'signin' | 'signup'
  pendingVerifyEmail: '',
  lastSyncedUserId: null
};

// 说话人头像配色映射
const SPEAKER_THEMES = {
  '리에': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', bubble: 'bg-white', align: 'left' },
  '웨이': { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', bubble: 'bg-indigo-50/60', align: 'right' },
  '제임스': { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', bubble: 'bg-amber-50/50', align: 'right' },
  '마리아': { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', bubble: 'bg-teal-50/50', align: 'right' },
  '미선': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', bubble: 'bg-white', align: 'left' },
  '영수': { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', bubble: 'bg-sky-50/60', align: 'right' },
  '정희': { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', bubble: 'bg-white', align: 'left' },
  '민철': { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', bubble: 'bg-cyan-50/50', align: 'right' },
  '점원': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', bubble: 'bg-emerald-50/50', align: 'right' },
  '종업원': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', bubble: 'bg-emerald-50/50', align: 'right' },
  '주인': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', bubble: 'bg-orange-50/50', align: 'right' },
  '기사': { bg: 'bg-slate-200', text: 'text-slate-700', border: 'border-slate-300', bubble: 'bg-slate-50', align: 'right' },
  '남자': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', bubble: 'bg-blue-50/50', align: 'left' }
};

// 词性标签颜色映射
const POS_BADGE_STYLES = {
  '名词': 'bg-blue-50 text-blue-700 border-blue-200',
  '名词/副词': 'bg-blue-50 text-blue-700 border-blue-200',
  '动词': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '动词/形容词': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '动词活用形': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '形容词': 'bg-purple-50 text-purple-700 border-purple-200',
  '副词': 'bg-violet-50 text-violet-700 border-violet-200',
  '数词': 'bg-teal-50 text-teal-700 border-teal-200',
  '量词': 'bg-lime-50 text-lime-700 border-lime-200',
  '单位名词': 'bg-lime-50 text-lime-700 border-lime-200',
  '代词': 'bg-amber-50 text-amber-700 border-amber-200',
  '冠词': 'bg-orange-50 text-orange-700 border-orange-200',
  '助词': 'bg-rose-50 text-rose-700 border-rose-200',
  '补助词': 'bg-rose-50 text-rose-700 border-rose-200',
  '助词/词尾': 'bg-rose-50 text-rose-700 border-rose-200',
  '连词': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  '感叹词': 'bg-pink-50 text-pink-700 border-pink-200',
  '常用语': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  '惯用型': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  '词组': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  '依存名词': 'bg-slate-100 text-slate-700 border-slate-200',
  '后缀': 'bg-slate-100 text-slate-700 border-slate-200',
  '词尾': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
};

/* ==========================================================================
   1. 初始化与动态课程加载
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initTTS();
  initLessonSelect();
  bindGlobalEvents();
  initAuth();
  updateRateButtonsUI();
  switchTab(state.activeTab, false);
  loadLesson(state.currentLessonPath);
});

/**
 * 初始化顶部课程下拉菜单
 */
function initLessonSelect() {
  const selectEl = document.getElementById('lesson-select');
  if (!selectEl) return;

  selectEl.innerHTML = LESSONS.map((path, idx) => {
    const cached = state.lessonMetaCache[path];
    const bookMatch = path.match(/book(\d+)\//);
    const bookPrefix = bookMatch ? `第 ${bookMatch[1]} 册 · ` : '';
    const label = cached
      ? `${bookPrefix}第 ${cached.lesson_id} 课 · ${cached.title} (${cached.title_cn})`
      : `${bookPrefix}第 ${idx + 1} 课 (${path.split('/').pop()})`;
    return `<option value="${escapeHtml(path)}" ${path === state.currentLessonPath ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

/**
 * 加载指定路径的课程 JSON 数据
 */
async function loadLesson(lessonPath, skipCloudSync = false) {
  stopAllSpeech();
  state.currentLessonPath = lessonPath;
  localStorage.setItem(STORAGE_KEYS.CURRENT_LESSON, lessonPath);
  if (!skipCloudSync && state.currentUser && state.lastSyncedUserId === state.currentUser.id) {
    syncProgressToCloud();
  }

  const loadingEl = document.getElementById('loading-state');
  const errorEl = document.getElementById('error-state');
  const panels = document.querySelectorAll('.tab-panel');

  loadingEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  panels.forEach(p => p.classList.add('hidden'));

  try {
    const response = await fetch(lessonPath, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: 无法加载 ${lessonPath}`);
    }
    const data = await response.json();
    applyLessonData(lessonPath, data);
  } catch (err) {
    console.error('加载课程 JSON 出错:', err);
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    const msgEl = document.getElementById('error-message');
    if (window.location.protocol === 'file:') {
      msgEl.textContent = `浏览器安全策略限制了 file:// 协议直接读取本地 JSON。请通过本地静态服务器访问（例如 http://localhost:8000）。错误详情：${err.message}`;
    } else {
      msgEl.textContent = err.message || '未知错误，请检查文件路径是否正确。';
    }
  }
}

/**
 * 将加载成功的课程数据应用到状态与界面
 */
function applyLessonData(lessonPath, data) {
  state.lessonData = data;
  state.lessonMetaCache[lessonPath] = {
    lesson_id: data.lesson_id,
    title: data.title,
    title_cn: data.title_cn
  };

  // 更新下拉菜单标题
  initLessonSelect();

  // 读取该课在 localStorage 中的生词掌握记录与测验记录
  loadMasteryFromStorage(data.lesson_id);
  loadQuizAnswersFromStorage(lessonPath);

  // 重置筛选状态
  state.selectedPos = 'ALL';
  state.searchQuery = '';
  state.collapsedGrammarIds.clear();

  const searchInput = document.getElementById('vocab-search-input');
  if (searchInput) searchInput.value = '';

  // 更新头部课程横幅与计数
  document.getElementById('lesson-badge').textContent = `Lesson ${data.lesson_id}`;
  document.getElementById('lesson-title-kr').textContent = data.title || '';
  document.getElementById('lesson-title-cn').textContent = data.title_cn || '';

  const quizHeaderTitle = document.getElementById('quiz-header-title');
  if (quizHeaderTitle) {
    quizHeaderTitle.textContent = `第 ${data.lesson_id} 课 · ${data.title} (${data.title_cn}) 随堂巩固测验`;
  }

  const vocabCount = Array.isArray(data.vocabulary) ? data.vocabulary.length : 0;
  const grammarCount = Array.isArray(data.grammar) ? data.grammar.length : 0;
  const dialogueLinesCount = Array.isArray(data.dialogues)
    ? data.dialogues.reduce((sum, sec) => sum + (Array.isArray(sec.lines) ? sec.lines.length : 0), 0)
    : 0;
  const exerciseCount = Array.isArray(data.exercises) ? data.exercises.length : 0;

  document.getElementById('tab-count-vocabulary').textContent = vocabCount;
  document.getElementById('tab-count-grammar').textContent = grammarCount;
  document.getElementById('tab-count-dialogues').textContent = dialogueLinesCount;
  document.getElementById('tab-count-exercises').textContent = exerciseCount;

  // 渲染四大模块
  renderPosFilters();
  renderVocabulary();
  renderGrammar();
  renderDialogues();
  renderExercises();

  // 隐藏加载动画，展示当前激活的 Tab
  document.getElementById('loading-state').classList.add('hidden');
  switchTab(state.activeTab, false);
}

/* ==========================================================================
   2. 语音引擎 (云端 MP3 + 本地 CacheStorage 缓存为主，系统 TTS 为离线兜底)
   ========================================================================== */

let activeAudio = null;
let activeAudioUrl = null;

function getTTSEndpointUrl(text) {
  const isLocalOrNative =
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const base = isLocalOrNative ? CLOUD_TTS_ORIGIN : window.location.origin;
  return `${base}/api/tts?lang=ko&text=${encodeURIComponent(text)}`;
}

function getNativeTTSPlugin() {
  if (
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.TextToSpeech
  ) {
    return window.Capacitor.Plugins.TextToSpeech;
  }
  return null;
}

function cleanupActiveAudio() {
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

function cancelActiveTTS() {
  cleanupActiveAudio();
  const nativeTTS = getNativeTTSPlugin();
  if (nativeTTS) {
    nativeTTS.stop().catch(() => {});
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function initTTS() {
  const badgeEl = document.getElementById('tts-voice-badge');
  const nameEl = document.getElementById('tts-voice-name');
  if (badgeEl && nameEl) {
    badgeEl.classList.remove('hidden');
    nameEl.textContent = '云端韩语语音 (MP3 缓存)';
  }

  // 后台静默探测原生/浏览器语音作为离线未缓存时的兜底
  const nativeTTS = getNativeTTSPlugin();
  if (nativeTTS && typeof nativeTTS.getSupportedVoices === 'function') {
    nativeTTS.getSupportedVoices().then(({ voices = [] }) => {
      const koIndex = voices.findIndex(v => (v.lang || '').replace('_', '-').toLowerCase().startsWith('ko'));
      if (koIndex >= 0) {
        state.nativeKoVoiceIndex = koIndex;
      }
    }).catch(() => {});
    return;
  }

  if (!('speechSynthesis' in window)) return;

  const selectBestKoreanVoice = () => {
    const voices = window.speechSynthesis.getVoices() || [];
    const koVoices = voices.filter(v => {
      const lang = (v.lang || '').replace('_', '-').toLowerCase();
      return lang.startsWith('ko');
    });

    if (koVoices.length > 0) {
      const scoreVoice = (v) => {
        const name = (v.name || '').toLowerCase();
        let score = 0;
        if (v.lang === 'ko-KR') score += 10;
        if (name.includes('natural') || name.includes('online') || name.includes('premium') || name.includes('enhanced')) score += 50;
        if (name.includes('google')) score += 40;
        if (name.includes('sunhi') || name.includes('heami') || name.includes('microsoft')) score += 35;
        if (name.includes('yuna') || name.includes('sora') || name.includes('apple')) score += 30;
        if (!v.localService) score += 5;
        return score;
      };

      koVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
      state.koVoice = koVoices[0];
    }
  };

  selectBestKoreanVoice();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = selectBestKoreanVoice;
  }
}

async function fetchOrGetCachedTTSBlob(text) {
  const ttsUrl = getTTSEndpointUrl(text);

  if ('caches' in window) {
    try {
      const cache = await caches.open(TTS_CACHE_NAME);
      const cachedRes = await cache.match(ttsUrl);
      if (cachedRes) {
        return await cachedRes.blob();
      }
      const networkRes = await fetch(ttsUrl);
      const contentType = networkRes.headers.get('content-type') || '';
      if (!networkRes.ok || !contentType.includes('audio')) {
        throw new Error(`TTS 请求失败 (${networkRes.status})`);
      }
      await cache.put(ttsUrl, networkRes.clone());
      return await networkRes.blob();
    } catch (err) {
      // CacheStorage 不可用时降级直接请求
      if (err && String(err.message || '').startsWith('TTS 请求失败')) {
        throw err;
      }
    }
  }

  const res = await fetch(ttsUrl);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('audio')) {
    throw new Error(`TTS 请求失败 (${res.status})`);
  }
  return await res.blob();
}

function playFallbackSystemTTS(text, handleFinish) {
  const nativeTTS = getNativeTTSPlugin();
  if (nativeTTS && typeof state.nativeKoVoiceIndex === 'number') {
    nativeTTS.speak({
      text,
      lang: 'ko-KR',
      rate: state.speechRate,
      pitch: 1.0,
      volume: 1.0,
      category: 'playback',
      voice: state.nativeKoVoiceIndex
    }).then(handleFinish).catch(handleFinish);
    return;
  }

  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = state.speechRate;
    utterance.pitch = 1.0;
    if (state.koVoice) {
      utterance.voice = state.koVoice;
    }
    utterance.onend = handleFinish;
    utterance.onerror = handleFinish;
    window.speechSynthesis.speak(utterance);
    return;
  }

  handleFinish();
}

/**
 * 朗读单条韩文文本，并高亮关联的 DOM 元素
 * @param {string} text 要朗读的韩文
 * @param {Object} options { highlightEls: HTMLElement[], buttonEl: HTMLElement, onEnd: Function, keepDialogueLoop: boolean }
 */
function speakKorean(text, options = {}) {
  if (!text) {
    if (options.onEnd) options.onEnd();
    return;
  }

  // 如果不是对话连播内部调用，则先终止正在进行的对话连播
  if (!options.keepDialogueLoop && state.isDialoguePlaying) {
    stopDialogueSequence();
  }

  // 取消当前未完成的语音并清除旧高亮
  cancelActiveTTS();
  clearSpeakingHighlights();

  const currentSession = ++state.speakSessionId;

  // 添加高亮样式
  const highlightEls = (options.highlightEls || []).filter(Boolean);
  state.activeHighlightEls = highlightEls;
  state.activeButtonEl = options.buttonEl || null;
  state.isSpeaking = true;

  highlightEls.forEach(el => {
    if (el.dataset.highlightType === 'text') {
      el.classList.add('speaking-text-highlight');
    } else {
      el.classList.add('speaking-highlight');
    }
  });

  if (state.activeButtonEl) {
    state.activeButtonEl.classList.add('is-speaking');
  }

  const stopBtn = document.getElementById('global-stop-tts-btn');
  if (stopBtn) {
    stopBtn.classList.remove('hidden');
    stopBtn.classList.add('inline-flex');
  }

  const handleFinish = () => {
    if (currentSession !== state.speakSessionId) return;
    cleanupActiveAudio();
    clearSpeakingHighlights();
    if (options.onEnd) {
      options.onEnd();
    }
  };

  fetchOrGetCachedTTSBlob(text)
    .then((blob) => {
      if (currentSession !== state.speakSessionId) return;

      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.playbackRate = state.speechRate;
      audio.onloadedmetadata = () => {
        audio.playbackRate = state.speechRate;
      };
      audio.onended = handleFinish;
      audio.onerror = () => {
        if (currentSession !== state.speakSessionId) return;
        cleanupActiveAudio();
        playFallbackSystemTTS(text, handleFinish);
      };

      activeAudio = audio;
      activeAudioUrl = objectUrl;

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          if (currentSession !== state.speakSessionId) return;
          cleanupActiveAudio();
          playFallbackSystemTTS(text, handleFinish);
        });
      }
    })
    .catch(() => {
      if (currentSession !== state.speakSessionId) return;
      playFallbackSystemTTS(text, handleFinish);
    });
}

/**
 * 清除所有正在朗读的高亮状态
 */
function clearSpeakingHighlights() {
  state.activeHighlightEls.forEach(el => {
    el.classList.remove('speaking-highlight', 'speaking-text-highlight');
  });
  state.activeHighlightEls = [];

  if (state.activeButtonEl) {
    state.activeButtonEl.classList.remove('is-speaking');
    state.activeButtonEl = null;
  }

  state.isSpeaking = false;

  if (!state.isDialoguePlaying) {
    const stopBtn = document.getElementById('global-stop-tts-btn');
    if (stopBtn) {
      stopBtn.classList.add('hidden');
      stopBtn.classList.remove('inline-flex');
    }
  }
}

/**
 * 停止一切语音与连播队列
 */
function stopAllSpeech() {
  state.speakSessionId++;
  if (state.dialogueTimer) {
    clearTimeout(state.dialogueTimer);
    state.dialogueTimer = null;
  }
  state.isDialoguePlaying = false;
  state.isDialoguePaused = false;
  state.activeSectionIndex = null;
  cancelActiveTTS();
  clearSpeakingHighlights();
  updateDialoguePlaybackUI();
}

/* ==========================================================================
   3. 课文对话顺序连播引擎（句间停顿 800ms，支持暂停/继续/停止）
   ========================================================================== */

/**
 * 启动或切换整篇/单节对话连播
 * @param {number|null} sectionIndex null 为全篇连播，数字为指定小节连播
 */
function startOrToggleDialoguePlayback(sectionIndex = null) {
  if (!state.lessonData || !Array.isArray(state.lessonData.dialogues)) return;

  // 若当前正在连播同一范围，则切换暂停/继续
  if (state.isDialoguePlaying && state.activeSectionIndex === sectionIndex) {
    if (state.isDialoguePaused) {
      resumeDialogueSequence();
    } else {
      pauseDialogueSequence();
    }
    return;
  }

  // 否则开启新的连播队列
  stopAllSpeech();

  const queue = [];
  state.lessonData.dialogues.forEach((sec, sIdx) => {
    if (sectionIndex !== null && sIdx !== sectionIndex) return;
    (sec.lines || []).forEach((line, lIdx) => {
      const domId = `dialogue-line-${sIdx}-${lIdx}`;
      queue.push({
        korean: line.korean,
        domId,
        sectionIndex: sIdx,
        lineIndex: lIdx
      });
    });
  });

  if (queue.length === 0) return;

  state.dialogueQueue = queue;
  state.dialogueQueueIndex = 0;
  state.isDialoguePlaying = true;
  state.isDialoguePaused = false;
  state.activeSectionIndex = sectionIndex;

  updateDialoguePlaybackUI();
  playCurrentDialogueQueueItem();
}

function playCurrentDialogueQueueItem() {
  if (!state.isDialoguePlaying || state.isDialoguePaused) return;

  if (state.dialogueQueueIndex >= state.dialogueQueue.length) {
    stopDialogueSequence();
    return;
  }

  const item = state.dialogueQueue[state.dialogueQueueIndex];
  const bubbleEl = document.getElementById(item.domId);
  const textEl = document.getElementById(`${item.domId}-kr`);
  const btnEl = document.getElementById(`${item.domId}-btn`);

  if (bubbleEl) {
    bubbleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const sessionSnapshot = state.speakSessionId + 1;

  speakKorean(item.korean, {
    highlightEls: [bubbleEl, textEl],
    buttonEl: btnEl,
    keepDialogueLoop: true,
    onEnd: () => {
      if (!state.isDialoguePlaying || state.isDialoguePaused) return;
      if (state.speakSessionId !== sessionSnapshot) return;

      // 句间自动停顿 800ms
      state.dialogueTimer = setTimeout(() => {
        if (!state.isDialoguePlaying || state.isDialoguePaused) return;
        state.dialogueQueueIndex++;
        playCurrentDialogueQueueItem();
      }, 800);
    }
  });
}

function pauseDialogueSequence() {
  if (!state.isDialoguePlaying) return;
  state.isDialoguePaused = true;
  state.speakSessionId++;
  if (state.dialogueTimer) {
    clearTimeout(state.dialogueTimer);
    state.dialogueTimer = null;
  }
  cancelActiveTTS();
  clearSpeakingHighlights();
  updateDialoguePlaybackUI();
}

function resumeDialogueSequence() {
  if (!state.isDialoguePlaying || !state.isDialoguePaused) return;
  state.isDialoguePaused = false;
  updateDialoguePlaybackUI();
  playCurrentDialogueQueueItem();
}

function stopDialogueSequence() {
  stopAllSpeech();
}

function updateDialoguePlaybackUI() {
  const playAllBtn = document.getElementById('play-all-dialogues-btn');
  const playAllLabel = document.getElementById('play-all-label');
  const stopLoopBtn = document.getElementById('stop-dialogue-Loop-btn');
  const statusBadge = document.getElementById('dialogue-playing-status');

  // 更新顶部全篇连播按钮
  if (playAllBtn && playAllLabel && stopLoopBtn && statusBadge) {
    if (state.isDialoguePlaying) {
      stopLoopBtn.classList.remove('hidden');
      stopLoopBtn.classList.add('inline-flex');
      statusBadge.classList.remove('hidden');

      if (state.activeSectionIndex === null) {
        playAllLabel.textContent = state.isDialoguePaused ? '继续连播整段对话' : '暂停连播';
      } else {
        playAllLabel.textContent = '顺序连播整段对话';
      }

      statusBadge.textContent = state.isDialoguePaused
        ? '已暂停连播（点击可继续）'
        : `正在连播 (${state.dialogueQueueIndex + 1} / ${state.dialogueQueue.length}) · 句间停顿 800ms`;
    } else {
      stopLoopBtn.classList.add('hidden');
      stopLoopBtn.classList.remove('inline-flex');
      statusBadge.classList.add('hidden');
      playAllLabel.textContent = '顺序连播整段对话';
    }
  }

  // 更新各个小节的连播按钮文字
  document.querySelectorAll('.section-play-btn').forEach(btn => {
    const sIdx = parseInt(btn.dataset.sectionIndex, 10);
    const labelSpan = btn.querySelector('.section-play-label');
    if (!labelSpan) return;

    if (state.isDialoguePlaying && state.activeSectionIndex === sIdx) {
      labelSpan.textContent = state.isDialoguePaused ? '继续本段' : '暂停本段';
      btn.classList.add('bg-brand-600', 'text-white', 'border-brand-600');
      btn.classList.remove('bg-brand-50', 'text-brand-700', 'border-brand-200');
    } else {
      labelSpan.textContent = '连播本段';
      btn.classList.remove('bg-brand-600', 'text-white', 'border-brand-600');
      btn.classList.add('bg-brand-50', 'text-brand-700', 'border-brand-200');
    }
  });
}

/* ==========================================================================
   4. TAB 1: 生词精学 (Vocabulary) 渲染与交互
   ========================================================================== */

function loadMasteryFromStorage(lessonId) {
  state.masteredIds.clear();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.MASTERY_PREFIX}${lessonId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(id => state.masteredIds.add(id));
      }
    }
  } catch (e) {
    console.warn('读取生词掌握状态失败:', e);
  }
}

function saveMasteryToStorage() {
  if (!state.lessonData) return;
  try {
    const key = `${STORAGE_KEYS.MASTERY_PREFIX}${state.lessonData.lesson_id}`;
    localStorage.setItem(key, JSON.stringify(Array.from(state.masteredIds)));
  } catch (e) {
    console.warn('保存生词掌握状态失败:', e);
  }
}

function toggleVocabMastery(vocabId) {
  if (state.masteredIds.has(vocabId)) {
    state.masteredIds.delete(vocabId);
  } else {
    state.masteredIds.add(vocabId);
  }
  saveMasteryToStorage();
  renderVocabulary();
  syncProgressToCloud();
}

function renderPosFilters() {
  const container = document.getElementById('vocab-pos-filters');
  if (!container || !state.lessonData) return;

  const vocabList = state.lessonData.vocabulary || [];
  const posCounts = { ALL: vocabList.length };
  vocabList.forEach(v => {
    const pos = v.pos || '其他';
    posCounts[pos] = (posCounts[pos] || 0) + 1;
  });

  const posKeys = ['ALL', ...Object.keys(posCounts).filter(k => k !== 'ALL')];

  container.innerHTML = posKeys.map(pos => {
    const isActive = state.selectedPos === pos;
    const label = pos === 'ALL' ? '全部词性' : pos;
    const activeCls = isActive
      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100';
    return `
      <button
        type="button"
        data-pos="${escapeHtml(pos)}"
        class="pos-filter-btn px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap transition ${activeCls}"
      >
        ${escapeHtml(label)} <span class="opacity-75">(${posCounts[pos]})</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.pos-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedPos = btn.dataset.pos;
      renderPosFilters();
      renderVocabulary();
    });
  });
}

function renderVocabulary() {
  if (!state.lessonData) return;
  const vocabList = state.lessonData.vocabulary || [];

  // 更新掌握度进度条
  const totalCount = vocabList.length;
  const masteredCount = vocabList.filter(v => state.masteredIds.has(v.id)).length;
  const pct = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

  const badgeEl = document.getElementById('vocab-progress-badge');
  const barEl = document.getElementById('vocab-progress-bar');
  if (badgeEl) badgeEl.textContent = `${masteredCount} / ${totalCount} 已掌握 (${pct}%)`;
  if (barEl) barEl.style.width = `${pct}%`;

  // 过滤生词
  const query = state.searchQuery.trim().toLowerCase();
  const filtered = vocabList.filter(v => {
    if (state.unmasteredOnly && state.masteredIds.has(v.id)) return false;
    if (state.selectedPos !== 'ALL' && v.pos !== state.selectedPos) return false;
    if (query) {
      const hay = `${v.korean || ''} ${v.chinese || ''} ${v.pos || ''} ${v.pronunciation_note || ''} ${v.example_kr || ''} ${v.example_cn || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const gridEl = document.getElementById('vocab-grid');
  const emptyEl = document.getElementById('vocab-empty-state');

  if (filtered.length === 0) {
    gridEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  gridEl.innerHTML = filtered.map((item) => {
    const isMastered = state.masteredIds.has(item.id);
    const posCls = POS_BADGE_STYLES[item.pos] || 'bg-slate-100 text-slate-700 border-slate-200';
    const krMaskCls = state.maskKorean ? 'mask-blur' : '';
    const cnMaskCls = state.maskChinese ? 'mask-blur' : '';
    const cardBorderCls = isMastered
      ? 'border-emerald-200/90 bg-emerald-50/20'
      : 'border-slate-200/90 bg-white';

    const numLabel = item.id ? item.id.replace(/^v\d+_/, '#').padStart(3, '0') : '';

    return `
      <article
        id="vocab-card-${escapeHtml(item.id)}"
        class="vocab-card rounded-2xl border ${cardBorderCls} p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3.5"
      >
        <div>
          <!-- 卡片顶部：序号、词性、音变标签、掌握度开关 -->
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-mono font-semibold text-slate-400">${escapeHtml(numLabel)}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-md border ${posCls}">${escapeHtml(item.pos || '词汇')}</span>
              ${item.pronunciation_note ? `
                <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 font-kr" title="韩语发音音变规则提示">
                  <svg class="w-3 h-3 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  ${escapeHtml(item.pronunciation_note)}
                </span>
              ` : ''}
            </div>

            <!-- 已掌握 / 需复习 切换按钮 -->
            <button
              type="button"
              data-mastery-id="${escapeHtml(item.id)}"
              class="mastery-toggle-btn shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                isMastered
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
              }"
            >
              ${isMastered ? `
                <svg class="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>已掌握</span>
              ` : `
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>需复习</span>
              `}
            </button>
          </div>

          <!-- 核心词条：韩文原词 + 朗读按钮 + 中文释义 -->
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1 flex-1">
              <div class="flex items-center gap-2.5">
                <h4
                  id="vocab-word-${escapeHtml(item.id)}"
                  data-highlight-type="text"
                  class="text-xl sm:text-2xl font-bold font-kr text-slate-900 tracking-tight ${krMaskCls}"
                >${escapeHtml(item.korean)}</h4>
                <button
                  type="button"
                  data-speak-text="${escapeHtml(item.korean)}"
                  data-target-card="vocab-card-${escapeHtml(item.id)}"
                  data-target-text="vocab-word-${escapeHtml(item.id)}"
                  class="tts-btn w-8 h-8 rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white flex items-center justify-center transition shrink-0"
                  title="点击朗读单词"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
              </div>
              <p class="text-sm font-medium text-slate-700 ${cnMaskCls}">${escapeHtml(item.chinese)}</p>
            </div>
          </div>
        </div>

        <!-- 底部双语例句框 -->
        <div class="pt-3 border-t border-slate-100 flex items-start justify-between gap-2.5 bg-slate-50/70 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-3.5 sm:px-5 rounded-b-2xl">
          <div class="space-y-0.5 text-xs flex-1">
            <p
              id="vocab-ex-${escapeHtml(item.id)}"
              data-highlight-type="text"
              class="font-kr font-medium text-slate-800 text-sm ${krMaskCls}"
            >${escapeHtml(item.example_kr || '')}</p>
            <p class="text-slate-500 ${cnMaskCls}">${escapeHtml(item.example_cn || '')}</p>
          </div>
          ${item.example_kr ? `
            <button
              type="button"
              data-speak-text="${escapeHtml(item.example_kr)}"
              data-target-card="vocab-card-${escapeHtml(item.id)}"
              data-target-text="vocab-ex-${escapeHtml(item.id)}"
              class="tts-btn w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-600 flex items-center justify-center transition shrink-0 mt-0.5"
              title="朗读韩文例句"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');
}

/* ==========================================================================
   5. TAB 2: 核心语法 (Grammar) 渲染与交互
   ========================================================================== */

function renderGrammar() {
  const listEl = document.getElementById('grammar-list');
  if (!listEl || !state.lessonData) return;

  const grammarList = state.lessonData.grammar || [];

  listEl.innerHTML = grammarList.map((g, idx) => {
    const isCollapsed = state.collapsedGrammarIds.has(g.id);
    const examples = Array.isArray(g.examples) ? g.examples : [];

    return `
      <article
        id="grammar-card-${escapeHtml(g.id)}"
        class="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition"
      >
        <!-- 手风琴标题栏 -->
        <div
          data-grammar-toggle="${escapeHtml(g.id)}"
          class="flex items-center justify-between gap-4 p-4 sm:p-5 cursor-pointer hover:bg-slate-50/80 transition select-none"
        >
          <div class="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span class="w-7 h-7 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              ${String(idx + 1).padStart(2, '0')}
            </span>
            <span class="px-3 py-1 rounded-xl bg-brand-50 text-brand-700 border border-brand-200/80 font-kr font-bold text-base sm:text-lg">
              ${escapeHtml(g.pattern)}
            </span>
            <h4 class="text-sm sm:text-base font-bold text-slate-800">
              ${escapeHtml(g.meaning)}
            </h4>
          </div>

          <button
            type="button"
            class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-180'}"
            aria-label="展开或收起语法详情"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <!-- 语法详情主体 -->
        <div class="${isCollapsed ? 'hidden' : 'block'} border-t border-slate-100 p-4 sm:p-5 space-y-4 bg-white">
          <!-- 接续与用法说明 -->
          <div class="bg-slate-50 rounded-xl p-3.5 sm:p-4 border border-slate-200/60">
            <div class="text-xs font-bold uppercase tracking-wider text-brand-600 mb-1.5 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>接续规则与用法说明</span>
            </div>
            <p class="text-xs sm:text-sm text-slate-700 leading-relaxed">${escapeHtml(g.usage)}</p>
          </div>

          <!-- 配套双语例句列表 -->
          <div class="space-y-2">
            <div class="text-xs font-semibold text-slate-500 px-1">典型双语例句（点击喇叭朗读）：</div>
            <div class="grid grid-cols-1 gap-2">
              ${examples.map((ex, exIdx) => {
                const exDomId = `grammar-ex-${g.id}-${exIdx}`;
                return `
                  <div
                    id="${escapeHtml(exDomId)}-row"
                    class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition"
                  >
                    <div class="space-y-0.5">
                      <p
                        id="${escapeHtml(exDomId)}-kr"
                        data-highlight-type="text"
                        class="font-kr font-semibold text-slate-900 text-sm sm:text-base"
                      >${escapeHtml(ex.kr)}</p>
                      <p class="text-xs text-slate-500">${escapeHtml(ex.cn)}</p>
                    </div>
                    <button
                      type="button"
                      data-speak-text="${escapeHtml(ex.kr)}"
                      data-target-card="${escapeHtml(exDomId)}-row"
                      data-target-text="${escapeHtml(exDomId)}-kr"
                      class="tts-btn w-8 h-8 rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white flex items-center justify-center transition shrink-0"
                      title="朗读该语法例句"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* ==========================================================================
   6. TAB 3: 课文对话 (Dialogues) 渲染与交互
   ========================================================================== */

function renderDialogues() {
  const container = document.getElementById('dialogues-container');
  if (!container || !state.lessonData) return;

  const sections = state.lessonData.dialogues || [];

  container.innerHTML = sections.map((sec, sIdx) => {
    const lines = Array.isArray(sec.lines) ? sec.lines : [];

    return `
      <div class="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <!-- 对话小节头部 -->
        <div class="px-4 sm:px-6 py-3.5 bg-slate-50/80 border-b border-slate-200/70 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="w-2.5 h-2.5 rounded-full bg-brand-600"></span>
            <h4 class="text-sm sm:text-base font-bold font-kr text-slate-900">${escapeHtml(sec.section)}</h4>
          </div>

          <button
            type="button"
            data-section-index="${sIdx}"
            class="section-play-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition"
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
            </svg>
            <span class="section-play-label">连播本段</span>
          </button>
        </div>

        <!-- 聊天气泡列表 -->
        <div class="p-4 sm:p-6 space-y-4">
          ${lines.map((line, lIdx) => {
            const domId = `dialogue-line-${sIdx}-${lIdx}`;
            const theme = SPEAKER_THEMES[line.speaker] || {
              bg: 'bg-slate-100',
              text: 'text-slate-700',
              border: 'border-slate-200',
              bubble: 'bg-white',
              align: lIdx % 2 === 0 ? 'left' : 'right'
            };
            const isRight = lIdx % 2 === 1;
            const cnMaskCls = state.hideDialogueCn ? 'dialogue-cn-masked' : '';

            return `
              <div class="flex items-start gap-3 ${isRight ? 'flex-row-reverse' : ''}">
                <!-- 说话人头像 -->
                <div class="w-10 h-10 rounded-2xl ${theme.bg} ${theme.text} border ${theme.border} flex items-center justify-center font-kr font-bold text-xs shrink-0 shadow-xs">
                  ${escapeHtml(line.speaker)}
                </div>

                <!-- 气泡主体 -->
                <div
                  id="${domId}"
                  class="dialogue-bubble max-w-xl w-full sm:w-auto rounded-2xl border border-slate-200/90 ${theme.bubble} p-3.5 sm:p-4 shadow-xs transition"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="text-[11px] font-bold font-kr ${theme.text}">${escapeHtml(line.speaker)}</span>
                        ${state.showDialoguePron && line.pronunciation_note ? `
                          <span class="text-[11px] font-kr px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/70">
                            ${escapeHtml(line.pronunciation_note)}
                          </span>
                        ` : ''}
                      </div>

                      <p
                        id="${domId}-kr"
                        data-highlight-type="text"
                        class="text-base sm:text-lg font-bold font-kr text-slate-900 leading-snug"
                      >${escapeHtml(line.korean)}</p>

                      <p class="dialogue-cn-text text-xs sm:text-sm text-slate-600 pt-0.5 ${cnMaskCls}">
                        ${escapeHtml(line.chinese)}
                      </p>
                    </div>

                    <button
                      id="${domId}-btn"
                      type="button"
                      data-speak-text="${escapeHtml(line.korean)}"
                      data-target-card="${domId}"
                      data-target-text="${domId}-kr"
                      class="tts-btn w-8 h-8 rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white flex items-center justify-center transition shrink-0"
                      title="朗读本句台词"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  updateDialoguePlaybackUI();
}

/* ==========================================================================
   7. TAB 4: 随堂测验 (Exercises) 渲染与交互
   ========================================================================== */

function renderExercises() {
  const listEl = document.getElementById('exercises-list');
  if (!listEl || !state.lessonData) return;

  const exercises = state.lessonData.exercises || [];
  const optionLetters = ['A', 'B', 'C', 'D'];

  listEl.innerHTML = exercises.map((ex, idx) => {
    const userSelected = state.quizAnswers[ex.id];
    const isAnswered = typeof userSelected === 'number';
    const isCorrect = isAnswered && userSelected === ex.answer_index;

    return `
      <article class="bg-white rounded-2xl border ${
        !isAnswered
          ? 'border-slate-200/90'
          : isCorrect
          ? 'border-emerald-300'
          : 'border-rose-300'
      } p-4 sm:p-6 shadow-sm space-y-4 transition">
        
        <!-- 题干 -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-lg ${
              !isAnswered
                ? 'bg-slate-100 text-slate-700'
                : isCorrect
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            } text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              ${idx + 1}
            </span>
            <h4 class="text-sm sm:text-base font-bold font-kr text-slate-900 leading-relaxed">
              ${escapeHtml(ex.question)}
            </h4>
          </div>

          ${isAnswered ? `
            <span class="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
              isCorrect
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }">
              ${isCorrect ? '✓ 回答正确' : '✕ 回答错误'}
            </span>
          ` : ''}
        </div>

        <!-- 四个选项 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-0 sm:pl-10">
          ${(ex.options || []).map((opt, optIdx) => {
            let btnStyle = 'border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-brand-50/60 hover:border-brand-300 cursor-pointer';
            let badgeStyle = 'bg-white text-slate-600 border-slate-200';
            let statusIcon = '';

            if (isAnswered) {
              if (optIdx === ex.answer_index) {
                btnStyle = 'border-emerald-500 bg-emerald-50/90 text-emerald-900 font-semibold cursor-default';
                badgeStyle = 'bg-emerald-600 text-white border-emerald-600';
                statusIcon = '<span class="text-emerald-600 font-bold text-sm">✓</span>';
              } else if (optIdx === userSelected && optIdx !== ex.answer_index) {
                btnStyle = 'border-rose-500 bg-rose-50/90 text-rose-900 font-semibold cursor-default';
                badgeStyle = 'bg-rose-600 text-white border-rose-600';
                statusIcon = '<span class="text-rose-600 font-bold text-sm">✕</span>';
              } else {
                btnStyle = 'border-slate-200/60 bg-slate-50/30 text-slate-400 cursor-default opacity-70';
                badgeStyle = 'bg-slate-100 text-slate-400 border-slate-200';
              }
            }

            return `
              <button
                type="button"
                data-exercise-id="${escapeHtml(ex.id)}"
                data-option-index="${optIdx}"
                ${isAnswered ? 'disabled' : ''}
                class="quiz-option-btn flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left text-sm font-kr transition ${btnStyle}"
              >
                <div class="flex items-center gap-2.5">
                  <span class="w-6 h-6 rounded-lg border text-xs font-sans font-bold flex items-center justify-center shrink-0 ${badgeStyle}">
                    ${optionLetters[optIdx] || optIdx + 1}
                  </span>
                  <span>${escapeHtml(opt)}</span>
                </div>
                ${statusIcon}
              </button>
            `;
          }).join('')}
        </div>

        <!-- 答案解析（作答后立即展开） -->
        ${isAnswered ? `
          <div class="ml-0 sm:ml-10 p-3.5 sm:p-4 rounded-xl ${
            isCorrect ? 'bg-emerald-50/60 border border-emerald-200/80' : 'bg-amber-50/70 border border-amber-200/80'
          } text-xs sm:text-sm text-slate-700 space-y-1">
            <div class="font-bold ${isCorrect ? 'text-emerald-800' : 'text-amber-900'} flex items-center gap-1.5">
              <span>💡 答案解析（正确答案：${optionLetters[ex.answer_index]}）</span>
            </div>
            <p class="leading-relaxed">${escapeHtml(ex.explanation)}</p>
          </div>
        ` : ''}
      </article>
    `;
  }).join('');

  updateQuizSummaryUI();
}

function updateQuizSummaryUI() {
  if (!state.lessonData) return;
  const exercises = state.lessonData.exercises || [];
  const total = exercises.length;
  const answeredIds = Object.keys(state.quizAnswers);
  const answeredCount = answeredIds.length;

  let correctCount = 0;
  exercises.forEach(ex => {
    if (state.quizAnswers[ex.id] === ex.answer_index) {
      correctCount++;
    }
  });

  const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const topProgressEl = document.getElementById('quiz-top-progress');
  const scoreNumEl = document.getElementById('quiz-score-number');
  const titleEl = document.getElementById('quiz-summary-title');
  const subtitleEl = document.getElementById('quiz-summary-subtitle');

  if (topProgressEl) {
    topProgressEl.textContent = `已答 ${answeredCount} / ${total} 题 · 答对 ${correctCount} 题`;
  }
  if (scoreNumEl) {
    scoreNumEl.textContent = `${scorePct}分`;
  }

  if (titleEl && subtitleEl) {
    if (answeredCount === 0) {
      titleEl.textContent = '开始作答吧！';
      subtitleEl.textContent = `本课共 ${total} 道精选客观题，点击选项即可即时查看解析。`;
    } else if (answeredCount < total) {
      titleEl.textContent = `正在作答中（已完成 ${answeredCount}/${total}）`;
      subtitleEl.textContent = `当前答对 ${correctCount} 题，继续完成剩余题目吧！`;
    } else {
      if (scorePct === 100) {
        titleEl.textContent = '🎉 满分通关！太棒了！';
      } else if (scorePct >= 80) {
        titleEl.textContent = '👏 成绩优秀！已扎实掌握本课核心内容！';
      } else {
        titleEl.textContent = '💪 测验完成！建议结合错题解析再巩固一下哦。';
      }
      subtitleEl.textContent = `共 ${total} 题，答对 ${correctCount} 题，最终正确率 ${scorePct}%。`;
    }
  }
}

/* ==========================================================================
   8. 全局事件绑定与 Tab 路由切换
   ========================================================================== */

function bindGlobalEvents() {
  // 1. 顶部课程切换下拉菜单
  const lessonSelect = document.getElementById('lesson-select');
  if (lessonSelect) {
    lessonSelect.addEventListener('change', (e) => {
      loadLesson(e.target.value);
    });
  }

  // 2. 重新加载按钮
  const retryBtn = document.getElementById('retry-load-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadLesson(state.currentLessonPath);
    });
  }

  // 3. 全局语速切换开关 (1.0x vs 0.7x)
  document.querySelectorAll('.rate-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newRate = parseFloat(btn.dataset.rate) || 1.0;
      state.speechRate = newRate;
      localStorage.setItem(STORAGE_KEYS.SPEECH_RATE, String(newRate));
      updateRateButtonsUI();
    });
  });

  // 4. 全局停止朗读按钮
  const globalStopBtn = document.getElementById('global-stop-tts-btn');
  if (globalStopBtn) {
    globalStopBtn.addEventListener('click', () => {
      stopAllSpeech();
    });
  }

  // 5. 四大核心模块 Tab 切换
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab, true);
    });
  });

  // 6. 生词模块：记忆遮罩开关、未掌握筛选、重置掌握状态、搜索框
  const maskCnBtn = document.getElementById('toggle-mask-cn-btn');
  if (maskCnBtn) {
    maskCnBtn.addEventListener('click', () => {
      state.maskChinese = !state.maskChinese;
      updateVocabToolbarButtonsUI();
      renderVocabulary();
    });
  }

  const maskKrBtn = document.getElementById('toggle-mask-kr-btn');
  if (maskKrBtn) {
    maskKrBtn.addEventListener('click', () => {
      state.maskKorean = !state.maskKorean;
      updateVocabToolbarButtonsUI();
      renderVocabulary();
    });
  }

  const unmasteredBtn = document.getElementById('toggle-unmastered-only-btn');
  if (unmasteredBtn) {
    unmasteredBtn.addEventListener('click', () => {
      state.unmasteredOnly = !state.unmasteredOnly;
      updateVocabToolbarButtonsUI();
      renderVocabulary();
    });
  }

  const resetMasteryBtn = document.getElementById('reset-vocab-mastery-btn');
  if (resetMasteryBtn) {
    resetMasteryBtn.addEventListener('click', () => {
      state.masteredIds.clear();
      saveMasteryToStorage();
      renderVocabulary();
    });
  }

  const searchInput = document.getElementById('vocab-search-input');
  const searchClear = document.getElementById('vocab-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value || '';
      if (searchClear) {
        searchClear.classList.toggle('hidden', !state.searchQuery);
      }
      renderVocabulary();
    });
  }
  if (searchClear && searchInput) {
    searchClear.addEventListener('click', () => {
      state.searchQuery = '';
      searchInput.value = '';
      searchClear.classList.add('hidden');
      renderVocabulary();
    });
  }

  // 7. 语法模块：全部展开 / 全部收起
  const expandAllBtn = document.getElementById('grammar-expand-all-btn');
  const collapseAllBtn = document.getElementById('grammar-collapse-all-btn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      state.collapsedGrammarIds.clear();
      renderGrammar();
    });
  }
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      if (!state.lessonData) return;
      (state.lessonData.grammar || []).forEach(g => state.collapsedGrammarIds.add(g.id));
      renderGrammar();
    });
  }

  // 8. 对话模块：全篇连播、停止连播、隐藏中文翻译、显示音变提示
  const playAllBtn = document.getElementById('play-all-dialogues-btn');
  if (playAllBtn) {
    playAllBtn.addEventListener('click', () => {
      startOrToggleDialoguePlayback(null);
    });
  }

  const stopDialogueBtn = document.getElementById('stop-dialogue-Loop-btn');
  if (stopDialogueBtn) {
    stopDialogueBtn.addEventListener('click', () => {
      stopDialogueSequence();
    });
  }

  const toggleDialogueCnBtn = document.getElementById('toggle-dialogue-cn-btn');
  if (toggleDialogueCnBtn) {
    toggleDialogueCnBtn.addEventListener('click', () => {
      state.hideDialogueCn = !state.hideDialogueCn;
      const span = toggleDialogueCnBtn.querySelector('span');
      if (span) span.textContent = state.hideDialogueCn ? '显示中文翻译' : '隐藏中文翻译';
      toggleDialogueCnBtn.classList.toggle('bg-brand-50', state.hideDialogueCn);
      toggleDialogueCnBtn.classList.toggle('text-brand-700', state.hideDialogueCn);
      toggleDialogueCnBtn.classList.toggle('border-brand-200', state.hideDialogueCn);
      renderDialogues();
    });
  }

  const toggleDialoguePronBtn = document.getElementById('toggle-dialogue-pron-btn');
  if (toggleDialoguePronBtn) {
    toggleDialoguePronBtn.addEventListener('click', () => {
      state.showDialoguePron = !state.showDialoguePron;
      const span = toggleDialoguePronBtn.querySelector('span');
      if (span) span.textContent = state.showDialoguePron ? '显示音变提示' : '隐藏音变提示';
      toggleDialoguePronBtn.classList.toggle('bg-brand-50', state.showDialoguePron);
      toggleDialoguePronBtn.classList.toggle('text-brand-700', state.showDialoguePron);
      toggleDialoguePronBtn.classList.toggle('border-brand-200', state.showDialoguePron);
      renderDialogues();
    });
  }

  // 9. 测验模块：重置测验按钮
  const resetQuizTop = document.getElementById('reset-quiz-top-btn');
  const resetQuizBottom = document.getElementById('reset-quiz-bottom-btn');
  const handleResetQuiz = () => {
    state.quizAnswers = {};
    saveQuizScoreToStorage();
    renderExercises();
    syncProgressToCloud();
  };
  if (resetQuizTop) resetQuizTop.addEventListener('click', handleResetQuiz);
  if (resetQuizBottom) resetQuizBottom.addEventListener('click', handleResetQuiz);

  // 10. 主内容区事件委托（喇叭朗读、掌握度切换、遮罩点击揭开、语法折叠、小节连播、测验作答）
  document.querySelector('main').addEventListener('click', (e) => {
    // A. 点击喇叭按钮朗读
    const ttsBtn = e.target.closest('.tts-btn');
    if (ttsBtn) {
      e.stopPropagation();
      const text = ttsBtn.dataset.speakText;
      const cardEl = document.getElementById(ttsBtn.dataset.targetCard);
      const textEl = document.getElementById(ttsBtn.dataset.targetText);
      speakKorean(text, {
        highlightEls: [cardEl, textEl],
        buttonEl: ttsBtn
      });
      return;
    }

    // B. 点击掌握度切换按钮
    const masteryBtn = e.target.closest('.mastery-toggle-btn');
    if (masteryBtn) {
      e.stopPropagation();
      toggleVocabMastery(masteryBtn.dataset.masteryId);
      return;
    }

    // C. 点击被模糊遮罩的元素可临时切换揭开状态（适配移动端触屏与桌面端固定揭开）
    const maskedEl = e.target.closest('.mask-blur, .dialogue-cn-masked');
    if (maskedEl) {
      maskedEl.classList.toggle('revealed');
      return;
    }

    // D. 点击语法手风琴标题栏
    const grammarHeader = e.target.closest('[data-grammar-toggle]');
    if (grammarHeader) {
      const gId = grammarHeader.dataset.grammarToggle;
      if (state.collapsedGrammarIds.has(gId)) {
        state.collapsedGrammarIds.delete(gId);
      } else {
        state.collapsedGrammarIds.add(gId);
      }
      renderGrammar();
      return;
    }

    // E. 点击对话单节连播按钮
    const sectionPlayBtn = e.target.closest('.section-play-btn');
    if (sectionPlayBtn) {
      const sIdx = parseInt(sectionPlayBtn.dataset.sectionIndex, 10);
      startOrToggleDialoguePlayback(sIdx);
      return;
    }

    // F. 点击测验选项
    const quizOptBtn = e.target.closest('.quiz-option-btn');
    if (quizOptBtn && !quizOptBtn.disabled) {
      const exId = quizOptBtn.dataset.exerciseId;
      const optIdx = parseInt(quizOptBtn.dataset.optionIndex, 10);
      if (typeof state.quizAnswers[exId] === 'undefined') {
        state.quizAnswers[exId] = optIdx;
        const quizStatus = saveQuizScoreToStorage();
        renderExercises();
        if (quizStatus && quizStatus.completed) {
          syncProgressToCloud();
        }
      }
    }
  });
}

function switchTab(tabName, stopSpeechOnSwitch = true) {
  const validTabs = ['vocabulary', 'grammar', 'dialogues', 'exercises'];
  const target = validTabs.includes(tabName) ? tabName : 'vocabulary';
  state.activeTab = target;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, target);

  if (stopSpeechOnSwitch) {
    stopAllSpeech();
  }

  // 更新导航按钮高亮
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    const isCurrent = btn.dataset.tab === target;
    btn.classList.toggle('border-brand-600', isCurrent);
    btn.classList.toggle('text-brand-600', isCurrent);
    btn.classList.toggle('border-transparent', !isCurrent);
    btn.classList.toggle('text-slate-500', !isCurrent);
  });

  // 仅当课程数据已加载完成时才显示对应面板
  if (!state.lessonData) return;

  validTabs.forEach(t => {
    const panel = document.getElementById(`tab-panel-${t}`);
    if (panel) {
      panel.classList.toggle('hidden', t !== target);
    }
  });
}

function updateRateButtonsUI() {
  const normalBtn = document.getElementById('rate-normal-btn');
  const slowBtn = document.getElementById('rate-slow-btn');
  if (!normalBtn || !slowBtn) return;

  const isSlow = Math.abs(state.speechRate - 0.7) < 0.05;

  if (isSlow) {
    slowBtn.className = 'rate-toggle-btn px-2.5 py-1 rounded-lg text-xs font-semibold transition bg-white text-brand-600 shadow-sm';
    normalBtn.className = 'rate-toggle-btn px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-600 hover:text-slate-900';
  } else {
    normalBtn.className = 'rate-toggle-btn px-2.5 py-1 rounded-lg text-xs font-semibold transition bg-white text-brand-600 shadow-sm';
    slowBtn.className = 'rate-toggle-btn px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-600 hover:text-slate-900';
  }
}

function updateVocabToolbarButtonsUI() {
  const maskCnBtn = document.getElementById('toggle-mask-cn-btn');
  const maskKrBtn = document.getElementById('toggle-mask-kr-btn');
  const unmasteredBtn = document.getElementById('toggle-unmastered-only-btn');

  const applyActiveStyle = (btn, active, activeText, inactiveText) => {
    if (!btn) return;
    const span = btn.querySelector('span');
    if (span && activeText && inactiveText) {
      span.textContent = active ? activeText : inactiveText;
    }
    if (active) {
      btn.classList.add('bg-brand-600', 'text-white', 'border-brand-600');
      btn.classList.remove('bg-slate-50', 'text-slate-700', 'border-slate-200', 'hover:bg-slate-100');
    } else {
      btn.classList.remove('bg-brand-600', 'text-white', 'border-brand-600');
      btn.classList.add('bg-slate-50', 'text-slate-700', 'border-slate-200', 'hover:bg-slate-100');
    }
  };

  applyActiveStyle(maskCnBtn, state.maskChinese, '已隐藏中文 (悬停查看)', '隐藏中文释义');
  applyActiveStyle(maskKrBtn, state.maskKorean, '已隐藏韩文 (悬停查看)', '隐藏韩文');
  applyActiveStyle(unmasteredBtn, state.unmasteredOnly, '正在看未掌握生词', '仅看未掌握生词');
}

/**
 * HTML 转义防注入辅助函数
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   9. 用户认证 (Email Verification) 与 Supabase 云端进度同步
   ========================================================================== */

function getAllQuizScoresFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUIZ_SCORES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.warn('读取测验记录失败:', e);
    return {};
  }
}

function loadQuizAnswersFromStorage(lessonPath) {
  const allScores = getAllQuizScoresFromStorage();
  const entry = allScores[lessonPath];
  if (entry && entry.answers && typeof entry.answers === 'object') {
    state.quizAnswers = { ...entry.answers };
  } else {
    state.quizAnswers = {};
  }
}

function saveQuizScoreToStorage() {
  if (!state.lessonData) return null;
  const exercises = state.lessonData.exercises || [];
  const total = exercises.length;
  const answeredCount = Object.keys(state.quizAnswers).length;
  let correctCount = 0;
  exercises.forEach(ex => {
    if (state.quizAnswers[ex.id] === ex.answer_index) {
      correctCount++;
    }
  });
  const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const completed = total > 0 && answeredCount === total;

  const allScores = getAllQuizScoresFromStorage();
  if (answeredCount === 0) {
    delete allScores[state.currentLessonPath];
  } else {
    allScores[state.currentLessonPath] = {
      answers: { ...state.quizAnswers },
      score: scorePct,
      correct: correctCount,
      total,
      completed,
      updatedAt: new Date().toISOString()
    };
  }

  try {
    localStorage.setItem(STORAGE_KEYS.QUIZ_SCORES, JSON.stringify(allScores));
  } catch (e) {
    console.warn('保存测验记录失败:', e);
  }
  return { scorePct, correctCount, total, completed };
}

function collectLocalMasteredVocab() {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS.MASTERY_PREFIX)) {
      const lessonId = key.slice(STORAGE_KEYS.MASTERY_PREFIX.length);
      try {
        const arr = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(arr)) {
          result[lessonId] = arr;
        }
      } catch (e) {
        console.warn('解析生词掌握记录失败:', key, e);
      }
    }
  }
  return result;
}

function setSyncDotState(status) {
  const dot = document.getElementById('auth-sync-dot');
  if (!dot) return;
  dot.classList.remove('bg-emerald-500', 'bg-amber-400', 'bg-rose-500', 'animate-pulse');
  if (status === 'syncing') {
    dot.classList.add('bg-amber-400', 'animate-pulse');
    dot.title = '正在同步到云端...';
  } else if (status === 'error') {
    dot.classList.add('bg-rose-500');
    dot.title = '云端同步失败，已保存在本地';
  } else {
    dot.classList.add('bg-emerald-500');
    dot.title = '云端已同步';
  }
}

async function applyCloudProgressToLocal(cloudRow) {
  // 1. 同步生词掌握记录到 localStorage
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS.MASTERY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  const masteredVocab = cloudRow.mastered_vocab && typeof cloudRow.mastered_vocab === 'object'
    ? cloudRow.mastered_vocab
    : {};
  Object.entries(masteredVocab).forEach(([lessonId, ids]) => {
    if (Array.isArray(ids)) {
      localStorage.setItem(`${STORAGE_KEYS.MASTERY_PREFIX}${lessonId}`, JSON.stringify(ids));
    }
  });

  // 2. 同步测验成绩到 localStorage
  const quizScores = cloudRow.quiz_scores && typeof cloudRow.quiz_scores === 'object'
    ? cloudRow.quiz_scores
    : {};
  localStorage.setItem(STORAGE_KEYS.QUIZ_SCORES, JSON.stringify(quizScores));

  // 3. 应用 last_lesson 并刷新当前页面状态与 UI
  const targetLesson = cloudRow.last_lesson;
  if (targetLesson && LESSONS.includes(targetLesson) && targetLesson !== state.currentLessonPath) {
    await loadLesson(targetLesson, true);
  } else if (state.lessonData) {
    loadMasteryFromStorage(state.lessonData.lesson_id);
    loadQuizAnswersFromStorage(state.currentLessonPath);
    renderVocabulary();
    renderExercises();
  }
}

async function syncProgressToCloud() {
  if (!supabaseClient || !state.currentUser) return;
  setSyncDotState('syncing');
  try {
    const payload = {
      user_id: state.currentUser.id,
      mastered_vocab: collectLocalMasteredVocab(),
      quiz_scores: getAllQuizScoresFromStorage(),
      last_lesson: state.currentLessonPath
    };
    const { error } = await supabaseClient
      .from('user_progress')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;
    setSyncDotState('synced');
  } catch (err) {
    console.error('上传学习进度到 Supabase 失败:', err);
    setSyncDotState('error');
  }
}

async function syncProgressOnSignIn(user) {
  if (!supabaseClient || !user) return;
  setSyncDotState('syncing');
  try {
    const { data, error } = await supabaseClient
      .from('user_progress')
      .select('user_id, mastered_vocab, quiz_scores, last_lesson')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      await applyCloudProgressToLocal(data);
      setSyncDotState('synced');
    } else {
      await syncProgressToCloud();
    }
  } catch (err) {
    console.error('登录拉取云端学习进度失败:', err);
    setSyncDotState('error');
  }
}

function updateAuthHeaderUI() {
  const openBtn = document.getElementById('auth-open-modal-btn');
  const userPanel = document.getElementById('auth-user-panel');
  const emailEl = document.getElementById('auth-user-email');

  if (!openBtn || !userPanel || !emailEl) return;

  if (state.currentUser) {
    openBtn.classList.add('hidden');
    userPanel.classList.remove('hidden');
    userPanel.classList.add('inline-flex');
    const email = state.currentUser.email || '已登录用户';
    emailEl.textContent = email;
    emailEl.title = email;
  } else {
    openBtn.classList.remove('hidden');
    userPanel.classList.add('hidden');
    userPanel.classList.remove('inline-flex');
    emailEl.textContent = '';
  }
}

function setAuthModalMode(mode) {
  state.authMode = mode === 'signup' ? 'signup' : 'signin';
  const tabSignin = document.getElementById('auth-tab-signin');
  const tabSignup = document.getElementById('auth-tab-signup');
  const submitBtn = document.getElementById('auth-submit-btn');
  const pwdInput = document.getElementById('auth-password-input');
  const errorBox = document.getElementById('auth-error-box');

  if (errorBox) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
  }

  const activeCls = 'py-2 text-xs font-semibold rounded-lg bg-white text-brand-600 shadow-sm transition';
  const inactiveCls = 'py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition';

  if (state.authMode === 'signup') {
    if (tabSignin) tabSignin.className = inactiveCls;
    if (tabSignup) tabSignup.className = activeCls;
    if (submitBtn) submitBtn.textContent = 'Sign Up (注册并发送验证邮件)';
    if (pwdInput) pwdInput.autocomplete = 'new-password';
  } else {
    if (tabSignin) tabSignin.className = activeCls;
    if (tabSignup) tabSignup.className = inactiveCls;
    if (submitBtn) submitBtn.textContent = 'Sign In (登录并同步)';
    if (pwdInput) pwdInput.autocomplete = 'current-password';
  }
}

function showAuthVerifyPanel(email) {
  state.pendingVerifyEmail = email;
  const form = document.getElementById('auth-form');
  const tabs = document.getElementById('auth-mode-tabs');
  const verifyPanel = document.getElementById('auth-verify-panel');
  const emailDisplay = document.getElementById('auth-verify-email-display');
  const resendStatus = document.getElementById('auth-resend-status');

  if (form) form.classList.add('hidden');
  if (tabs) tabs.classList.add('hidden');
  if (verifyPanel) verifyPanel.classList.remove('hidden');
  if (emailDisplay) emailDisplay.textContent = email;
  if (resendStatus) {
    resendStatus.classList.add('hidden');
    resendStatus.textContent = '';
  }
}

function showAuthFormPanel() {
  const form = document.getElementById('auth-form');
  const tabs = document.getElementById('auth-mode-tabs');
  const verifyPanel = document.getElementById('auth-verify-panel');
  if (verifyPanel) verifyPanel.classList.add('hidden');
  if (tabs) tabs.classList.remove('hidden');
  if (form) form.classList.remove('hidden');
}

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  showAuthFormPanel();
  setAuthModalMode(state.authMode);
  modal.classList.remove('hidden');
  const emailInput = document.getElementById('auth-email-input');
  if (emailInput) emailInput.focus();
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function initAuth() {
  const openBtn = document.getElementById('auth-open-modal-btn');
  const closeBtn = document.getElementById('auth-close-modal-btn');
  const backdrop = document.getElementById('auth-modal-backdrop');
  const tabSignin = document.getElementById('auth-tab-signin');
  const tabSignup = document.getElementById('auth-tab-signup');
  const authForm = document.getElementById('auth-form');
  const resendBtn = document.getElementById('auth-resend-btn');
  const backToSigninBtn = document.getElementById('auth-back-to-signin-btn');
  const signoutBtn = document.getElementById('auth-signout-btn');

  if (openBtn) openBtn.addEventListener('click', openAuthModal);
  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);
  if (backdrop) backdrop.addEventListener('click', closeAuthModal);

  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('auth-modal');
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeAuthModal();
    }
  });

  if (tabSignin) tabSignin.addEventListener('click', () => setAuthModalMode('signin'));
  if (tabSignup) tabSignup.addEventListener('click', () => setAuthModalMode('signup'));

  if (backToSigninBtn) {
    backToSigninBtn.addEventListener('click', () => {
      showAuthFormPanel();
      setAuthModalMode('signin');
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!supabaseClient) return;

      const email = document.getElementById('auth-email-input').value.trim();
      const password = document.getElementById('auth-password-input').value;
      const submitBtn = document.getElementById('auth-submit-btn');
      const errorBox = document.getElementById('auth-error-box');

      if (errorBox) {
        errorBox.classList.add('hidden');
        errorBox.textContent = '';
      }
      if (submitBtn) submitBtn.disabled = true;

      try {
        if (state.authMode === 'signup') {
          const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin + window.location.pathname
            }
          });
          if (error) throw error;

          if (!data.session) {
            showAuthVerifyPanel(email);
          }
        } else {
          const { error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
          });
          if (error) throw error;
        }
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message || '认证请求失败，请检查邮箱与密码。';
          errorBox.classList.remove('hidden');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        setAuthModalMode(state.authMode);
      }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      if (!supabaseClient || !state.pendingVerifyEmail) return;
      const resendStatus = document.getElementById('auth-resend-status');
      resendBtn.disabled = true;
      try {
        const { error } = await supabaseClient.auth.resend({
          type: 'signup',
          email: state.pendingVerifyEmail,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        if (resendStatus) {
          resendStatus.className = 'p-2.5 rounded-xl text-xs bg-emerald-50 text-emerald-700 border border-emerald-200';
          resendStatus.textContent = '验证邮件已重新发送，请查收邮箱（包括垃圾邮件箱）。';
        }
      } catch (err) {
        if (resendStatus) {
          resendStatus.className = 'p-2.5 rounded-xl text-xs bg-rose-50 text-rose-700 border border-rose-200';
          resendStatus.textContent = err.message || '重发验证邮件失败，请稍后再试。';
        }
      } finally {
        resendBtn.disabled = false;
      }
    });
  }

  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      if (!supabaseClient) return;
      await supabaseClient.auth.signOut();
    });
  }

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        state.currentUser = session.user;
        updateAuthHeaderUI();
        closeAuthModal();

        if (state.lastSyncedUserId !== session.user.id) {
          state.lastSyncedUserId = session.user.id;
          await syncProgressOnSignIn(session.user);
        }
      } else {
        state.currentUser = null;
        state.lastSyncedUserId = null;
        updateAuthHeaderUI();
      }
    });
  }
}
