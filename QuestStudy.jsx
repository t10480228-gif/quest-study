import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check, Plus, Star, Coins, Trophy, Settings as SettingsIcon,
  BookOpen, Home as HomeIcon, ChevronLeft, Lock, Flame, Sparkles,
  Trash2, Pencil
} from "lucide-react";

/* ============================================================
   QuestStudy — 夏休みの宿題をゲームにしよう
   ============================================================ */

const STORAGE_KEY = "questudy_state_v1";

/* ============================================================
   ★ Google Apps Script 連携設定
   ============================================================
   gas/Code.gs をデプロイした後、以下の2つを書き換えてください。

   GAS_URL : デプロイ時に発行された「ウェブアプリのURL」
   TOKEN   : gas/Code.gs の TOKEN と同じ文字列
   ============================================================ */

const GAS_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
const TOKEN   = "YOUR_SECRET_TOKEN";

/* ---------------- storage adapter ---------------- */
/**
 * window.storage (クリメモ専用API) の代わりに
 * Google Apps Script WebAPI を使うアダプター。
 *
 * ローカル開発時は localStorage にフォールバックする。
 */
const storage = {
  async get() {
    // ローカル開発（localhost）はlocalStorageを使う
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return { value: localStorage.getItem(STORAGE_KEY) };
    }
    const res = await fetch(`${GAS_URL}?token=${encodeURIComponent(TOKEN)}`);
    const text = await res.text();
    return { value: text === "null" ? null : text };
  },
  async set(_key, value) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      localStorage.setItem(STORAGE_KEY, value);
      return;
    }
    await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, data: value }),
    });
  },
};

/* ---------------- constants ---------------- */

const TYPE_META = {
  PAGE:   { label: "ページ", unit: "ページ", xp: 10, coin: 5,  color: "var(--c-blue)" },
  COUNT:  { label: "回数",   unit: "回",     xp: 20, coin: 10, color: "var(--c-green)" },
  SINGLE: { label: "単発",   unit: "個",     xp: 100, coin: 50, color: "var(--c-pink)" },
};

const ACHIEVEMENTS = [
  { id: "beginner",   title: "初心者",       desc: "初めて宿題を登録",     icon: "🔰", xp: 10,  coin: 5,
    cond: (d) => d.tasks.length >= 1 },
  { id: "first_clear",title: "初クリア",     desc: "初めて宿題を完了",     icon: "🏅", xp: 20,  coin: 10,
    cond: (d) => d.tasks.some(t => t.completed) },
  { id: "today_100",  title: "今日も頑張った", desc: "今日のクエスト100%", icon: "🌟", xp: 15,  coin: 10,
    cond: (d) => { const q = d.dailyQuestsByDate[todayStr()] || []; return q.length > 0 && q.every(x => x.completed); } },
  { id: "streak3",    title: "3日連続",      desc: "3日連続達成",         icon: "🔥", xp: 30,  coin: 15,
    cond: (d) => (d.user.streak || 0) >= 3 },
  { id: "streak7",    title: "7日連続",      desc: "7日連続達成",         icon: "🔥", xp: 70,  coin: 35,
    cond: (d) => (d.user.streak || 0) >= 7 },
  { id: "coco50",     title: "コツコツ",     desc: "50XP獲得",            icon: "🐢", xp: 5,   coin: 5,
    cond: (d) => d.user.xp >= 50 },
  { id: "doryoku500", title: "努力家",       desc: "500XP獲得",           icon: "💪", xp: 50,  coin: 25,
    cond: (d) => d.user.xp >= 500 },
  { id: "sansu",      title: "算数マスター", desc: "算数100ページ",       icon: "🧮", xp: 100, coin: 50,
    cond: (d) => sumByTitle(d.tasks, "算数", "PAGE") >= 100 },
  { id: "kanji",      title: "漢字博士",     desc: "漢字50枚",            icon: "📖", xp: 80,  coin: 40,
    cond: (d) => sumByTitle(d.tasks, "漢字") >= 50 },
  { id: "jiyu",       title: "自由研究完了", desc: "単発タスク達成",       icon: "🔬", xp: 60,  coin: 30,
    cond: (d) => d.tasks.some(t => t.type === "SINGLE" && t.completed) },
  { id: "master",     title: "宿題マスター", desc: "全宿題完了",           icon: "👑", xp: 200, coin: 100,
    cond: (d) => d.tasks.length > 0 && d.tasks.every(t => t.completed) },
  { id: "early",      title: "期限前達成",   desc: "締切3日前に終了",     icon: "⏰", xp: 40,  coin: 20,
    cond: (d) => d.tasks.some(t => t.completed && t.completedDate && daysBetween(t.completedDate, t.deadline) >= 3) },
];

/* ---------------- date / math utils ---------------- */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function sumByTitle(tasks, keyword, type) {
  return tasks.filter(t => t.title.includes(keyword) && (!type || t.type === type))
    .reduce((s, t) => s + t.progress, 0);
}

function cumXP(level) { return 25 * (level - 1) * (level + 2); }
function levelInfo(totalXp) {
  let level = 1;
  while (level < 99 && cumXP(level + 1) <= totalXp) level++;
  const base = cumXP(level);
  const next = cumXP(level + 1);
  return { level, into: totalXp - base, need: next - base };
}

function calcDailyGoal(task, today) {
  if (task.completed) return 0;
  const remaining = Math.max(0, task.target - task.progress);
  if (remaining <= 0) return 0;
  let daysLeft = daysBetween(today, task.deadline);
  if (daysLeft < 1) daysLeft = 1;
  return Math.ceil(remaining / daysLeft);
}

/* ---------------- default data ---------------- */

function defaultData() {
  const today = todayStr();
  return {
    user: { name: "冒険者", xp: 0, coin: 0, streak: 0, lastStreakDate: null, createdAt: today },
    tasks: [],
    dailyQuestsByDate: {},
    userAchievements: [],
    settings: { name: "冒険者", summerStart: today, summerEnd: addDays(today, 40), notification: true },
  };
}

/* ---------------- core mutation helpers (pure) ---------------- */

function ensureTodayQuests(data) {
  const today = todayStr();
  const d = structuredClone(data);
  if (!d.dailyQuestsByDate[today]) {
    const quests = [];
    for (const task of d.tasks) {
      const goal = calcDailyGoal(task, today);
      if (goal > 0) {
        quests.push({ taskId: task.id, targetAmount: goal, completedAmount: 0, completed: false });
        task.dailyGoal = goal;
      }
    }
    d.dailyQuestsByDate[today] = quests;
  }
  return d;
}

function evalAchievements(data) {
  const d = data;
  let changed = true;
  let guard = 0;
  while (changed && guard < 6) {
    changed = false; guard++;
    for (const ach of ACHIEVEMENTS) {
      if (d.userAchievements.some(a => a.achievementId === ach.id)) continue;
      if (ach.cond(d)) {
        d.userAchievements.push({ achievementId: ach.id, obtainedDate: todayStr() });
        d.user.xp += ach.xp;
        d.user.coin += ach.coin;
        changed = true;
      }
    }
  }
  return d;
}

function completeQuest(data, taskId) {
  const d = structuredClone(data);
  const today = todayStr();
  const quests = d.dailyQuestsByDate[today] || [];
  const quest = quests.find(q => q.taskId === taskId);
  if (!quest || quest.completed) return d;
  const task = d.tasks.find(t => t.id === taskId);
  if (!task) return d;

  quest.completed = true;
  quest.completedAmount = quest.targetAmount;

  const meta = TYPE_META[task.type];
  const amount = quest.targetAmount;
  task.progress = Math.min(task.target, task.progress + amount);
  const xpGain = amount * meta.xp;
  const coinGain = amount * meta.coin;
  d.user.xp += xpGain;
  d.user.coin += coinGain;

  if (task.progress >= task.target) {
    task.completed = true;
    task.completedDate = today;
  }

  const allDone = quests.length > 0 && quests.every(q => q.completed);
  if (allDone) {
    const yesterday = addDays(today, -1);
    if (d.user.lastStreakDate === yesterday) d.user.streak = (d.user.streak || 0) + 1;
    else if (d.user.lastStreakDate !== today) d.user.streak = 1;
    d.user.lastStreakDate = today;
  }

  return evalAchievements(d);
}

function addTask(data, taskInput) {
  const d = structuredClone(data);
  const meta = TYPE_META[taskInput.type];
  const target = taskInput.type === "SINGLE" ? 1 : Number(taskInput.target) || 1;
  const task = {
    id: uid(),
    title: taskInput.title.trim() || "無題の宿題",
    type: taskInput.type,
    target,
    progress: 0,
    deadline: taskInput.deadline,
    completed: false,
    completedDate: null,
    dailyGoal: 0,
    xpPerUnit: meta.xp,
    coinPerUnit: meta.coin,
    createdAt: todayStr(),
  };
  d.tasks.push(task);
  return evalAchievements(d);
}

function updateTask(data, taskId, patch) {
  const d = structuredClone(data);
  const task = d.tasks.find(t => t.id === taskId);
  if (!task) return d;
  Object.assign(task, patch);
  if (task.type === "SINGLE") task.target = 1;
  task.progress = clamp(task.progress, 0, task.target);
  task.completed = task.progress >= task.target;
  if (task.completed && !task.completedDate) task.completedDate = todayStr();
  if (!task.completed) task.completedDate = null;
  return evalAchievements(d);
}

function deleteTask(data, taskId) {
  const d = structuredClone(data);
  d.tasks = d.tasks.filter(t => t.id !== taskId);
  for (const date in d.dailyQuestsByDate) {
    d.dailyQuestsByDate[date] = d.dailyQuestsByDate[date].filter(q => q.taskId !== taskId);
  }
  return d;
}

function completeTaskDirectly(data, taskId) {
  const d = structuredClone(data);
  const task = d.tasks.find(t => t.id === taskId);
  if (!task || task.completed) return d;
  task.progress = task.target;
  task.completed = true;
  task.completedDate = todayStr();
  return evalAchievements(d);
}

/* ============================================================
   Styling
   ============================================================ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Zen+Maru+Gothic:wght@400;500;700&family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap');

      .qs-root {
        --c-bg: #FFF8EC;
        --c-navy: #1B2A4A;
        --c-navy-soft: #2C3E63;
        --c-blue: #4FB4E8;
        --c-yellow: #FFC93C;
        --c-pink: #FF6B6B;
        --c-green: #4CAF7D;
        --c-card: #FFFFFF;
        --c-ink: #2B2320;
        --c-sub: #8A7F72;
        font-family: 'Zen Maru Gothic', sans-serif;
        color: var(--c-ink);
        background: var(--c-bg);
        width: 100%;
        max-width: 420px;
        margin: 0 auto;
        min-height: 700px;
        border-radius: 28px;
        overflow: hidden;
        position: relative;
        box-shadow: 0 8px 40px rgba(27,42,74,0.18);
        display: flex;
        flex-direction: column;
      }
      .qs-display { font-family: 'M PLUS Rounded 1c', sans-serif; }
      .qs-num { font-family: 'Fredoka', sans-serif; }

      .qs-header {
        background: var(--c-navy);
        color: #fff;
        padding: 18px 20px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .qs-header h1 {
        font-size: 18px;
        letter-spacing: 0.5px;
        margin: 0;
      }
      .qs-header .qs-sub { font-size: 11px; color: #B9C4DE; margin-top: 2px; }
      .qs-icon-btn {
        background: rgba(255,255,255,0.12);
        border: none;
        color: #fff;
        width: 36px; height: 36px;
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: background .15s;
      }
      .qs-icon-btn:hover { background: rgba(255,255,255,0.22); }

      .qs-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 16px 16px 90px;
      }
      .qs-scroll::-webkit-scrollbar { width: 6px; }
      .qs-scroll::-webkit-scrollbar-thumb { background: #E3D8C6; border-radius: 4px; }

      .qs-card {
        background: var(--c-card);
        border-radius: 20px;
        padding: 16px 18px;
        box-shadow: 0 2px 10px rgba(43,35,32,0.06);
        margin-bottom: 14px;
      }

      .qs-lvbadge {
        width: 54px; height: 54px;
        border-radius: 16px;
        background: linear-gradient(145deg, var(--c-yellow), #FFA93C);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: var(--c-navy);
        font-weight: 700;
        box-shadow: 0 3px 0 #E08F1A, 0 4px 10px rgba(224,143,26,0.35);
        flex-shrink: 0;
      }
      .qs-lvbadge .lv-num { font-size: 20px; line-height: 1; }
      .qs-lvbadge .lv-tag { font-size: 9px; letter-spacing: 1px; opacity: 0.75; }

      .qs-bar-track {
        background: #EFE7D8;
        border-radius: 999px;
        height: 12px;
        overflow: hidden;
        position: relative;
      }
      .qs-bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width .5s ease;
      }
      .qs-bar-fill.xp { background: linear-gradient(90deg, var(--c-blue), #6FD0F0); }
      .qs-bar-fill.summer { background: linear-gradient(90deg, var(--c-green), #7FE0A8); }
      .qs-bar-fill.task { background: linear-gradient(90deg, var(--c-pink), #FF9B9B); }

      .qs-stat-row { display: flex; gap: 10px; margin-top: 12px; }
      .qs-pill {
        display: flex; align-items: center; gap: 6px;
        background: #FBF3E4;
        border-radius: 12px;
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 700;
      }

      .qs-section-title {
        font-family: 'M PLUS Rounded 1c', sans-serif;
        font-weight: 800;
        font-size: 15px;
        color: var(--c-navy);
        margin: 4px 0 10px;
        display: flex; align-items: center; gap: 6px;
      }

      /* --- quest ticket --- */
      .qs-ticket {
        position: relative;
        display: flex;
        align-items: center;
        background: var(--c-card);
        border-radius: 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(43,35,32,0.07);
        overflow: hidden;
      }
      .qs-ticket.done { opacity: 0.55; }
      .qs-ticket-stripe { width: 8px; align-self: stretch; flex-shrink: 0; }
      .qs-ticket-body { flex: 1; padding: 14px 8px 14px 14px; min-width: 0; }
      .qs-ticket-body .t-title {
        font-weight: 700; font-size: 14.5px; color: var(--c-ink);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .qs-ticket-body .t-title.done { text-decoration: line-through; }
      .qs-ticket-body .t-amount { font-size: 12px; color: var(--c-sub); margin-top: 2px; }
      .qs-ticket-perf {
        width: 0;
        border-left: 2px dashed #E3D8C6;
        align-self: stretch;
        margin: 8px 0;
        position: relative;
      }
      .qs-ticket-perf::before, .qs-ticket-perf::after {
        content: ''; position: absolute; left: -7px;
        width: 14px; height: 14px; border-radius: 50%;
        background: var(--c-bg);
      }
      .qs-ticket-perf::before { top: -8px; }
      .qs-ticket-perf::after { bottom: -8px; }
      .qs-stamp {
        width: 60px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
      }
      .qs-stamp-circle {
        width: 38px; height: 38px;
        border-radius: 50%;
        border: 2.5px solid #E3D8C6;
        display: flex; align-items: center; justify-content: center;
        color: transparent;
        transition: all .18s ease;
      }
      .qs-stamp-circle.checked {
        background: var(--c-green);
        border-color: var(--c-green);
        color: #fff;
        transform: scale(1.08) rotate(-8deg);
      }

      .qs-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--c-sub);
      }
      .qs-empty .emoji { font-size: 40px; margin-bottom: 8px; }

      /* bottom nav */
      .qs-nav {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        background: #fff;
        border-top: 1px solid #F0E7D8;
        display: flex;
        padding: 8px 6px calc(env(safe-area-inset-bottom, 0px) + 8px);
        z-index: 20;
      }
      .qs-nav-btn {
        flex: 1;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        background: none; border: none; cursor: pointer;
        color: #C4B9A9;
        font-size: 10.5px;
        font-family: 'Zen Maru Gothic', sans-serif;
        padding: 6px 0;
        border-radius: 12px;
        transition: color .15s;
      }
      .qs-nav-btn.active { color: var(--c-navy); }
      .qs-nav-btn.active .nav-ico-wrap { background: #FFF1D6; }
      .nav-ico-wrap { width: 32px; height: 26px; display:flex; align-items:center; justify-content:center; border-radius: 10px; }

      /* task list cards */
      .qs-task-card {
        background: var(--c-card);
        border-radius: 18px;
        padding: 14px 16px;
        margin-bottom: 12px;
        box-shadow: 0 2px 8px rgba(43,35,32,0.06);
        cursor: pointer;
        border-left: 6px solid var(--c-blue);
      }
      .qs-task-card .tt-top { display: flex; justify-content: space-between; align-items: baseline; }
      .qs-task-card .tt-title { font-weight: 700; font-size: 15px; }
      .qs-task-card .tt-pct { font-family:'Fredoka',sans-serif; font-weight: 600; font-size: 13px; color: var(--c-sub); }
      .qs-task-card .tt-sub { font-size: 12px; color: var(--c-sub); margin: 4px 0 8px; }
      .qs-task-card.completed { border-left-color: var(--c-green); opacity: 0.7; }

      .qs-fab {
        position: absolute;
        right: 18px; bottom: 84px;
        background: var(--c-navy);
        color: #fff;
        border: none;
        border-radius: 999px;
        padding: 13px 20px;
        font-weight: 700;
        font-size: 14px;
        display: flex; align-items: center; gap: 6px;
        box-shadow: 0 4px 14px rgba(27,42,74,0.4);
        cursor: pointer;
        z-index: 15;
      }

      .qs-field { margin-bottom: 16px; }
      .qs-field label {
        display: block; font-size: 12.5px; font-weight: 700; color: var(--c-navy);
        margin-bottom: 6px;
      }
      .qs-field input[type=text], .qs-field input[type=number], .qs-field input[type=date], .qs-field select {
        width: 100%;
        border: 2px solid #EFE3CF;
        background: #FFFDF8;
        border-radius: 12px;
        padding: 11px 12px;
        font-size: 14.5px;
        font-family: 'Zen Maru Gothic', sans-serif;
        color: var(--c-ink);
        box-sizing: border-box;
      }
      .qs-field input:focus, .qs-field select:focus { outline: 2px solid var(--c-blue); border-color: var(--c-blue); }
      .qs-type-grid { display: flex; gap: 8px; }
      .qs-type-opt {
        flex: 1;
        border: 2px solid #EFE3CF;
        border-radius: 12px;
        padding: 10px 4px;
        text-align: center;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        color: var(--c-sub);
        background: #FFFDF8;
      }
      .qs-type-opt.active { border-color: var(--c-navy); color: var(--c-navy); background: #FFF1D6; }

      .qs-btn-primary {
        width: 100%;
        background: var(--c-navy);
        color: #fff;
        border: none;
        border-radius: 14px;
        padding: 14px;
        font-size: 15px;
        font-weight: 700;
        font-family: 'M PLUS Rounded 1c', sans-serif;
        cursor: pointer;
        box-shadow: 0 3px 0 #0F1A30;
      }
      .qs-btn-primary:active { transform: translateY(2px); box-shadow: none; }
      .qs-btn-danger {
        width: 100%;
        background: #fff;
        color: var(--c-pink);
        border: 2px solid #FFDADA;
        border-radius: 14px;
        padding: 12px;
        font-weight: 700;
        cursor: pointer;
        margin-top: 10px;
      }

      .qs-back-header {
        display: flex; align-items: center; gap: 10px;
        padding: 16px 16px 4px;
        flex-shrink: 0;
      }
      .qs-back-header button {
        background: #FFF1D6; border: none; width: 34px; height: 34px;
        border-radius: 10px; display:flex; align-items:center; justify-content:center;
        cursor: pointer; color: var(--c-navy);
      }
      .qs-back-header h2 { font-family:'M PLUS Rounded 1c',sans-serif; font-size: 17px; color: var(--c-navy); margin:0; }

      .qs-toggle {
        width: 46px; height: 26px; border-radius: 999px; position: relative;
        background: #E3D8C6; border: none; cursor: pointer; flex-shrink: 0;
      }
      .qs-toggle.on { background: var(--c-green); }
      .qs-toggle .knob {
        position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
        background: #fff; border-radius: 50%; transition: left .15s;
      }
      .qs-toggle.on .knob { left: 23px; }

      .qs-ach-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      }
      .qs-ach-card {
        background: var(--c-card);
        border-radius: 16px;
        padding: 14px 10px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(43,35,32,0.06);
      }
      .qs-ach-card.locked { opacity: 0.55; }
      .qs-ach-card .ach-icon { font-size: 30px; margin-bottom: 6px; }
      .qs-ach-card .ach-title { font-weight: 700; font-size: 12.5px; color: var(--c-navy); }
      .qs-ach-card .ach-desc { font-size: 10.5px; color: var(--c-sub); margin-top: 2px; }

      .qs-splash {
        flex: 1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        background: linear-gradient(160deg, var(--c-navy), #26385E 60%, var(--c-navy));
        color: #fff;
      }
      .qs-splash .logo-emoji { font-size: 56px; margin-bottom: 14px; animation: qs-bounce 1.6s ease-in-out infinite; }
      .qs-splash h1 { font-family:'M PLUS Rounded 1c',sans-serif; font-size: 26px; letter-spacing: 1px; margin: 0; }
      .qs-splash p { color: #B9C4DE; font-size: 13px; margin-top: 6px; }
      @keyframes qs-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

      .qs-toast {
        position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
        background: var(--c-navy); color: #fff; padding: 10px 18px; border-radius: 999px;
        font-size: 13px; font-weight: 700; z-index: 50; display:flex; align-items:center; gap:6px;
        box-shadow: 0 6px 18px rgba(27,42,74,0.35);
        animation: qs-toast-in .25s ease;
      }
      @keyframes qs-toast-in { from { opacity:0; transform: translate(-50%,-8px); } to { opacity:1; transform: translate(-50%,0);} }

      .qs-banner {
        background: #FFF1D6;
        border-radius: 14px;
        padding: 10px 14px;
        font-size: 12.5px;
        color: #8A5B00;
        margin-bottom: 14px;
        display: flex; align-items: center; gap: 8px;
      }

      /* ---- 読み込み中インジケーター ---- */
      .qs-loading {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: linear-gradient(160deg, var(--c-navy), #26385E 60%, var(--c-navy));
        color: #fff; gap: 16px;
      }
      .qs-loading-spinner {
        width: 40px; height: 40px;
        border: 3px solid rgba(255,255,255,0.2);
        border-top-color: #fff;
        border-radius: 50%;
        animation: qs-spin .8s linear infinite;
      }
      @keyframes qs-spin { to { transform: rotate(360deg); } }
      .qs-loading p { font-size: 13px; color: #B9C4DE; margin: 0; }

      /* ---- エラー画面 ---- */
      .qs-error {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 32px 24px; text-align: center; gap: 12px;
      }
      .qs-error .err-icon { font-size: 44px; }
      .qs-error h2 { font-size: 16px; color: var(--c-navy); margin: 0; }
      .qs-error p { font-size: 12.5px; color: var(--c-sub); margin: 0; line-height: 1.7; }
    `}</style>
  );
}

/* ============================================================
   Small shared bits
   ============================================================ */

function BottomNav({ screen, go }) {
  const items = [
    { id: "home", label: "ホーム", Icon: HomeIcon },
    { id: "tasks", label: "宿題一覧", Icon: BookOpen },
    { id: "achievements", label: "実績", Icon: Trophy },
    { id: "settings", label: "設定", Icon: SettingsIcon },
  ];
  return (
    <nav className="qs-nav">
      {items.map(({ id, label, Icon }) => (
        <button key={id} className={"qs-nav-btn" + (screen === id ? " active" : "")} onClick={() => go(id)}>
          <span className="nav-ico-wrap"><Icon size={17} /></span>
          {label}
        </button>
      ))}
    </nav>
  );
}

function BackHeader({ title, onBack }) {
  return (
    <div className="qs-back-header">
      <button onClick={onBack}><ChevronLeft size={18} /></button>
      <h2>{title}</h2>
    </div>
  );
}

/* ============================================================
   Splash / Loading / Error
   ============================================================ */

function Splash() {
  return (
    <div className="qs-splash">
      <div className="logo-emoji">⚔️📚</div>
      <h1 className="qs-display">QuestStudy</h1>
      <p>夏休みの宿題をゲームにしよう</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="qs-loading">
      <div className="qs-loading-spinner" />
      <p>データを読み込んでいます…</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div className="qs-error">
      <div className="err-icon">⚠️</div>
      <h2>接続エラー</h2>
      <p>{message}</p>
      <button className="qs-btn-primary" style={{ maxWidth: 200 }} onClick={onRetry}>
        もう一度試す
      </button>
    </div>
  );
}

/* ============================================================
   Home
   ============================================================ */

function Home({ data, onCompleteQuest, go, toast }) {
  const today = todayStr();
  const quests = data.dailyQuestsByDate[today] || [];
  const li = levelInfo(data.user.xp);
  const xpPct = li.need > 0 ? clamp((li.into / li.need) * 100, 0, 100) : 100;

  const summerStart = data.settings.summerStart;
  const summerEnd = data.settings.summerEnd;
  const totalDays = Math.max(1, daysBetween(summerStart, summerEnd));
  const elapsed = clamp(daysBetween(summerStart, today), 0, totalDays);
  const summerPct = Math.round((elapsed / totalDays) * 100);

  let pendingXp = 0, pendingCoin = 0;
  for (const q of quests) {
    if (q.completed) continue;
    const task = data.tasks.find(t => t.id === q.taskId);
    if (!task) continue;
    const meta = TYPE_META[task.type];
    pendingXp += q.targetAmount * meta.xp;
    pendingCoin += q.targetAmount * meta.coin;
  }

  const doneCount = quests.filter(q => q.completed).length;

  return (
    <>
      <div className="qs-header">
        <div>
          <h1 className="qs-display">QuestStudy</h1>
          <div className="qs-sub">{data.settings.name} の冒険記録</div>
        </div>
        <button className="qs-icon-btn" onClick={() => go("settings")}>
          <SettingsIcon size={17} />
        </button>
      </div>
      <div className="qs-scroll">
        <div className="qs-card">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="qs-lvbadge">
              <div className="lv-num qs-num">Lv.{li.level}</div>
              <div className="lv-tag">LEVEL</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--c-sub)", marginBottom: 4 }}>
                <span>経験値</span>
                <span className="qs-num" style={{ fontWeight: 700, color: "var(--c-ink)" }}>{li.into} / {li.need}</span>
              </div>
              <div className="qs-bar-track">
                <div className="qs-bar-fill xp" style={{ width: xpPct + "%" }} />
              </div>
            </div>
          </div>
          <div className="qs-stat-row">
            <div className="qs-pill"><Coins size={15} color="#E0A400" /> {data.user.coin}</div>
            <div className="qs-pill"><Flame size={15} color="#FF6B6B" /> {data.user.streak || 0}日連続</div>
          </div>
        </div>
        <div className="qs-card">
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: "var(--c-navy)" }}>🏖️ 夏休み進捗</span>
            <span className="qs-num" style={{ fontWeight: 700 }}>{summerPct}%</span>
          </div>
          <div className="qs-bar-track">
            <div className="qs-bar-fill summer" style={{ width: summerPct + "%" }} />
          </div>
        </div>

        {data.settings.notification && quests.length > 0 && doneCount < quests.length && (
          <div className="qs-banner">🔔 今日のクエストが{quests.length - doneCount}個残っています！</div>
        )}

        <div className="qs-section-title"><Sparkles size={15} /> 今日のクエスト</div>

        {quests.length === 0 && (
          <div className="qs-empty">
            <div className="emoji">🎒</div>
            {data.tasks.length === 0 ? "まだ宿題が登録されていません" : "今日のクエストはありません"}
          </div>
        )}

        {quests.map(q => {
          const task = data.tasks.find(t => t.id === q.taskId);
          if (!task) return null;
          const meta = TYPE_META[task.type];
          return (
            <div key={q.taskId} className={"qs-ticket" + (q.completed ? " done" : "")}>
              <div className="qs-ticket-stripe" style={{ background: meta.color }} />
              <div className="qs-ticket-body">
                <div className={"t-title" + (q.completed ? " done" : "")}>{task.title}</div>
                <div className="t-amount">{q.targetAmount}{meta.unit}</div>
              </div>
              <div className="qs-ticket-perf" />
              <button
                className="qs-stamp"
                disabled={q.completed}
                onClick={() => { onCompleteQuest(task.id); toast(`+${q.targetAmount * meta.xp}XP ・ +${q.targetAmount * meta.coin}コイン`); }}
              >
                <span className={"qs-stamp-circle" + (q.completed ? " checked" : "")}>
                  <Check size={20} />
                </span>
              </button>
            </div>
          );
        })}

        {quests.length > 0 && (
          <div className="qs-card" style={{ marginTop: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--c-navy)", marginBottom: 8 }}>今日獲得予定</div>
            <div className="qs-stat-row" style={{ marginTop: 0 }}>
              <div className="qs-pill"><Star size={14} color="#4FB4E8" /> XP {pendingXp}</div>
              <div className="qs-pill"><Coins size={14} color="#E0A400" /> コイン {pendingCoin}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Task List
   ============================================================ */

function TaskList({ data, go, openTask }) {
  const meta = t => TYPE_META[t.type];
  return (
    <>
      <div className="qs-header">
        <div><h1 className="qs-display">宿題一覧</h1></div>
      </div>
      <div className="qs-scroll">
        {data.tasks.length === 0 && (
          <div className="qs-empty">
            <div className="emoji">📚</div>まだ宿題がありません<br />右下の＋から追加しよう
          </div>
        )}
        {data.tasks.map(t => {
          const pct = Math.round((t.progress / t.target) * 100);
          return (
            <div key={t.id} className={"qs-task-card" + (t.completed ? " completed" : "")}
              style={{ borderLeftColor: meta(t).color }}
              onClick={() => openTask(t.id)}>
              <div className="tt-top">
                <div className="tt-title">{t.title}</div>
                <div className="tt-pct">{t.completed ? "完了" : pct + "%"}</div>
              </div>
              <div className="tt-sub">{t.progress} / {t.target} {meta(t).unit}</div>
              <div className="qs-bar-track">
                <div className="qs-bar-fill task" style={{ width: pct + "%" }} />
              </div>
            </div>
          );
        })}
      </div>
      <button className="qs-fab" onClick={() => go("taskForm")}>
        <Plus size={18} />宿題追加
      </button>
    </>
  );
}

/* ============================================================
   Task Form (create / edit)
   ============================================================ */

function TaskForm({ initial, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [type, setType] = useState(initial?.type || "PAGE");
  const [target, setTarget] = useState(initial?.target || 10);
  const [deadline, setDeadline] = useState(initial?.deadline || addDays(todayStr(), 14));

  const meta = TYPE_META[type];
  const totalXp = type === "SINGLE" ? meta.xp : (Number(target) || 0) * meta.xp;
  const totalCoin = type === "SINGLE" ? meta.coin : (Number(target) || 0) * meta.coin;

  return (
    <>
      <BackHeader title={initial ? "宿題編集" : "宿題登録"} onBack={onCancel} />
      <div className="qs-scroll">
        <div className="qs-field">
          <label>タイトル</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：算数ドリル" />
        </div>
        <div className="qs-field">
          <label>種類</label>
          <div className="qs-type-grid">
            {Object.entries(TYPE_META).map(([key, m]) => (
              <div key={key} className={"qs-type-opt" + (type === key ? " active" : "")} onClick={() => setType(key)}>
                {m.label}
              </div>
            ))}
          </div>
        </div>
        {type !== "SINGLE" && (
          <div className="qs-field">
            <label>数量（{meta.unit}）</label>
            <input type="number" min="1" value={target} onChange={e => setTarget(e.target.value)} />
          </div>
        )}
        <div className="qs-field">
          <label>締切</label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
        <div className="qs-card" style={{ background: "#FFF8EC" }}>
          <div style={{ fontSize: 12.5, color: "var(--c-sub)", marginBottom: 6 }}>獲得予定（自動計算）</div>
          <div className="qs-stat-row" style={{ marginTop: 0 }}>
            <div className="qs-pill"><Star size={14} color="#4FB4E8" /> XP {totalXp}</div>
            <div className="qs-pill"><Coins size={14} color="#E0A400" /> コイン {totalCoin}</div>
          </div>
        </div>
        <button className="qs-btn-primary" onClick={() => onSave({ title, type, target, deadline })}>
          {initial ? "更新する" : "保存する"}
        </button>
        {initial && (
          <button className="qs-btn-danger" onClick={onDelete}>
            <Trash2 size={14} style={{ verticalAlign: -2 }} /> この宿題を削除
          </button>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Task Detail
   ============================================================ */

function TaskDetail({ task, onBack, onEdit, onComplete }) {
  const meta = TYPE_META[task.type];
  const pct = Math.round((task.progress / task.target) * 100);
  const today = todayStr();
  const goal = calcDailyGoal(task, today);
  const daysLeft = Math.max(0, daysBetween(today, task.deadline));

  return (
    <>
      <BackHeader title="宿題詳細" onBack={onBack} />
      <div className="qs-scroll">
        <div className="qs-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{task.title}</div>
              <div style={{ fontSize: 12, color: "var(--c-sub)", marginTop: 2 }}>{meta.label}タスク</div>
            </div>
            <button className="qs-icon-btn" style={{ background: "#FFF1D6", color: "var(--c-navy)" }} onClick={onEdit}>
              <Pencil size={15} />
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span>進捗</span>
              <span className="qs-num" style={{ fontWeight: 700 }}>{task.progress} / {task.target} {meta.unit}</span>
            </div>
            <div className="qs-bar-track">
              <div className="qs-bar-fill task" style={{ width: pct + "%" }} />
            </div>
          </div>
          <div className="qs-stat-row" style={{ flexWrap: "wrap" }}>
            <div className="qs-pill">📅 締切 {task.deadline}</div>
            <div className="qs-pill">⏳ 残り{daysLeft}日</div>
          </div>
          {!task.completed && (
            <div className="qs-banner" style={{ marginTop: 12, marginBottom: 0 }}>
              📌 今日やる量の目安：{goal}{meta.unit}
            </div>
          )}
        </div>
        <div className="qs-card">
          <div style={{ fontSize: 12.5, color: "var(--c-sub)", marginBottom: 6 }}>この宿題の報酬（単位あたり）</div>
          <div className="qs-stat-row" style={{ marginTop: 0 }}>
            <div className="qs-pill"><Star size={14} color="#4FB4E8" /> {meta.xp} XP</div>
            <div className="qs-pill"><Coins size={14} color="#E0A400" /> {meta.coin} コイン</div>
          </div>
        </div>
        {!task.completed ? (
          <button className="qs-btn-primary" onClick={onComplete}>✅ 宿題を完了にする</button>
        ) : (
          <div className="qs-empty" style={{ padding: 20 }}>🎉 完了済み！（{task.completedDate}）</div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Achievements
   ============================================================ */

function Achievements({ data }) {
  const obtained = new Set(data.userAchievements.map(a => a.achievementId));
  return (
    <>
      <div className="qs-header">
        <h1 className="qs-display">実績</h1>
      </div>
      <div className="qs-scroll">
        <div style={{ fontSize: 12.5, color: "var(--c-sub)", marginBottom: 14 }}>
          {obtained.size} / {ACHIEVEMENTS.length} 個獲得
        </div>
        <div className="qs-ach-grid">
          {ACHIEVEMENTS.map(a => {
            const got = obtained.has(a.id);
            const rec = data.userAchievements.find(x => x.achievementId === a.id);
            return (
              <div key={a.id} className={"qs-ach-card" + (got ? "" : " locked")}>
                <div className="ach-icon">{got ? a.icon : <Lock size={26} color="#C4B9A9" />}</div>
                <div className="ach-title">{got ? a.title : "？？？"}</div>
                <div className="ach-desc">{got ? (rec?.obtainedDate || a.desc) : "未獲得"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Settings
   ============================================================ */

function Settings({ settings, onSave, onReset }) {
  const [name, setName] = useState(settings.name);
  const [start, setStart] = useState(settings.summerStart);
  const [end, setEnd] = useState(settings.summerEnd);
  const [notif, setNotif] = useState(settings.notification);

  return (
    <>
      <div className="qs-header">
        <h1 className="qs-display">設定</h1>
      </div>
      <div className="qs-scroll">
        <div className="qs-field">
          <label>名前</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="qs-field">
          <label>夏休み開始</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="qs-field">
          <label>夏休み終了</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <div className="qs-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>アプリ内リマインダー</div>
            <div style={{ fontSize: 11.5, color: "var(--c-sub)", marginTop: 2 }}>ホーム画面に残りクエストを表示</div>
          </div>
          <button className={"qs-toggle" + (notif ? " on" : "")} onClick={() => setNotif(!notif)}>
            <span className="knob" />
          </button>
        </div>
        <button className="qs-btn-primary" onClick={() => onSave({ name, summerStart: start, summerEnd: end, notification: notif })}>
          保存する
        </button>
        <button className="qs-btn-danger" onClick={onReset}>
          <Trash2 size={14} style={{ verticalAlign: -2 }} /> データをリセット
        </button>
      </div>
    </>
  );
}

/* ============================================================
   App root
   ============================================================ */

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [data, setData] = useState(null);
  const [screen, setScreen] = useState("splash");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);
  const saveTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
  }, []);

  // --------------------------------------------------------
  // ★ データ読み込み（window.storage → GAS fetch に差し替え）
  // --------------------------------------------------------
  const loadData = useCallback(async () => {
    setLoadError(null);
    setLoaded(false);
    setScreen("loading");
    try {
      const res = await storage.get();
      let d = null;
      if (res?.value) {
        try { d = JSON.parse(res.value); } catch { d = null; }
      }
      if (!d) d = defaultData();
      d = ensureTodayQuests(d);
      setData(d);
      setLoaded(true);
      setTimeout(() => setScreen("home"), 800);
    } catch (e) {
      setLoadError("サーバーへの接続に失敗しました。\nWi-Fiを確認してもう一度お試しください。");
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --------------------------------------------------------
  // ★ データ保存（window.storage → GAS fetch に差し替え）
  //    連続操作で何度も叩かないよう 1.5秒デバウンス
  // --------------------------------------------------------
  useEffect(() => {
    if (!loaded || !data) return;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify(data));
      } catch {
        showToast("⚠️ 保存に失敗しました");
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [data, loaded, showToast]);

  const go = (s) => setScreen(s);

  const handleCompleteQuest = (taskId) => {
    setData(prev => completeQuest(prev, taskId));
  };

  const handleCreateTask = (input) => {
    setData(prev => {
      let d = addTask(prev, input);
      d = ensureTodayQuestsForce(d);
      return d;
    });
    setScreen("tasks");
  };

  const handleUpdateTask = (input) => {
    setData(prev => {
      let d = updateTask(prev, selectedTaskId, {
        title: input.title.trim() || "無題の宿題",
        type: input.type,
        target: input.type === "SINGLE" ? 1 : Number(input.target) || 1,
        deadline: input.deadline,
      });
      d = ensureTodayQuestsForce(d);
      return d;
    });
    setScreen("taskDetail");
  };

  function ensureTodayQuestsForce(d0) {
    const d = structuredClone(d0);
    const today = todayStr();
    const existing = d.dailyQuestsByDate[today] || [];
    const existingMap = new Map(existing.map(q => [q.taskId, q]));
    const rebuilt = [];
    for (const task of d.tasks) {
      const prevQ = existingMap.get(task.id);
      if (prevQ?.completed) { rebuilt.push(prevQ); continue; }
      const goal = calcDailyGoal(task, today);
      if (goal > 0) {
        rebuilt.push({ taskId: task.id, targetAmount: goal, completedAmount: 0, completed: false });
        task.dailyGoal = goal;
      }
    }
    d.dailyQuestsByDate[today] = rebuilt;
    return d;
  }

  const handleDeleteTask = () => {
    setData(prev => deleteTask(prev, selectedTaskId));
    setSelectedTaskId(null);
    setScreen("tasks");
  };

  const handleCompleteTaskDirect = () => {
    setData(prev => completeTaskDirectly(prev, selectedTaskId));
  };

  const handleSaveSettings = (s) => {
    setData(prev => ({ ...prev, settings: s }));
    showToast("設定を保存しました");
  };

  const handleReset = () => {
    if (!window.confirm("本当にすべてのデータをリセットしますか？")) return;
    const fresh = ensureTodayQuests(defaultData());
    setData(fresh);
    setScreen("home");
  };

  const selectedTask = data?.tasks.find(t => t.id === selectedTaskId) || null;

  return (
    <div className="qs-root">
      <GlobalStyle />

      {/* トースト（保存中インジケーター兼用） */}
      {toastMsg && (
        <div className="qs-toast"><Sparkles size={14} />{toastMsg}</div>
      )}
      {saving && !toastMsg && (
        <div className="qs-toast" style={{ background: "rgba(27,42,74,0.7)", fontSize: 12 }}>
          ☁️ 保存中…
        </div>
      )}

      {/* 画面ルーティング */}
      {screen === "splash"  && <Splash />}
      {screen === "loading" && <LoadingScreen />}
      {screen === "error"   && (
        <ErrorScreen message={loadError} onRetry={loadData} />
      )}

      {loaded && data && screen === "home" && (
        <Home data={data} onCompleteQuest={handleCompleteQuest} go={go} toast={showToast} />
      )}
      {loaded && data && screen === "tasks" && (
        <TaskList data={data} go={go} openTask={(id) => { setSelectedTaskId(id); setScreen("taskDetail"); }} />
      )}
      {loaded && data && screen === "taskForm" && (
        <TaskForm initial={null} onSave={handleCreateTask} onCancel={() => setScreen("tasks")} />
      )}
      {loaded && data && screen === "taskEdit" && selectedTask && (
        <TaskForm initial={selectedTask} onSave={handleUpdateTask} onCancel={() => setScreen("taskDetail")} onDelete={handleDeleteTask} />
      )}
      {loaded && data && screen === "taskDetail" && selectedTask && (
        <TaskDetail task={selectedTask} onBack={() => setScreen("tasks")} onEdit={() => setScreen("taskEdit")} onComplete={handleCompleteTaskDirect} />
      )}
      {loaded && data && screen === "achievements" && (
        <Achievements data={data} />
      )}
      {loaded && data && screen === "settings" && (
        <Settings settings={data.settings} onSave={handleSaveSettings} onReset={handleReset} />
      )}

      {/* エラー時は再試行ボタンのみ表示 */}
      {screen === "error" && loadError && (
        <ErrorScreen message={loadError} onRetry={loadData} />
      )}

      {loaded && data &&
        screen !== "splash" && screen !== "loading" && screen !== "error" &&
        screen !== "taskForm" && screen !== "taskEdit" && screen !== "taskDetail" && (
        <BottomNav screen={screen} go={setScreen} />
      )}
    </div>
  );
}
