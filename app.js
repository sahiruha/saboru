// ================================================================
// サボロー — MVP SPA (vanilla JS)
// MVP範囲 (kikaku.md 9章):
//   1. タスク入力
//   2. AIによるタスク定量化
//   3. 先延ばしアドバイス生成
//   4. タスク終了ボタン
//   5. AIジャッジ
//   6. サボりスコア算出
//   7. ランキング表示
//
// 全ユーザー入力は esc() で HTML エスケープ後にテンプレへ差し込み、
// DOM 反映は Range.createContextualFragment 経由で行う。
// ================================================================
'use strict';

// ---------------- DOM helpers ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const setHTML = (el, html) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.deleteContents();
  el.appendChild(range.createContextualFragment(html));
};
const uid = () => 't_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const fmtTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const hoursUntil = (iso) => (new Date(iso).getTime() - Date.now()) / 3600000;
const toast = (msg) => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 1800);
};

// ---------------- state ----------------
const STORE_KEY = 'saboro:v1';
const Store = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { this.data = null; }
    if (!this.data) this.data = this.seed();
    return this.data;
  },
  save() { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); },
  reset() { localStorage.removeItem(STORE_KEY); this.data = this.seed(); this.save(); },
  seed() {
    return {
      user: { name: 'あなた' },
      tasks: [],
      others: [
        { id: 'u1', name: 'ねむお',     score: 612, sprite: 'penguin' },
        { id: 'u2', name: 'ぐっち5丸',  score: 398, sprite: 'bird' },
        { id: 'u3', name: 'みかん',     score: 355, sprite: 'orange' },
        { id: 'u4', name: 'たける',     score: 320, sprite: 'sheep' },
        { id: 'u5', name: 'はむ太郎',   score: 280, sprite: 'hamu' }
      ],
      lastWeekScore: 446
    };
  },
  task(id) { return this.data.tasks.find(t => t.id === id); },
  upsertTask(t) {
    const i = this.data.tasks.findIndex(x => x.id === t.id);
    if (i < 0) this.data.tasks.unshift(t); else this.data.tasks[i] = t;
    this.save();
  },
  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    this.save();
  },
  weeklyScore() {
    const since = Date.now() - 7 * 86400000;
    return this.data.tasks
      .filter(t => t.finish && t.finish.judgePoints && t.finish.finishedAt >= since)
      .reduce((sum, t) => sum + (t.finish.judgePoints | 0), 0);
  },
  ranking() {
    const me = { id: 'me', name: this.data.user.name, score: this.weeklyScore(), sprite: 'saboro', isMe: true };
    return [...this.data.others, me].sort((a, b) => b.score - a.score);
  }
};

// ---------------- mock AI (MVP 内) ----------------
const AI = {
  parseInput(text) {
    const t = (text || '').trim();
    return {
      title: AI.guessTitle(t),
      deadline: AI.guessDeadline(t),
      importance: AI.guessImportance(t),
      stakeholders: AI.guessStakeholders(t),
      workHours: AI.guessHours(t)
    };
  },
  guessTitle(t) {
    if (!t) return '無題のタスク';
    const SUFS = ['資料','準備','整理','レビュー','まとめ','返信','提出','報告','分析','発表','会議','連絡','確認','作成'];
    let bestStart = -1, bestSuf = null;
    for (const suf of SUFS) {
      const idx = t.lastIndexOf(suf);
      if (idx > bestStart) { bestStart = idx; bestSuf = suf; }
    }
    if (bestSuf) {
      const before = t.slice(Math.max(0, bestStart - 6), bestStart);
      const m = before.match(/[^\s、。をでにはがの]+$/);
      const noun = m ? m[0] : '';
      const title = (noun + bestSuf).trim();
      return title.length > 14 ? title.slice(-14) : title;
    }
    const wo = t.lastIndexOf('を');
    if (wo > 0 && /^\s*(作|やる|する)/.test(t.slice(wo + 1))) {
      const prefix = t.slice(0, wo).trim();
      const cleaned = prefix.replace(/^.*(までに|以内に|までで|の)/, '').trim();
      return (cleaned || prefix.slice(-8)) + '作成';
    }
    return t.length > 14 ? t.slice(0, 12) + '…' : t;
  },
  guessDeadline(t) {
    const d = new Date();
    if (/今日/.test(t))                d.setHours(18,0,0,0);
    else if (/明日/.test(t))           { d.setDate(d.getDate()+1); d.setHours(18,0,0,0); }
    else if (/明後日/.test(t))         { d.setDate(d.getDate()+2); d.setHours(18,0,0,0); }
    else if (/今週末|金曜/.test(t))    { d.setDate(d.getDate()+((5-d.getDay()+7)%7||7)); d.setHours(18,0,0,0); }
    else if (/来週(火曜)?/.test(t))    { d.setDate(d.getDate()+7); d.setHours(18,0,0,0); }
    else                               { d.setDate(d.getDate()+1); d.setHours(18,0,0,0); }
    return d.toISOString();
  },
  guessImportance(t) {
    if (/ヤバ|やばい|まずい|至急|急ぎ|本気|本番|提出/.test(t)) return 'high';
    if (/メモ|軽く|ちょっと|あとで|サクッと/.test(t))            return 'low';
    return 'mid';
  },
  guessStakeholders(t) {
    const m = t.match(/([部課]?[長員]|チーム|顧客|お客様|クライアント|上司|先輩|後輩|営業|エンジニア|マネージャ)/g);
    if (m && m.length) return [...new Set(m)].slice(0,3).join(' / ');
    if (/会議|打ち合わせ/.test(t)) return '会議参加者';
    return '自分のみ';
  },
  guessHours(t) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*時間/);
    if (m) return Math.min(8, parseFloat(m[1]));
    if (/資料|プレゼン|分析|設計/.test(t)) return 2.5;
    if (/返信|連絡|メモ|チェック/.test(t)) return 0.5;
    if (/レビュー|まとめ/.test(t))         return 1;
    return 1.5;
  },

  // MVP #2: AIによるタスク定量化
  score(input) {
    const impMap = { low:25, mid:55, high:80 };
    const imp = impMap[input.importance] ?? 55;
    const stakeholdersN = input.stakeholders === '自分のみ'
      ? 0
      : (input.stakeholders.match(/[\/]/g) || []).length + 1;
    const wh = +input.workHours || 1;

    const weight = clamp(Math.round(imp*0.55 + Math.min(wh,5)*8 + 8), 30, 95);
    const mental = clamp(Math.round(imp*0.6 + stakeholdersN*8 + (input.title.includes('レビュー')?12:0) + 10), 25, 95);
    const escape = clamp(Math.round(80 - imp*0.5 - stakeholdersN*10 + (wh<1?15:0)), 10, 90);
    const danger = clamp(Math.round(imp*0.7 + stakeholdersN*5 + Math.max(0, 24-hoursUntil(input.deadline))*0.6), 15, 99);
    const work   = clamp(Math.round(wh*18 + 18), 15, 95);
    const total  = Math.round(weight*0.25 + mental*0.25 + (100-escape)*0.15 + danger*0.2 + work*0.15);

    const reasons = [];
    if (stakeholdersN >= 2) reasons.push({ icon:'👥', text:'関係者が多く、遅延の影響が大きい' });
    if (mental >= 70)       reasons.push({ icon:'💗', text:'心理的抵抗が高く、着手ハードルがある' });
    if (escape >= 60)       reasons.push({ icon:'🏃', text:'ただし逃げやすさはある' });
    if (danger >= 80)       reasons.push({ icon:'🔥', text:'危険度が高い、寝かせすぎ注意' });
    if (work >= 60)         reasons.push({ icon:'⌛', text:'作業量が大きい、早めの分割が無難' });
    if (!reasons.length)    reasons.push({ icon:'☕', text:'軽めのタスク、サクッと片づくよ' });

    return { scores:{weight,mental,escape,danger,work}, totalScore:total, reasons };
  },

  // MVP #3: 先延ばしアドバイス
  suggestSnooze(task) {
    const remain = hoursUntil(task.deadline);
    const buffer = (task.workHours||1)*1.4 + 0.5;
    const snooze = clamp(Math.round(remain - buffer), 0, 12);
    const reasons = [
      { icon:'👥', text:`関係者(${task.stakeholders})の確認を待つのも手` },
      { icon:'⚠', text:'今進めると手戻りになりそう' },
      { icon:'📨', text:'先に短いタスクを片づける方が効率的' }
    ];
    return { snooze, reasons };
  },

  // MVP #5: AIジャッジ
  judge(task, finish) {
    const consumed = finish.consumedPercent;
    const overdue = consumed > 100;
    const base = task.totalScore || 50;
    const points = overdue ? 0 : Math.round(base * (consumed/100));
    let badge = 'やや早出', comment = '余裕すぎたよぉ。もう少しサボってもよかった。';
    if (overdue)              { badge = '大遅刻王';     comment = '残念…完全に過ぎちゃったね。次はギリで間に合わせよう。'; }
    else if (consumed >= 95)  { badge = 'ギリギリ職人'; comment = '見事だよぉ。危なかったけど、美しく間に合ったね。'; }
    else if (consumed >= 80)  { badge = '熟成サボリ';   comment = 'いい寝かせ加減。サボリの美学を感じる。'; }
    else if (consumed >= 60)  { badge = '中堅サボリ';   comment = 'まずまず。もう少し攻めてもよかったね。'; }
    else if (consumed >= 40)  { badge = '小物サボリ';   comment = 'まだ甘い。サボリの芯を捉えにいこう。'; }
    else                      { badge = '早すぎ職人';   comment = '早っ! …サボロー的にはちょっと負け。'; }
    return { points, badge, comment, consumed, overdue };
  }
};

// ---------------- router ----------------
const Router = {
  routes: {},
  on(name, fn) { this.routes[name] = fn; },
  parse() {
    const h = location.hash || '#/home';
    const parts = h.replace(/^#\//, '').split('/');
    return { name: parts[0] || 'home', segments: parts.slice(1) };
  },
  go(hash) { location.hash = hash; },
  start() {
    window.addEventListener('hashchange', () => this.render());
    document.addEventListener('click', this._handleClick);
    this.render();
  },
  render() {
    const route = this.parse();
    const handler = this.routes[route.name] || this.routes['home'];
    const el = $('#screen');
    setHTML(el, handler(route) || '');
    el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in');
    el.scrollTop = 0;
    Router._activateNav(route.name);
    document.dispatchEvent(new CustomEvent('saboro:rendered', { detail: route }));
  },
  _activateNav(name) {
    document.querySelectorAll('.phone .nav button[data-route]').forEach(b => {
      const r = b.dataset.route || '';
      let on = false;
      if (r === '#/home' && name === 'home') on = true;
      if (r === '#/tasks' && (name === 'tasks' || name === 'task')) on = true;
      if (r === '#/ranking' && name === 'ranking') on = true;
      if (r === '#/me' && name === 'me') on = true;
      b.classList.toggle('active', on);
    });
  },
  _handleClick(e) {
    const t = e.target.closest('[data-route]');
    if (t) { e.preventDefault(); Router.go(t.dataset.route); }
  }
};

// ================================================================
// SCREENS  (MVP only)
// ================================================================
function renderTaskRow(t) {
  const remain = hoursUntil(t.deadline);
  const cls = remain < 6 ? 'pill pill-red' : remain < 24 ? 'pill pill-orange' : 'pill pill-cream';
  const overdue = remain < 0;
  return `
    <button class="task-row w-full text-left" data-testid="task-row" data-route="#/task/view/${esc(t.id)}">
      <span class="icon" style="background:${overdue?'#FFD9D5':'#FFE7AE'};color:${overdue?'#C73E2C':'#A8741A'}">
        <svg class="w-5 h-5"><use href="#i-doc"/></svg>
      </span>
      <span class="flex-1 min-w-0">
        <span class="block font-extrabold text-[13px] truncate">${esc(t.title)}</span>
        <span class="flex flex-wrap items-center gap-1 mt-1">
          <span class="${cls}">⚑ ${esc(fmtTime(t.deadline))}${overdue?' (期限切れ)':''}</span>
          ${t.status === 'in_progress' ? '<span class="pill pill-green">作業中</span>' : '<span class="pill pill-cream">寝かせ中</span>'}
        </span>
      </span>
      <span class="text-right shrink-0">
        <span class="block text-[10px] text-[#7A5E32] font-bold">サボリスコア</span>
        <span class="block text-lg font-black text-[#F2671F] leading-none">${t.totalScore || '—'}</span>
      </span>
    </button>`;
}

// ----- ① Home -----
Router.on('home', () => {
  const tasks = Store.data.tasks;
  const todayTasks = tasks.filter(t => t.status !== 'done').slice(0, 4);
  const week = Store.weeklyScore();
  const rank = Store.ranking();
  const myIdx = rank.findIndex(r => r.isMe);
  const top3 = rank.slice(0, 3);

  return `
    <div class="hero pb-3 px-4 pt-2">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-3xl font-black leading-none" style="font-family:'Zen Maru Gothic'">
            サボロー<span class="text-[#A8741A] text-base align-top">z<sup>z</sup><sup>z</sup></span>
          </h1>
          <p class="text-[12px] text-[#7A5E32] mt-1.5 font-semibold">今日も、いい感じに寝かそう。</p>
        </div>
        <svg class="w-[78px] h-[72px] -mt-1"><use href="#saboro-zzz"/></svg>
      </div>

      <div class="card mt-3 p-4 relative overflow-hidden" data-testid="weekly-score">
        <div class="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#FFF1C2] opacity-70"></div>
        <div class="relative flex items-center gap-3">
          <div class="w-14 h-14 rounded-full bg-[#FFE7AE] flex items-center justify-center badge-shadow">
            <svg class="w-9 h-9 text-[#F2671F]"><use href="#i-trophy"/></svg>
          </div>
          <div class="flex-1">
            <div class="text-[11px] font-bold text-[#A8741A]">今週のサボリスコア</div>
            <div class="flex items-end gap-2">
              <div class="text-4xl font-black leading-none" data-testid="weekly-score-value">${week}</div>
              <div class="text-[10px] text-[#7A5E32] font-bold mb-0.5">先週 ${Store.data.lastWeekScore}</div>
            </div>
          </div>
          <div class="text-center">
            <div class="text-[10px] text-[#7A5E32] font-bold">ランキング</div>
            <div class="text-xl font-black text-[#F2671F] leading-none mt-0.5">${myIdx + 1}<span class="text-xs">位</span></div>
            <div class="text-[10px] text-[#7A5E32] font-bold mt-0.5">${rank.length}人中</div>
          </div>
        </div>
      </div>
    </div>

    <div class="px-4 mt-2">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-black">今日のタスク</h2>
        <a href="#/tasks" data-route="#/tasks" class="text-[11px] font-bold text-[#A8741A]">すべて見る ›</a>
      </div>
      <div class="space-y-2" data-testid="today-tasks">
        ${todayTasks.length ? todayTasks.map(renderTaskRow).join('') :
          `<div class="card p-4 text-center text-[12px] text-[#7A5E32] font-bold" data-testid="empty-state">
            まだタスクがないよ。右下の <span class="inline-block w-5 h-5 rounded-full bg-[#FF7A3D] text-white text-center leading-5">+</span> で追加してね。
          </div>`}
      </div>
    </div>

    <div class="px-4 mt-4">
      <h2 class="text-sm font-black mb-2">サボローのひとこと</h2>
      <div class="card p-3 flex gap-2 items-start bg-[#FFF6D5]">
        <svg class="w-12 h-12 shrink-0 -mt-1"><use href="#saboro"/></svg>
        <p class="text-[12px] leading-relaxed">
          ${todayTasks.length ?
            `${esc(todayTasks[0].title)}は、まだ空気が温まってないみたい…<br/>あと<b class="text-[#F2671F]">${AI.suggestSnooze(todayTasks[0]).snooze}時間</b>くらい寝かせてもいいかもよぉ。`
            : 'まだタスクがないね。一言だけでも、サボローが整理するよぉ。'}
        </p>
      </div>
    </div>

    <div class="px-4 mt-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-black">注目ランキング</h2>
        <a href="#/ranking" data-route="#/ranking" class="text-[11px] font-bold text-[#A8741A]">もっと見る ›</a>
      </div>
      <div class="grid grid-cols-3 gap-2">
        ${top3.map(r => `
          <div class="card p-2 text-center ${r.isMe ? 'bg-[#FFF6D5]' : ''}">
            <svg class="w-12 h-12 mx-auto"><use href="#${esc(r.sprite)}"/></svg>
            <div class="text-[11px] font-bold mt-1">${esc(r.name)}</div>
            <div class="text-[10px] text-[#7A5E32]">サボリスコア</div>
            <div class="text-base font-black text-[#F2671F] leading-none mt-0.5">${r.score|0}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="h-6"></div>`;
});

// ----- task list -----
Router.on('tasks', () => {
  const tasks = Store.data.tasks;
  const active = tasks.filter(t => t.status !== 'done');
  const done   = tasks.filter(t => t.status === 'done');
  return `
    <div class="topbar"><h1>タスク</h1></div>
    <div class="px-4">
      ${active.length ? `
        <h2 class="text-[12px] font-black text-[#7A5E32] mb-2">進行中 (${active.length})</h2>
        <div class="space-y-2 mb-4">${active.map(renderTaskRow).join('')}</div>` :
        `<div class="card p-4 text-center text-[12px] text-[#7A5E32] font-bold" data-testid="empty-state">タスクがありません。</div>`}
      ${done.length ? `
        <h2 class="text-[12px] font-black text-[#7A5E32] mt-2 mb-2">完了済み (${done.length})</h2>
        <div class="space-y-2">${done.map(t => `
          <div class="task-row opacity-70" data-testid="task-row-done">
            <span class="icon" style="background:#D7F1E1;color:#1F8A52"><svg class="w-5 h-5"><use href="#i-check"/></svg></span>
            <span class="flex-1 min-w-0">
              <span class="block font-extrabold text-[13px] truncate">${esc(t.title)}</span>
              <span class="flex items-center gap-1 mt-1">
                <span class="pill pill-green">${esc((t.finish && t.finish.badge) || '完了')}</span>
                <span class="pill pill-cream">${(t.finish && t.finish.judgePoints)|0}pt</span>
              </span>
            </span>
          </div>`).join('')}</div>` : ''}
    </div>
    <div class="h-6"></div>`;
});

// ----- task sub router -----
Router.on('task', (route) => {
  const sub = route.segments[0];
  const id  = route.segments[1];
  if (sub === 'add')      return screenTaskAdd();
  if (sub === 'quantify') return screenQuantify(id);
  if (sub === 'snooze')   return screenSnooze(id);
  if (sub === 'view')     return screenTaskView(id);
  if (sub === 'finish')   return screenFinish(id);
  if (sub === 'judge')    return screenJudge(id);
  return '<div class="p-4">404</div>';
});

// ----- ② タスク追加 (MVP #1: タスク入力 — 入力 + 4項目を一画面で) -----
function screenTaskAdd() {
  const draftId = '_draft';
  let draft = Store.task(draftId);
  if (!draft) {
    draft = {
      id: draftId, title:'', inputText:'',
      deadline: new Date(Date.now()+24*3600000).toISOString(),
      stakeholders:'自分のみ', importance:'mid', workHours:1.5,
      scores:null, totalScore:null, reasons:[], status:'draft', createdAt:Date.now()
    };
    Store.upsertTask(draft);
  }

  setTimeout(() => {
    const refreshNext = () => {
      $('[data-testid="next"]').disabled = !draft.title.trim();
    };

    $('[data-testid="input-task"]').addEventListener('input', e => {
      draft.inputText = e.target.value;
      Store.upsertTask(draft);
    });
    $('[data-testid="ai-fill"]').addEventListener('click', () => {
      const text = (draft.inputText || '').trim();
      if (!text) return toast('一言入力してね');
      Object.assign(draft, AI.parseInput(text));
      Store.upsertTask(draft);
      // 同一ハッシュなので hashchange は発火しない → 明示的に再描画
      Router.render();
    });
    $('[data-testid="title"]').addEventListener('input', e => { draft.title = e.target.value; Store.upsertTask(draft); refreshNext(); });
    $('[data-testid="deadline"]').addEventListener('change', e => {
      const v = e.target.value; if (!v) return;
      draft.deadline = new Date(v).toISOString();
      Store.upsertTask(draft);
    });
    $('[data-testid="stakeholders"]').addEventListener('input', e => {
      draft.stakeholders = e.target.value || '自分のみ';
      Store.upsertTask(draft);
    });
    $('[data-testid="hours"]').addEventListener('input', e => {
      draft.workHours = clamp(parseFloat(e.target.value) || 0.5, 0.25, 12);
      Store.upsertTask(draft);
    });
    document.querySelectorAll('[data-imp]').forEach(b => b.addEventListener('click', () => {
      draft.importance = b.dataset.imp;
      Store.upsertTask(draft);
      document.querySelectorAll('[data-imp]').forEach(x => x.classList.toggle('on', x.dataset.imp === draft.importance));
    }));
    $('[data-testid="next"]').addEventListener('click', () => {
      if (!draft.title.trim()) return toast('タイトルを入力してね');
      Object.assign(draft, AI.score(draft));
      Store.upsertTask(draft);
      Router.go('#/task/quantify/' + draftId);
    });
    refreshNext();
  }, 0);

  const dlocal = (() => {
    const d = new Date(draft.deadline);
    const tz = d.getTime() - d.getTimezoneOffset() * 60000;
    return new Date(tz).toISOString().slice(0, 16);
  })();

  return `
    <div class="topbar">
      <button class="back" data-route="#/home" data-testid="back"><svg class="w-4 h-4"><use href="#i-back"/></svg></button>
      <h1>タスク追加</h1>
      <svg class="w-12 h-12 ml-auto"><use href="#saboro"/></svg>
    </div>
    <div class="px-4">
      <div class="card p-3">
        <div class="text-[11px] font-bold text-[#A8741A]">ひとこと入力</div>
        <textarea class="textarea mt-2" data-testid="input-task"
          placeholder="例: 来週火曜までに営業資料を作る">${esc(draft.inputText)}</textarea>
        <button class="btn btn-primary mt-2" data-testid="ai-fill">
          <svg class="w-4 h-4"><use href="#i-spark"/></svg> AIで埋める
        </button>
      </div>

      <h2 class="mt-4 mb-2 text-[13px] font-black flex items-center gap-1">📝 タスクの内容</h2>
      <div class="card p-3 space-y-3">
        <label class="block">
          <span class="text-[11px] font-bold text-[#7A5E32]">タイトル</span>
          <input class="input mt-1" type="text" value="${esc(draft.title)}" data-testid="title" placeholder="タスク名" />
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-[#7A5E32]">締切</span>
          <input class="input mt-1" type="datetime-local" value="${esc(dlocal)}" data-testid="deadline" />
        </label>
        <label class="block">
          <span class="text-[11px] font-bold text-[#7A5E32]">関係者</span>
          <input class="input mt-1" type="text" value="${esc(draft.stakeholders)}" data-testid="stakeholders" placeholder="例: 部長 / 営業チーム" />
        </label>
        <div>
          <span class="text-[11px] font-bold text-[#7A5E32]">遅れたらまずい度</span>
          <div class="flex gap-1.5 mt-1">
            <button class="chip ${draft.importance==='low'?'on':''}"  data-imp="low"  data-testid="imp-low">軽い</button>
            <button class="chip ${draft.importance==='mid'?'on':''}"  data-imp="mid"  data-testid="imp-mid">普通</button>
            <button class="chip ${draft.importance==='high'?'on':''}" data-imp="high" data-testid="imp-high">かなりまずい</button>
          </div>
        </div>
        <label class="block">
          <span class="text-[11px] font-bold text-[#7A5E32]">作業時間 (時間)</span>
          <input class="input mt-1" type="number" min="0.25" max="12" step="0.25" value="${draft.workHours}" data-testid="hours" />
        </label>
      </div>

      <button class="btn btn-primary mt-4" data-testid="next">
        定量化する ›
      </button>
      <div class="h-4"></div>
    </div>`;
}

// ----- ③ 定量化 + 登録 (MVP #2: AIによるタスク定量化) -----
function screenQuantify(id) {
  const t = Store.task(id);
  if (!t) { Router.go('#/home'); return ''; }
  if (!t.scores) Object.assign(t, AI.score(t));
  const snooze = AI.suggestSnooze(t);

  setTimeout(() => {
    $('[data-testid="register"]').addEventListener('click', () => {
      const realId = uid();
      const real = { ...t, id: realId, status: 'sleeping', createdAt: Date.now() };
      Store.deleteTask('_draft');
      Store.upsertTask(real);
      toast('登録したよ');
      Router.go('#/task/snooze/' + realId);
    });
    $('[data-testid="redo"]').addEventListener('click', () => Router.go('#/task/add'));
  }, 0);

  const s = t.scores;
  const pt = (val, ax) => {
    const angles = [-90, -18, 54, 126, 198];
    const a = angles[ax] * Math.PI / 180;
    const r = 80 * (val / 100);
    return [(r * Math.cos(a)).toFixed(2), (r * Math.sin(a)).toFixed(2)].join(',');
  };
  const pts = [s.weight, s.mental, s.escape, s.danger, s.work].map((v,i) => pt(v,i)).join(' ');

  return `
    <div class="topbar">
      <button class="back" data-route="#/task/add" data-testid="back"><svg class="w-4 h-4"><use href="#i-back"/></svg></button>
      <h1>定量化 & 登録</h1>
      <svg class="w-12 h-12 ml-auto"><use href="#saboro"/></svg>
    </div>

    <div class="px-4">
      <div class="card p-3">
        <div class="flex items-center gap-2">
          <div class="w-9 h-9 rounded-xl bg-[#FFE7AE] flex items-center justify-center text-[#A8741A]"><svg class="w-5 h-5"><use href="#i-doc"/></svg></div>
          <div class="flex-1 min-w-0">
            <div class="font-extrabold text-[14px] truncate" data-testid="title-display">${esc(t.title)}</div>
            <div class="text-[10px] text-[#7A5E32] font-bold">締切 ${esc(fmtTime(t.deadline))}</div>
          </div>
          <div class="text-right">
            <div class="text-3xl font-black text-[#F2671F] leading-none" data-testid="total-score">${t.totalScore}<span class="text-sm text-[#7A5E32] font-bold">/100</span></div>
            <div class="text-[10px] text-[#7A5E32] font-bold mt-0.5">サボリポテンシャル</div>
          </div>
        </div>

        <div class="mt-3 flex items-center gap-2">
          <svg viewBox="0 0 240 220" class="w-[55%] h-auto" data-testid="radar">
            <g transform="translate(120,110)">
              <g fill="none" stroke="#F0E4C8" stroke-width="1">
                <polygon points="0,-80 76.08,-24.72 46.99,64.72 -46.99,64.72 -76.08,-24.72"/>
                <polygon points="0,-60 57.06,-18.54 35.24,48.54 -35.24,48.54 -57.06,-18.54"/>
                <polygon points="0,-40 38.04,-12.36 23.50,32.36 -23.50,32.36 -38.04,-12.36"/>
                <polygon points="0,-20 19.02,-6.18 11.75,16.18 -11.75,16.18 -19.02,-6.18"/>
              </g>
              <g stroke="#F0E4C8" stroke-width="1">
                <line x1="0" y1="0" x2="0"      y2="-80"/>
                <line x1="0" y1="0" x2="76.08"  y2="-24.72"/>
                <line x1="0" y1="0" x2="46.99"  y2="64.72"/>
                <line x1="0" y1="0" x2="-46.99" y2="64.72"/>
                <line x1="0" y1="0" x2="-76.08" y2="-24.72"/>
              </g>
              <polygon points="${pts}" fill="#3FB67E" fill-opacity=".22" stroke="#3FB67E" stroke-width="2.2" stroke-linejoin="round"/>
              <g class="radar-axis">
                <text x="0"   y="-90" text-anchor="middle">タスク重さ</text>
                <text x="92"  y="-26" text-anchor="middle">心理的抵抗</text>
                <text x="60"  y="80"  text-anchor="middle">逃げやすさ</text>
                <text x="-60" y="80"  text-anchor="middle">危険度</text>
                <text x="-92" y="-26" text-anchor="middle">作業量</text>
              </g>
            </g>
          </svg>
          <ul class="flex-1 space-y-1.5 text-[12px]" data-testid="score-list">
            <li class="flex justify-between"><span>🪨 タスク重さ</span><b>${s.weight}</b></li>
            <li class="flex justify-between"><span>💗 心理抵抗</span><b>${s.mental}</b></li>
            <li class="flex justify-between"><span>🏃 逃げやすさ</span><b>${s.escape}</b></li>
            <li class="flex justify-between"><span>🔥 危険度</span><b>${s.danger}</b></li>
            <li class="flex justify-between"><span>⌛ 作業量</span><b>${s.work}</b></li>
          </ul>
        </div>
      </div>

      <h2 class="mt-4 mb-2 text-[13px] font-black flex items-center gap-1">
        <svg class="w-4 h-4 text-[#F2671F]"><use href="#i-spark"/></svg> AIの理由
      </h2>
      <div class="card divide-y divide-[#F0E4C8]" data-testid="reasons">
        ${t.reasons.map(r => `<div class="flex items-start gap-2 p-3 text-[12px]"><span>${esc(r.icon)}</span><span>${esc(r.text)}</span></div>`).join('')}
      </div>

      <div class="card p-3 mt-3 flex items-center gap-3">
        <div>
          <div class="text-[11px] text-[#A8741A] font-bold">初期サボリ予測</div>
          <div class="text-2xl font-black text-[#F2671F] leading-tight mt-1">あと${snooze.snooze}時間</div>
        </div>
        <svg class="w-12 h-12 ml-auto"><use href="#saboro"/></svg>
      </div>

      <div class="mt-4 space-y-2">
        <button class="btn btn-primary" data-testid="register">この内容で登録 ›</button>
        <button class="btn btn-ghost" data-testid="redo">やり直す</button>
      </div>
      <div class="h-4"></div>
    </div>`;
}

// ----- ④ 先延ばし提案 (MVP #3: 先延ばしアドバイス生成) -----
function screenSnooze(id) {
  const t = Store.task(id);
  if (!t) { Router.go('#/home'); return ''; }
  const snooze = AI.suggestSnooze(t);

  setTimeout(() => {
    $('[data-testid="snooze-it"]').addEventListener('click', () => {
      t.status = 'sleeping'; Store.upsertTask(t);
      toast('寝かせるよ…💤');
      Router.go('#/home');
    });
    $('[data-testid="do-it-now"]').addEventListener('click', () => {
      t.status = 'in_progress'; Store.upsertTask(t);
      Router.go('#/task/view/' + id);
    });
  }, 0);

  return `
    <div class="topbar">
      <button class="back" data-route="#/home" data-testid="back"><svg class="w-4 h-4"><use href="#i-back"/></svg></button>
      <h1>先延ばし提案</h1>
      <span class="ml-auto pill pill-cream">${esc(t.title)}</span>
    </div>
    <div class="px-4">
      <div class="card p-3 bg-gradient-to-b from-[#FFF6D5] to-white">
        <div class="flex items-center gap-2">
          <svg class="w-20 h-20"><use href="#saboro-zzz"/></svg>
          <p class="text-[12.5px] leading-relaxed font-bold">
            このタスクは、まだ着手しなくても<br/>大丈夫だよぉ。
          </p>
        </div>
      </div>

      <div class="card p-4 mt-3 flex items-center gap-3 ring-2 ring-[#FFE7AE]" data-testid="snooze-card">
        <div class="text-left">
          <div class="text-[11px] font-bold text-[#A8741A]">⏱ おすすめサボり時間</div>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-[14px] font-bold text-[#7A5E32]">あと</span>
            <span class="text-5xl font-black text-[#F2671F] leading-none" data-testid="snooze-hours">${snooze.snooze}</span>
            <span class="text-xl font-black">時間</span>
          </div>
        </div>
        <div class="ml-auto w-16 h-16 rounded-full bg-[#FFE7AE] flex items-center justify-center text-[#A8741A]">
          <svg class="w-9 h-9"><use href="#i-clock"/></svg>
        </div>
      </div>

      <h2 class="mt-4 mb-2 text-[13px] font-black flex items-center gap-1">📝 理由</h2>
      <div class="card divide-y divide-[#F0E4C8]" data-testid="snooze-reasons">
        ${snooze.reasons.map(r => `<div class="flex items-start gap-2 p-3 text-[12px]"><span>${esc(r.icon)}</span><span>${esc(r.text)}</span></div>`).join('')}
      </div>

      <div class="grid grid-cols-2 gap-2 mt-4">
        <button class="btn btn-green" data-testid="snooze-it"><svg class="w-4 h-4"><use href="#i-zzz"/></svg> 寝かせる</button>
        <button class="btn btn-primary" data-testid="do-it-now"><svg class="w-4 h-4"><use href="#i-bolt"/></svg> 今やる</button>
      </div>
      <div class="h-4"></div>
    </div>`;
}

// ----- ⑤ タスクビュー(完了報告への導線) -----
function screenTaskView(id) {
  const t = Store.task(id);
  if (!t) { Router.go('#/home'); return ''; }
  setTimeout(() => {
    $('[data-testid="goto-finish"]').addEventListener('click', () => Router.go('#/task/finish/' + id));
    $('[data-testid="goto-snooze"]').addEventListener('click', () => Router.go('#/task/snooze/' + id));
    $('[data-testid="delete-task"]').addEventListener('click', () => {
      if (confirm('削除する?')) { Store.deleteTask(id); toast('削除した'); Router.go('#/home'); }
    });
  }, 0);
  const snooze = AI.suggestSnooze(t);
  return `
    <div class="topbar">
      <button class="back" data-route="#/home" data-testid="back"><svg class="w-4 h-4"><use href="#i-back"/></svg></button>
      <h1 class="text-[16px] truncate flex-1">${esc(t.title)}</h1>
      <button class="back" data-testid="delete-task" aria-label="削除"><svg class="w-4 h-4"><use href="#i-trash"/></svg></button>
    </div>
    <div class="px-4">
      <div class="card p-3">
        <div class="flex items-center gap-2">
          <div class="w-9 h-9 rounded-xl bg-[#FFE7AE] flex items-center justify-center text-[#A8741A]"><svg class="w-5 h-5"><use href="#i-doc"/></svg></div>
          <div class="flex-1">
            <div class="font-extrabold text-[14px]" data-testid="view-title">${esc(t.title)}</div>
            <div class="text-[10px] text-[#7A5E32] font-bold">締切 ${esc(fmtTime(t.deadline))}</div>
          </div>
          <div class="text-3xl font-black text-[#F2671F] leading-none">${t.totalScore || '—'}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span class="pill pill-cream">${t.workHours}h</span>
          <span class="pill ${t.importance==='high'?'pill-red':'pill-cream'}">${esc(({low:'軽い',mid:'普通',high:'かなりまずい'})[t.importance] || '普通')}</span>
          <span class="pill pill-cream">👥 ${esc(t.stakeholders)}</span>
        </div>
      </div>

      <div class="card p-3 mt-3" data-testid="snooze-summary">
        <div class="text-[11px] text-[#A8741A] font-bold">サボロー提案</div>
        <div class="flex items-baseline gap-1.5 mt-1">
          <span class="text-[14px] font-bold text-[#7A5E32]">あと</span>
          <span class="text-3xl font-black text-[#F2671F] leading-none">${snooze.snooze}</span>
          <span class="text-base font-black">時間</span>
          <span class="ml-auto text-[10px] text-[#7A5E32] font-bold">寝かせ推奨</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-4">
        <button class="btn btn-ghost" data-testid="goto-snooze">先延ばし提案</button>
        <button class="btn btn-primary" data-testid="goto-finish">完了報告へ</button>
      </div>
      <div class="h-4"></div>
    </div>`;
}

// ----- ⑥ タスク終了 (MVP #4: タスク終了ボタン) -----
function screenFinish(id) {
  const t = Store.task(id);
  if (!t) { Router.go('#/home'); return ''; }

  setTimeout(() => {
    let mode = 'giri';
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === mode));
    }));
    $('[data-testid="judge-it"]').addEventListener('click', () => {
      const total = new Date(t.deadline).getTime() - t.createdAt;
      const used  = Date.now() - t.createdAt;
      let consumed = total > 0 ? Math.round((used / total) * 100) : 100;
      if (mode === 'sabori') consumed = clamp(consumed, 80, 99);
      if (mode === 'giri')   consumed = clamp(consumed, 95, 100);
      if (mode === 'still')  { toast('もう少し寝かせるね…'); t.status = 'sleeping'; Store.upsertTask(t); Router.go('#/home'); return; }
      const judge = AI.judge(t, { consumedPercent: consumed });
      const actualHours = +(t.workHours * (0.6 + Math.random() * 0.6)).toFixed(1);
      t.finish = { mode, consumedPercent: consumed, actualHours, finishedAt: Date.now(),
                   judgePoints: judge.points, badge: judge.badge, comment: judge.comment, overdue: judge.overdue };
      t.status = 'done';
      Store.upsertTask(t);
      Router.go('#/task/judge/' + id);
    });
  }, 0);

  return `
    <div class="topbar">
      <button class="back" data-route="#/task/view/${esc(id)}" data-testid="back"><svg class="w-4 h-4"><use href="#i-back"/></svg></button>
      <h1>タスク終了</h1>
    </div>
    <div class="px-4">
      <div class="card p-4 bg-gradient-to-b from-[#FFF6D5] to-white">
        <div class="flex items-center gap-2">
          <svg class="w-20 h-20"><use href="#saboro-zzz"/></svg>
          <div>
            <div class="font-extrabold text-[14px]">${esc(t.title)}</div>
            <span class="pill pill-green mt-1">完了!</span>
          </div>
        </div>
      </div>

      <h2 class="mt-4 mb-2 text-[13px] font-black text-center">どう終えた?</h2>
      <div class="grid grid-cols-3 gap-2" data-testid="mode-list">
        <button class="mode-card on" data-mode="giri" data-testid="mode-giri">
          <svg class="w-12 h-12"><use href="#saboro"/></svg>
          <div class="label">ギリ生還</div>
          <div class="desc">ギリギリで間に合った</div>
        </button>
        <button class="mode-card" data-mode="sabori" data-testid="mode-sabori">
          <svg class="w-12 h-12"><use href="#saboro"/></svg>
          <div class="label">サボり切った</div>
          <div class="desc">最高のサボりだった</div>
        </button>
        <button class="mode-card" data-mode="still" data-testid="mode-still">
          <svg class="w-12 h-12"><use href="#saboro-zzz"/></svg>
          <div class="label">まだ寝かせる</div>
          <div class="desc">もう少し寝かせる</div>
        </button>
      </div>

      <div class="bubble mt-3 flex items-start gap-2">
        <svg class="w-10 h-10 -mt-1"><use href="#saboro"/></svg>
        <p>終了報告をすると、AIがジャッジするよぉ。</p>
      </div>

      <button class="btn btn-primary mt-4" data-testid="judge-it">
        ジャッジを見る <svg class="w-4 h-4"><use href="#i-spark"/></svg>
      </button>
      <div class="h-4"></div>
    </div>`;
}

// ----- ⑦ AIジャッジ (MVP #5: AIジャッジ + #6: スコア算出) -----
function screenJudge(id) {
  const t = Store.task(id);
  if (!t || !t.finish) { Router.go('#/home'); return ''; }
  const f = t.finish;

  setTimeout(() => {
    $('[data-testid="back-home"]').addEventListener('click', () => Router.go('#/home'));
  }, 0);

  return `
    <div class="topbar">
      <button class="back" data-route="#/home" data-testid="back"><svg class="w-4 h-4"><use href="#i-back"/></svg></button>
      <h1>AIジャッジ</h1>
      <svg class="w-12 h-12 ml-auto"><use href="#saboro"/></svg>
    </div>
    <div class="px-4">
      <div class="card p-3 text-center bg-gradient-to-b from-[#FFF6D5] to-white">
        <div class="text-[11px] font-bold text-[#A8741A]">今回のジャッジ結果</div>
        <h2 class="text-3xl font-black mt-1 leading-tight" style="font-family:'Zen Maru Gothic'; color:#F2671F" data-testid="badge">${esc(f.badge)}</h2>
        <div class="mt-2 inline-flex items-center gap-1 bg-[#FFE7AE] rounded-full px-3 py-1 text-[11px] font-bold text-[#A8741A]">🏆 獲得</div>
        <div class="mt-2 flex items-center justify-center gap-3">
          <div class="text-5xl font-black leading-none" data-testid="points">${f.judgePoints}<span class="text-base">pt</span></div>
          <svg class="w-16 h-16"><use href="#saboro"/></svg>
        </div>
        <div class="mt-2 text-[11px] text-[#7A5E32] font-bold">
          タスクスコア <b>${t.totalScore}</b> × 締切消費 <b data-testid="consumed">${f.consumedPercent}%</b>
        </div>
      </div>

      <h2 class="mt-4 mb-2 text-[13px] font-black">📈 締切までの進み具合</h2>
      <div class="card p-3">
        <div class="text-[10px] text-[#7A5E32] font-bold flex justify-between mb-1.5">
          <span>登録</span>
          <span class="text-[#F2671F]">${f.overdue?'期限切れ':'期限内'}</span>
          <span>締切</span>
        </div>
        <div class="relative h-2.5 rounded-full bg-[#FFE7AE]">
          <div class="absolute inset-y-0 left-0 rounded-full bg-[#F2671F]" style="width:${clamp(f.consumedPercent,0,100)}%"></div>
        </div>
      </div>

      <div class="bubble mt-3 flex items-start gap-2">
        <svg class="w-12 h-12 -mt-1"><use href="#saboro"/></svg>
        <p data-testid="judge-comment">${esc(f.comment)}</p>
      </div>

      <button class="btn btn-primary mt-4" data-testid="back-home">📊 ホームに戻る</button>
      <div class="h-4"></div>
    </div>`;
}

// ----- ⑧ ランキング (MVP #7) -----
Router.on('ranking', () => {
  const rank = Store.ranking();
  const me = rank.find(r => r.isMe);
  const myIdx = rank.indexOf(me);
  const sleepers = Store.data.tasks.filter(t => t.status === 'sleeping').length;
  const activeTasks = Store.data.tasks.filter(t => t.status !== 'done' && t.id !== '_draft').length;
  const roomSpots = [
    { x: 18, bottom: 80, scale: .82, z: 4, accent: '#B9DCF7', tilt: '-2deg', line: 'まだ寝かす' },
    { x: 43, bottom: 94, scale: .94, z: 7, accent: '#FFE3B8', tilt: '1deg', line: 'あと少し' },
    { x: 66, bottom: 78, scale: .84, z: 5, accent: '#B9E5CA', tilt: '-1deg', line: '熟成中' },
    { x: 30, bottom: 38, scale: 1.08, z: 10, accent: '#FFD86E', tilt: '2deg', line: '締切の香り' },
    { x: 58, bottom: 34, scale: 1.02, z: 11, accent: '#FF92AC', tilt: '-2deg', line: '今じゃない' },
    { x: 80, bottom: 42, scale: .98, z: 9, accent: '#FFB184', tilt: '1deg', line: 'たぶん平気' }
  ];
  const roomPeople = rank.slice(0, 6).map((r, i) => ({ ...r, spot: roomSpots[i] }));

  return `
    <div class="topbar">
      <h1>先延ばしロビー<span class="text-[#A8741A] text-xs align-top">z<sup>z</sup><sup>z</sup></span></h1>
      <svg class="w-14 h-14 ml-auto"><use href="#saboro"/></svg>
    </div>
    <div class="px-4">
      <div class="saboro-room mt-1" data-testid="ranking-room">
        <div class="room-window"></div>
        <div class="room-sign">みんなで<br>先延ばし中</div>
        <div class="room-clock"></div>
        <div class="task-stack" aria-hidden="true"><span></span><span></span><span></span></div>
        ${roomPeople.map((r, i) => `
          <div class="room-avatar ${r.isMe ? 'me' : ''}"
            style="--x:${r.spot.x}%;--bottom:${r.spot.bottom}px;--scale:${r.spot.scale};--z:${r.spot.z};--accent:${r.spot.accent};--delay:${(-i * .45).toFixed(2)}s;--tilt:${r.spot.tilt};">
            <div class="room-bubble">${r.isMe ? (sleepers ? `${sleepers}件寝かせ中` : '様子見中') : r.spot.line}</div>
            <svg><use href="#${esc(r.sprite)}"/></svg>
            <span class="room-rank-badge">${i + 1}</span>
          </div>`).join('')}
        <div class="room-floor-label">
          <span>あなた <b data-testid="my-score">${me.score|0}</b>pt</span>
          <span>${activeTasks}件が床に溜まり中</span>
        </div>
      </div>

      <div class="bubble mt-3 flex items-start gap-2">
        <svg class="w-10 h-10 -mt-1"><use href="#saboro"/></svg>
        <p>${myIdx === 0 ? 'いちばん上手に寝かせてるよぉ。' : `${myIdx+1}位。<br/>この部屋の空気、まだまだ熟成できそうだよぉ。`}</p>
      </div>

      <div class="mt-3 space-y-2" data-testid="rank-list">
        ${rank.map((r,i) => `
          <div class="card rank-row-room p-2.5 flex items-center gap-2.5 ${r.isMe?'ring-2 ring-[#F2671F]':''}" data-testid="rank-row">
            <div class="w-7 h-7 rounded-full ${i<3?'bg-[#FFE7AE] text-[#A8741A]':'bg-[#F4E4B5] text-[#7A5E32]'} flex items-center justify-center text-[12px] font-black">
              ${i<3 ? '<svg class="w-4 h-4"><use href="#i-crown"/></svg>' : (i+1)}
            </div>
            <svg class="w-10 h-10"><use href="#${esc(r.sprite)}"/></svg>
            <div class="flex-1">
              <div class="font-extrabold text-[13px]">${esc(r.name)}</div>
              <div class="text-[10px] text-[#7A5E32] font-bold">サボリスコア</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-black ${r.isMe?'text-[#F2671F]':''} leading-none">${r.score|0}</div>
            </div>
          </div>`).join('')}
      </div>

      <p class="text-center text-[10px] text-[#9C8362] mt-4">毎週月曜 0:00 にリセットされるよ。</p>
      <div class="h-4"></div>
    </div>`;
});

// ----- マイページ (リセットのみ、運用補助) -----
Router.on('me', () => {
  const tasks = Store.data.tasks.filter(t => t.id !== '_draft');
  const done = tasks.filter(t => t.status === 'done').length;
  const all  = tasks.length;
  return `
    <div class="topbar"><h1>マイページ</h1></div>
    <div class="px-4">
      <div class="card p-4 flex items-center gap-3">
        <svg class="w-16 h-16"><use href="#saboro"/></svg>
        <div>
          <div class="text-[18px] font-black">${esc(Store.data.user.name)}</div>
          <div class="text-[11px] text-[#7A5E32] font-bold">サボロー歴: 1週目</div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 mt-3 text-center">
        <div class="card p-2.5"><div class="text-[10px] text-[#7A5E32] font-bold">今週のpt</div><div class="text-2xl font-black text-[#F2671F]">${Store.weeklyScore()}</div></div>
        <div class="card p-2.5"><div class="text-[10px] text-[#7A5E32] font-bold">完了タスク</div><div class="text-2xl font-black">${done}</div></div>
        <div class="card p-2.5"><div class="text-[10px] text-[#7A5E32] font-bold">登録タスク</div><div class="text-2xl font-black">${all}</div></div>
      </div>

      <div class="card mt-4 p-3">
        <div class="text-[12px] font-black mb-2">⚙️ 設定</div>
        <button class="btn btn-ghost" data-testid="reset-btn" type="button">データをリセット</button>
      </div>

      <p class="text-center text-[10px] text-[#9C8362] mt-4">v1.0.0 (MVP)</p>
    </div>`;
});

document.addEventListener('click', e => {
  if (e.target.closest('[data-testid="reset-btn"]')) {
    if (confirm('全データを消すよ。よい?')) {
      Store.reset(); toast('リセットした'); Router.go('#/home');
    }
  }
});

// boot
Store.load();
Router.start();

window.__saboro__ = { Store, AI, Router };
