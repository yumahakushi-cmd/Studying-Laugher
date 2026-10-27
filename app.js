// 画面の操作、クイズ、履歴保存を担当するJavaScriptです。
(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const languageSelect = $("#languageSelect");
  const quizPanel = $("#quizPanel");
  const wordsPanel = $("#wordsPanel");
  const importPanel = $("#importPanel");
  const wordImportFile = $("#wordImportFile");
  const importWordsButton = $("#importWordsButton");
  const importStatus = $("#importStatus");
  const questionArea = $("#questionArea");
  const feedback = $("#feedback");
  const nextButton = $("#nextButton");
  const questionCounter = $("#questionCounter");
  const wordList = $("#wordList");
  const wordSearch = $("#wordSearch");
  const languageNames = { en: "英語", de: "ドイツ語", it: "イタリア語" };
  const STORAGE_KEY = "kotobaTrainerData_v1";

  let mode = "quiz";
  let currentWord = null;
  let options = [];
  let answered = false;
  let sessionCount = 0;
  let reviewQueue = [];

  // localStorageの読み込みに失敗してもアプリ自体は使えるようにする
  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        stats: parsed.stats || {},
        history: Array.isArray(parsed.history) ? parsed.history : [],
        mistakes: parsed.mistakes || {},
        customWords: {
          en: Array.isArray(parsed.customWords?.en) ? parsed.customWords.en : [],
          de: Array.isArray(parsed.customWords?.de) ? parsed.customWords.de : [],
          it: Array.isArray(parsed.customWords?.it) ? parsed.customWords.it : []
        }
      };
    } catch (error) {
      console.warn("保存データを読み込めませんでした", error);
      return { stats: {}, history: [], mistakes: {}, customWords: { en: [], de: [], it: [] } };
    }
  }
  let data = loadData();

  function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (error) { console.warn("データを保存できませんでした", error); }
  }
  function currentLang() { return languageSelect.value; }
  // 初期単語は words.js、追加単語は端末内の localStorage から読み込みます。
  function wordsForLang() {
    const lang = currentLang();
    const builtIn = window.WORDS[lang] || [];
    const added = (data.customWords && data.customWords[lang]) || [];
    return builtIn.concat(added);
  }
  function wordKey(word) { return `${currentLang()}::${word.word}`; }
  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function setMode(newMode) {
    mode = newMode;
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    wordsPanel.hidden = mode !== "words";
    importPanel.hidden = mode !== "import";
    quizPanel.hidden = mode !== "quiz" && mode !== "review";
    if (mode === "words") renderWordList();
    else if (mode === "import") return;
    else if (mode === "review") startQuestion(true);
    else startQuestion(false);
  }

  function startQuestion(reviewOnly = false) {
    answered = false;
    feedback.innerHTML = "";
    nextButton.hidden = true;
    const allWords = wordsForLang();
    reviewQueue = allWords.filter((word) => data.mistakes[wordKey(word)]);
    let pool = reviewOnly ? reviewQueue : allWords;
    questionCounter.textContent = reviewOnly
      ? `間違い復習 · ${reviewQueue.length}語`
      : `第 ${sessionCount + 1} 問 · ${languageNames[currentLang()]}`;

    if (!pool.length) {
      currentWord = null;
      questionArea.innerHTML = `<div class="word-prompt"><h2>${reviewOnly ? "復習する単語はありません 🎉" : "単語がありません"}</h2><p class="hint">${reviewOnly ? "クイズで間違えた単語がここに追加されます。" : "words.js に単語データを追加してください。"}</p></div>`;
      return;
    }
    // 直前と同じ単語が続きにくいよう、可能なら別の単語を選ぶ
    const candidates = pool.filter((word) => !currentWord || word.word !== currentWord.word);
    currentWord = (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length || pool.length))];
    const wrongOptions = shuffle(allWords.filter((word) => word.word !== currentWord.word)).slice(0, 3);
    options = shuffle([currentWord, ...wrongOptions]);
    renderQuestion();
  }

  function renderQuestion() {
    const prompt = currentWord;
    questionArea.innerHTML = `
      <div class="word-prompt">
        <p class="eyebrow">次の単語の意味は？</p>
        <h2>${escapeHTML(prompt.word)}</h2>
        <p class="hint">${escapeHTML(prompt.pos)}</p>
      </div>
      <div class="options">
        ${options.map((option, index) => `
          <button class="option-button" data-answer="${escapeHTML(option.word)}">
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span>${escapeHTML(option.meaning)}</span>
          </button>`).join("")}
      </div>`;
    questionArea.querySelectorAll(".option-button").forEach((button) => {
      button.addEventListener("click", () => answerQuestion(button.dataset.answer));
    });
  }

  function answerQuestion(selectedWord) {
    if (answered || !currentWord) return;
    answered = true;
    const correct = selectedWord === currentWord.word;
    const key = wordKey(currentWord);
    const stat = data.stats[currentLang()] || { attempts: 0, correct: 0, learned: [] };
    stat.attempts += 1;
    if (correct) {
      stat.correct += 1;
      // 正解できたら復習対象から外す
      delete data.mistakes[key];
    } else {
      data.mistakes[key] = { word: currentWord.word, lang: currentLang(), lastWrong: Date.now() };
    }
    if (!stat.learned.includes(currentWord.word)) stat.learned.push(currentWord.word);
    data.stats[currentLang()] = stat;
    data.history.unshift({
      lang: currentLang(), word: currentWord.word, meaning: currentWord.meaning,
      correct, selected: (options.find((item) => item.word === selectedWord) || {}).meaning || "",
      time: Date.now()
    });
    data.history = data.history.slice(0, 100);
    saveData();
    questionArea.querySelectorAll(".option-button").forEach((button) => {
      button.disabled = true;
      if (button.dataset.answer === currentWord.word) button.classList.add("correct");
      else if (button.dataset.answer === selectedWord) button.classList.add("incorrect");
    });
    feedback.innerHTML = `
      <div class="result ${correct ? "good" : "bad"}">${correct ? "正解！ 🎉" : "不正解。正解は「" + escapeHTML(currentWord.meaning) + "」です。"}</div>
      <p class="explanation">${correct ? "よくできました！" : "単語と日本語訳をセットで確認しましょう。"}</p>
      <div class="example"><p><strong>例文：</strong>${escapeHTML(currentWord.example)}</p><p>${escapeHTML(currentWord.exampleJa)}</p></div>`;
    nextButton.hidden = false;
    nextButton.textContent = mode === "review" ? "次の復習へ" : "次の問題へ";
    sessionCount++;
    renderStats();
    renderHistory();
    if (mode === "review" && !Object.keys(data.mistakes).some((mistakeKey) => mistakeKey.startsWith(currentLang() + "::"))) {
      nextButton.textContent = "復習完了！クイズへ";
    }
  }

  function renderStats() {
    const stat = data.stats[currentLang()] || { attempts: 0, correct: 0, learned: [] };
    $("#learnedStat").textContent = stat.learned.length;
    $("#accuracyStat").textContent = stat.attempts ? `${Math.round(stat.correct / stat.attempts * 100)}%` : "—";
    $("#answerCount").textContent = `回答 ${stat.attempts} 回`;
    $("#reviewStat").textContent = wordsForLang().filter((word) => data.mistakes[wordKey(word)]).length;
    $("#streakPill").textContent = stat.attempts ? `${stat.attempts} 回回答済み` : "まずは1問！";
  }

  function renderHistory() {
    const recent = data.history.slice(0, 8);
    $("#historyList").innerHTML = recent.length ? recent.map((item) => `
      <div class="history-item">
        <div><strong>${escapeHTML(item.word)} <span class="muted">· ${escapeHTML(languageNames[item.lang] || item.lang)}</span></strong>
          <p>${escapeHTML(item.meaning)} · ${new Date(item.time).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
        <span class="history-result ${item.correct ? "good" : "bad"}">${item.correct ? "正解" : "不正解"}</span>
      </div>`).join("") : '<p class="muted">まだ学習履歴がありません。</p>';
  }

  function renderWordList() {
    const query = wordSearch.value.trim().toLocaleLowerCase();
    const list = wordsForLang().filter((word) =>
      `${word.word} ${word.meaning} ${word.example}`.toLocaleLowerCase().includes(query));
    $("#wordCount").textContent = `${list.length}語`;
    wordList.innerHTML = list.map((word) => `
      <article class="word-item">
        <div class="word-item-top"><div><strong>${escapeHTML(word.word)}</strong><p>${escapeHTML(word.meaning)}</p></div><span class="part-of-speech">${escapeHTML(word.pos)}</span></div>
        <div class="example"><p>${escapeHTML(word.example)}</p><p>${escapeHTML(word.exampleJa)}</p></div>
      </article>`).join("") || '<p class="muted">該当する単語がありません。</p>';
  }

  // JSON全体を先に検証してから保存し、途中までの取り込みを防ぎます。
  function validateImportFile(parsed) {
    if (!parsed || typeof parsed !== "object" || !parsed.words || typeof parsed.words !== "object") {
      throw new Error('JSONの最上位に "words" オブジェクトが必要です。サンプルJSONを確認してください。');
    }
    const normalized = { en: [], de: [], it: [] };
    const languages = ["en", "de", "it"];
    let total = 0;
    for (const lang of languages) {
      const list = parsed.words[lang] === undefined ? [] : parsed.words[lang];
      if (!Array.isArray(list)) throw new Error(`${lang} の値は単語の配列にしてください。`);
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const required = ["word", "meaning", "pos", "example", "exampleJa"];
        if (!item || typeof item !== "object" || required.some((key) => typeof item[key] !== "string" || !item[key].trim())) {
          throw new Error(`${lang} の ${i + 1}番目の単語に必要な項目がありません。word / meaning / pos / example / exampleJa を確認してください。`);
        }
        normalized[lang].push({
          word: item.word.trim(), meaning: item.meaning.trim(), pos: item.pos.trim(),
          example: item.example.trim(), exampleJa: item.exampleJa.trim()
        });
        total++;
        if (total > 5000) throw new Error("一度に取り込めるのは最大5000語です。ファイルを分けてください。");
      }
    }
    if (total === 0) throw new Error("取り込む単語が見つかりません。words.en / words.de / words.it に単語を入れてください。");
    return normalized;
  }

  importWordsButton.addEventListener("click", async () => {
    const file = wordImportFile.files && wordImportFile.files[0];
    if (!file) {
      importStatus.textContent = "先にJSONファイルを選択してください。";
      importStatus.className = "import-status error";
      return;
    }
    importWordsButton.disabled = true;
    importStatus.textContent = "ファイルを確認しています…";
    importStatus.className = "import-status";
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = validateImportFile(parsed);
      let addedCount = 0;
      let skippedCount = 0;
      for (const lang of ["en", "de", "it"]) {
        if (!Array.isArray(data.customWords[lang])) data.customWords[lang] = [];
        const existing = new Set([...(window.WORDS[lang] || []), ...data.customWords[lang]].map((word) => word.word.trim().toLocaleLowerCase()));
        for (const word of incoming[lang]) {
          const key = word.word.toLocaleLowerCase();
          if (existing.has(key)) { skippedCount++; continue; }
          data.customWords[lang].push(word);
          existing.add(key);
          addedCount++;
        }
      }
      saveData();
      renderStats();
      renderHistory();
      importStatus.textContent = `取り込み完了：${addedCount}語を追加、${skippedCount}語は重複のためスキップしました。既存の学習記録は保持されています。`;
      importStatus.className = "import-status success";
    } catch (error) {
      importStatus.textContent = `取り込めませんでした：${error.message || "JSONファイルを確認してください。"}`;
      importStatus.className = "import-status error";
    } finally {
      importWordsButton.disabled = false;
    }
  });

  languageSelect.addEventListener("change", () => {
    sessionCount = 0;
    renderStats();
    renderHistory();
    if (mode === "words") renderWordList();
    else if (mode === "quiz" || mode === "review") startQuestion(mode === "review");
  });
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  nextButton.addEventListener("click", () => {
    if (mode === "review" && !Object.keys(data.mistakes).some((key) => key.startsWith(currentLang() + "::"))) {
      setMode("quiz");
    } else {
      startQuestion(mode === "review");
    }
  });
  wordSearch.addEventListener("input", renderWordList);
  $("#clearHistoryButton").addEventListener("click", () => {
    if (!confirm("学習履歴・統計・間違い記録をすべて消去しますか？この操作は元に戻せません。")) return;
    data = { stats: {}, history: [], mistakes: {} };
    saveData();
    renderStats();
    renderHistory();
    if (mode === "review") startQuestion(true);
  });

  renderStats();
  renderHistory();
  startQuestion(false);
})();