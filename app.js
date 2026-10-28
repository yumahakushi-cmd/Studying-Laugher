// 画面操作、クイズ、履歴保存、単語帳管理を担当するJavaScriptです。
(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const languageSelect = $("#languageSelect");
  const quizPanel = $("#quizPanel");
  const wordsPanel = $("#wordsPanel");
  const importPanel = $("#importPanel");
  const booksPanel = $("#booksPanel");
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
  const STORAGE_KEY = "kotobaTrainerData_v1"; // 既存キーは変更しません
  const BOOK_SETTINGS_KEY = "kotobaTrainerBookSettings_v1";
  const DB_NAME = "kotobaTrainerBooksDB";
  const DB_VERSION = 1;
  const STORE_NAME = "wordbooks";

  let mode = "quiz";
  let currentWord = null;
  let options = [];
  let answered = false;
  let sessionCount = 0;
  let reviewQueue = [];
  let wordbooks = [];
  let selectedByLanguage = loadBookSettings();
  let db = null;

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        stats: parsed.stats && typeof parsed.stats === "object" ? parsed.stats : {},
        history: Array.isArray(parsed.history) ? parsed.history : [],
        mistakes: parsed.mistakes && typeof parsed.mistakes === "object" ? parsed.mistakes : {},
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
    catch (error) { console.warn("学習データを保存できませんでした", error); }
  }
  function loadBookSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(BOOK_SETTINGS_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch { return {}; }
  }
  function saveBookSettings() {
    try { localStorage.setItem(BOOK_SETTINGS_KEY, JSON.stringify(selectedByLanguage)); }
    catch (error) { console.warn("単語帳の選択状態を保存できませんでした", error); }
  }
  function currentLang() { return languageSelect.value; }
  function builtinBookId(lang) { return `builtin-${lang}`; }
  function legacyBookId(lang) { return `legacy-${lang}`; }
  function getBuiltinWords(lang) { return Array.isArray(window.WORDS?.[lang]) ? window.WORDS[lang] : []; }
  function getLegacyWords(lang) { return Array.isArray(data.customWords?.[lang]) ? data.customWords[lang] : []; }
  function getSavedBooks(lang = currentLang()) { return wordbooks.filter((book) => book.language === lang); }
  function getBookChoices(lang = currentLang()) {
    const choices = [];
    if (getBuiltinWords(lang).length) choices.push({ id: builtinBookId(lang), name: "初期収録単語", language: lang, description: "アプリに最初から入っている単語", words: getBuiltinWords(lang), builtin: true });
    if (getLegacyWords(lang).length) choices.push({ id: legacyBookId(lang), name: "以前に取り込んだ単語", language: lang, description: "今回の単語帳機能より前に追加した単語", words: getLegacyWords(lang), legacy: true });
    return choices.concat(getSavedBooks(lang));
  }
  function selectedIds(lang = currentLang()) {
    const saved = selectedByLanguage[lang];
    if (Array.isArray(saved)) return saved;
    // 初回は、これまでと同じようにアプリ内蔵単語を出題対象にします。
    const defaults = [];
    if (getBuiltinWords(lang).length) defaults.push(builtinBookId(lang));
    if (getLegacyWords(lang).length) defaults.push(legacyBookId(lang));
    selectedByLanguage[lang] = defaults;
    saveBookSettings();
    return defaults;
  }
  function selectedWords(lang = currentLang()) {
    const ids = new Set(selectedIds(lang));
    const allBooks = getBookChoices(lang).filter((book) => ids.has(book.id));
    // 選択した単語帳ごとの単語をそのまま保持します。
    // 同じ語が複数の単語帳にあっても、どれかを削除・統合しません。
    return allBooks.flatMap((book) => book.words);
  }
  function wordKey(word, lang = currentLang()) { return `${lang}::${word.word}`; }
  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("このブラウザーでは単語帳の保存機能を利用できません。")); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("単語帳の保存領域を開けませんでした。"));
    });
  }
  function dbRequest(modeName, action) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, modeName);
      const store = transaction.objectStore(STORE_NAME);
      let request;
      try { request = action(store); } catch (error) { reject(error); return; }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("単語帳の保存処理に失敗しました。"));
      transaction.onabort = () => reject(transaction.error || new Error("単語帳の保存処理が中断されました。"));
    });
  }
  async function refreshBooks() {
    wordbooks = (await dbRequest("readonly", (store) => store.getAll())) || [];
    renderBookManager();
  }
  function makeId() {
    if (window.crypto?.randomUUID) return `book-${crypto.randomUUID()}`;
    return `book-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function normalizeWords(list, label) {
    if (!Array.isArray(list)) throw new Error(`${label} の単語データが配列ではありません。`);
    if (list.length > 5000) throw new Error("1冊に登録できるのは最大5000語です。ファイルを分けてください。");
    const result = [];
    const seen = new Set();
    const required = ["word", "meaning", "pos", "example", "exampleJa"];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || typeof item !== "object" || required.some((key) => typeof item[key] !== "string" || !item[key].trim())) {
        throw new Error(`${label} の ${i + 1}番目の単語に必要な項目がありません。word / meaning / pos / example / exampleJa を確認してください。`);
      }
      const word = item.word.trim();
      const key = word.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ word, meaning: item.meaning.trim(), pos: item.pos.trim(), example: item.example.trim(), exampleJa: item.exampleJa.trim() });
    }
    return result;
  }
  function filenameStem(name) { return String(name || "単語帳.json").replace(/\.json$/i, "").trim() || "単語帳"; }
  function parseBooksFromJSON(parsed, filename) {
    const stem = filenameStem(filename);
    // 新形式：1ファイル = 1冊
    if (parsed && parsed.formatVersion === 1 && typeof parsed.name === "string" && ["en", "de", "it"].includes(parsed.language)) {
      const words = normalizeWords(parsed.words, parsed.name);
      if (!words.length) throw new Error("この単語帳に単語がありません。");
      return [{ name: parsed.name.trim(), language: parsed.language, description: typeof parsed.description === "string" ? parsed.description.trim() : "", words, sourceName: filename }];
    }
    // 旧形式：言語ごとの配列を、言語別の単語帳に分けて保存します。
    if (parsed && parsed.version === 1 && parsed.words && typeof parsed.words === "object") {
      const books = [];
      for (const lang of ["en", "de", "it"]) {
        const list = parsed.words[lang] === undefined ? [] : parsed.words[lang];
        const words = normalizeWords(list, `${stem}・${languageNames[lang]}`);
        if (words.length) books.push({ name: `${stem}（${languageNames[lang]}）`, language: lang, description: `JSONファイル「${filename}」から取り込んだ単語帳`, words, sourceName: filename });
      }
      if (!books.length) throw new Error("取り込む単語がありません。words.en / words.de / words.it を確認してください。");
      return books;
    }
    throw new Error("JSON形式が認識できません。サンプルJSONの形式を確認してください。");
  }
  function bookSignature(book) {
    return `${book.language}::${book.words.map((word) => `${word.word.toLocaleLowerCase()}=${word.meaning}`).sort().join("|")}`;
  }
  function setMode(newMode) {
    mode = newMode;
    document.querySelectorAll(".mode-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    wordsPanel.hidden = mode !== "words";
    importPanel.hidden = mode !== "import";
    booksPanel.hidden = mode !== "books";
    quizPanel.hidden = mode !== "quiz" && mode !== "review";
    if (mode === "words") renderWordList();
    else if (mode === "books") renderBookManager();
    else if (mode === "import") return;
    else startQuestion(mode === "review");
  }
  function hasMistakesInCurrentPool() {
    return selectedWords().some((word) => Boolean(data.mistakes[wordKey(word)]));
  }
  function startQuestion(reviewOnly = false) {
    answered = false;
    feedback.innerHTML = "";
    nextButton.hidden = true;
    const allWords = selectedWords();
    reviewQueue = allWords.filter((word) => data.mistakes[wordKey(word)]);
    const pool = reviewOnly ? reviewQueue : allWords;
    questionCounter.textContent = reviewOnly ? `間違い復習 · ${reviewQueue.length}語` : `第 ${sessionCount + 1} 問 · ${languageNames[currentLang()]}`;
    if (!pool.length) {
      currentWord = null;
      const hint = reviewOnly ? "選択した単語帳に復習対象はありません。" : "「単語帳」から学習する単語帳を選ぶか、「単語取込」からJSONファイルを追加してください。";
      questionArea.innerHTML = `<div class="word-prompt"><h2>${reviewOnly ? "復習する単語はありません 🎉" : "学習する単語がありません"}</h2><p class="hint">${escapeHTML(hint)}</p></div>`;
      return;
    }
    const candidates = pool.filter((word) => !currentWord || word.word !== currentWord.word);
    currentWord = (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length || pool.length))];
    const wrongOptions = shuffle(allWords.filter((word) => word.word.toLocaleLowerCase() !== currentWord.word.toLocaleLowerCase())).slice(0, 3);
    options = shuffle([currentWord, ...wrongOptions]);
    renderQuestion();
  }
  function renderQuestion() {
    const prompt = currentWord;
    questionArea.innerHTML = `
      <div class="word-prompt"><p class="eyebrow">次の単語の意味は？</p><h2>${escapeHTML(prompt.word)}</h2><p class="hint">${escapeHTML(prompt.pos)}</p></div>
      <div class="options">${options.map((option, index) => `<button class="option-button" data-answer="${escapeHTML(option.word)}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option.meaning)}</span></button>`).join("")}</div>`;
    questionArea.querySelectorAll(".option-button").forEach((button) => button.addEventListener("click", () => answerQuestion(button.dataset.answer)));
  }
  function answerQuestion(selectedWord) {
    if (answered || !currentWord) return;
    answered = true;
    const correct = selectedWord === currentWord.word;
    const key = wordKey(currentWord);
    const stat = data.stats[currentLang()] || { attempts: 0, correct: 0, learned: [] };
    stat.attempts = Number(stat.attempts || 0) + 1;
    stat.correct = Number(stat.correct || 0) + (correct ? 1 : 0);
    stat.learned = Array.isArray(stat.learned) ? stat.learned : [];
    if (correct) delete data.mistakes[key];
    else data.mistakes[key] = { word: currentWord.word, lang: currentLang(), lastWrong: Date.now() };
    if (!stat.learned.includes(currentWord.word)) stat.learned.push(currentWord.word);
    data.stats[currentLang()] = stat;
    data.history.unshift({ lang: currentLang(), word: currentWord.word, meaning: currentWord.meaning, correct, selected: (options.find((item) => item.word === selectedWord) || {}).meaning || "", time: Date.now() });
    data.history = data.history.slice(0, 100);
    saveData();
    questionArea.querySelectorAll(".option-button").forEach((button) => {
      button.disabled = true;
      if (button.dataset.answer === currentWord.word) button.classList.add("correct");
      else if (button.dataset.answer === selectedWord) button.classList.add("incorrect");
    });
    feedback.innerHTML = `<div class="result ${correct ? "good" : "bad"}">${correct ? "正解！ 🎉" : `不正解。正解は「${escapeHTML(currentWord.meaning)}」です。`}</div><p class="explanation">${correct ? "よくできました！" : "単語と日本語訳をセットで確認しましょう。"}</p><div class="example"><p><strong>例文：</strong>${escapeHTML(currentWord.example)}</p><p>${escapeHTML(currentWord.exampleJa)}</p></div>`;
    nextButton.hidden = false;
    nextButton.textContent = mode === "review" ? "次の復習へ" : "次の問題へ";
    sessionCount++;
    renderStats();
    renderHistory();
    if (mode === "review" && !hasMistakesInCurrentPool()) nextButton.textContent = "復習完了！クイズへ";
  }
  function renderStats() {
    const stat = data.stats[currentLang()] || { attempts: 0, correct: 0, learned: [] };
    const learned = Array.isArray(stat.learned) ? stat.learned : [];
    $("#learnedStat").textContent = learned.length;
    $("#accuracyStat").textContent = stat.attempts ? `${Math.round((stat.correct || 0) / stat.attempts * 100)}%` : "—";
    $("#answerCount").textContent = `回答 ${stat.attempts || 0} 回`;
    $("#reviewStat").textContent = selectedWords().filter((word) => data.mistakes[wordKey(word)]).length;
    $("#streakPill").textContent = stat.attempts ? `${stat.attempts} 回回答済み` : "まずは1問！";
  }
  function renderHistory() {
    const recent = (Array.isArray(data.history) ? data.history : []).slice(0, 8);
    $("#historyList").innerHTML = recent.length ? recent.map((item) => `<div class="history-item"><div><strong>${escapeHTML(item.word)} <span class="muted">· ${escapeHTML(languageNames[item.lang] || item.lang)}</span></strong><p>${escapeHTML(item.meaning)} · ${item.time ? new Date(item.time).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "日時不明"}</p></div><span class="history-result ${item.correct ? "good" : "bad"}">${item.correct ? "正解" : "不正解"}</span></div>`).join("") : '<p class="muted">まだ学習履歴がありません。</p>';
  }
  function renderWordList() {
    const query = wordSearch.value.trim().toLocaleLowerCase();
    const list = selectedWords().filter((word) => `${word.word} ${word.meaning} ${word.example}`.toLocaleLowerCase().includes(query));
    $("#wordCount").textContent = `${list.length}語（選択中の単語帳）`;
    wordList.innerHTML = list.map((word) => `<article class="word-item"><div class="word-item-top"><div><strong>${escapeHTML(word.word)}</strong><p>${escapeHTML(word.meaning)}</p></div><span class="part-of-speech">${escapeHTML(word.pos)}</span></div><div class="example"><p>${escapeHTML(word.example)}</p><p>${escapeHTML(word.exampleJa)}</p></div></article>`).join("") || '<p class="muted">該当する単語がありません。単語帳の選択を確認してください。</p>';
  }
  function renderBookManager() {
    if (!booksPanel) return;
    const lang = currentLang();
    const choices = getBookChoices(lang);
    const selected = new Set(selectedIds(lang));
    const count = choices.filter((book) => selected.has(book.id)).reduce((sum, book) => sum + book.words.length, 0);
    $("#selectedBookSummary").textContent = `${choices.filter((book) => selected.has(book.id)).length}冊選択中・合計${selectedWords(lang).length}語`;
    $("#bookList").innerHTML = choices.length ? choices.map((book) => {
      const removable = !book.builtin && !book.legacy;
      return `<article class="book-item"><label class="book-select"><input type="checkbox" data-book-id="${escapeHTML(book.id)}" ${selected.has(book.id) ? "checked" : ""}><span class="book-title"><strong>${escapeHTML(book.name)}</strong><small>${book.words.length}語${book.description ? ` · ${escapeHTML(book.description)}` : ""}</small></span></label>${removable ? `<button class="text-button delete-book" data-delete-book="${escapeHTML(book.id)}" type="button" aria-label="${escapeHTML(book.name)}を削除">削除</button>` : ""}</article>`;
    }).join("") : '<p class="muted">この言語の単語帳がありません。JSONファイルを読み込んで追加してください。</p>';
    $("#bookList").querySelectorAll("input[data-book-id]").forEach((input) => input.addEventListener("change", () => {
      const ids = new Set(selectedIds(lang));
      if (input.checked) ids.add(input.dataset.bookId); else ids.delete(input.dataset.bookId);
      selectedByLanguage[lang] = [...ids];
      saveBookSettings();
      renderBookManager();
      renderStats();
      if (mode === "words") renderWordList();
    }));
    $("#bookList").querySelectorAll("button[data-delete-book]").forEach((button) => button.addEventListener("click", async () => {
      const book = wordbooks.find((item) => item.id === button.dataset.deleteBook);
      if (!book || !confirm(`単語帳「${book.name}」を削除しますか？\n学習履歴・復習記録は削除しません。`)) return;
      try {
        await dbRequest("readwrite", (store) => store.delete(book.id));
        selectedByLanguage[book.language] = selectedIds(book.language).filter((id) => id !== book.id);
        saveBookSettings();
        await refreshBooks();
        renderStats();
        if (mode === "quiz" || mode === "review") startQuestion(mode === "review");
      } catch (error) { alert(`削除できませんでした：${error.message || "保存領域を確認してください。"}`); }
    }));
    $("#startSelectedBooksButton").disabled = selectedWords(lang).length === 0;
  }

  importWordsButton.addEventListener("click", async () => {
    const files = Array.from(wordImportFile.files || []);
    if (!files.length) { importStatus.textContent = "先にJSONファイルを選択してください。"; importStatus.className = "import-status error"; return; }
    importWordsButton.disabled = true;
    importStatus.textContent = "ファイルを確認して保存しています…";
    importStatus.className = "import-status";
    try {
      let addedBooks = 0;
      let skippedBooks = 0;
      const errors = [];
      // 今回の複数ファイル内での重複も防ぎます。
      const knownSignatures = new Set(wordbooks.map((book) => bookSignature(book)));
      for (const file of files) {
        try {
          const parsed = JSON.parse(await file.text());
          const incomingBooks = parseBooksFromJSON(parsed, file.name);
          for (const incoming of incomingBooks) {
            const signature = bookSignature(incoming);
            if (knownSignatures.has(signature)) { skippedBooks++; continue; }
            const record = { ...incoming, id: makeId(), signature, createdAt: Date.now() };
            await dbRequest("readwrite", (store) => store.add(record));
            knownSignatures.add(signature);
            addedBooks++;
          }
        } catch (error) { errors.push(`${file.name}: ${error.message || "読み込めませんでした"}`); }
      }
      await refreshBooks();
      renderStats();
      if (errors.length && addedBooks === 0) {
        importStatus.textContent = `取り込めませんでした。\n${errors.join("\n")}`;
        importStatus.className = "import-status error";
      } else {
        importStatus.textContent = `取り込み完了：${addedBooks}冊を保存、${skippedBooks}冊は内容が同じためスキップしました。${errors.length ? `\n一部エラー：${errors.join("\n")}` : ""} 単語帳画面で選択して学習できます。既存の学習履歴は保持されています。`;
        importStatus.className = errors.length ? "import-status" : "import-status success";
      }
      wordImportFile.value = "";
    } catch (error) {
      importStatus.textContent = `取り込めませんでした：${error.message || "保存領域を確認してください。"}`;
      importStatus.className = "import-status error";
    } finally { importWordsButton.disabled = false; }
  });

  languageSelect.addEventListener("change", () => {
    sessionCount = 0;
    renderStats();
    renderHistory();
    if (mode === "words") renderWordList();
    else if (mode === "books") renderBookManager();
    else if (mode === "quiz" || mode === "review") startQuestion(mode === "review");
  });
  document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  nextButton.addEventListener("click", () => {
    if (mode === "review" && !hasMistakesInCurrentPool()) setMode("quiz");
    else startQuestion(mode === "review");
  });
  wordSearch.addEventListener("input", renderWordList);
  $("#startSelectedBooksButton").addEventListener("click", () => setMode("quiz"));
  $("#clearHistoryButton").addEventListener("click", () => {
    if (!confirm("学習履歴・統計・間違い記録をすべて消去しますか？この操作は元に戻せません。単語帳データは削除されません。")) return;
    // 単語帳や既存の追加単語は維持し、履歴関連だけを消去します。
    data = { stats: {}, history: [], mistakes: {}, customWords: data.customWords || { en: [], de: [], it: [] } };
    saveData();
    renderStats();
    renderHistory();
    if (mode === "review") startQuestion(true);
  });

  async function init() {
    try {
      db = await openDatabase();
      await refreshBooks();
      renderStats();
      renderHistory();
      startQuestion(false);
    } catch (error) {
      console.error(error);
      $("#bookStorageWarning").hidden = false;
      $("#bookStorageWarning").textContent = `単語帳の保存機能を初期化できませんでした：${error.message || "ブラウザーの設定を確認してください。"} 学習履歴は既存の保存領域を使用します。`;
      renderStats();
      renderHistory();
      startQuestion(false);
    }
  }
  init();
})();
