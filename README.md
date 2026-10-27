[README.md](https://github.com/user-attachments/files/34016227/README.md)
# ことばトレーニング（iPhone向けPWA）

## できること
- 英語・ドイツ語・イタリア語の切り替え
- 単語・日本語訳・品詞・例文・例文訳の表示
- 4択クイズ、間違い単語の復習、単語検索
- 学習した単語数、正答率、最近の履歴
- localStorageへの保存、Service Workerによるオフライン対応

## ファイル
- `index.html`：画面の骨組み
- `style.css`：見た目・スマートフォン向けレイアウト
- `app.js`：クイズ、統計、履歴、保存処理
- `words.js`：単語データ（各言語24語）
- `manifest.json`：ホーム画面追加用の設定
- `sw.js`：オフラインキャッシュ
- `icons/`：PWAアイコン

## ローカルで動作確認
PWA機能（Service Worker）は `file://` で開くと動きません。次のいずれかでHTTPサーバーを起動します。

### 方法A：Pythonが入っている場合
1. このフォルダーをパソコンに展開する
2. ターミナル／コマンドプロンプトでフォルダーに移動
3. `python -m http.server 8000` を実行
4. ブラウザーで `http://localhost:8000` を開く

### 方法B：VS Codeを使う場合
Live Serverなどのローカルサーバー拡張機能を使って開きます。PWA確認は `localhost` で行えます。

## 無料で公開する（GitHub Pages）
1. GitHubで新しいリポジトリを作る
2. このフォルダー内のファイルと `icons` フォルダーをアップロードする
3. リポジトリの **Settings → Pages** を開く
4. 公開元を `Deploy from a branch`、ブランチを `main`、フォルダーを `/(root)` にして保存する
5. 表示された `https://ユーザー名.github.io/リポジトリ名/` のURLを開く

GitHub PagesはHTTPSなので、Service WorkerとPWA機能を使えます。公開設定の画面は更新されることがあります。

## iPhoneのホーム画面に追加
1. iPhoneのSafariで公開URLを開く
2. 共有ボタン（四角から上向き矢印）を押す
3. メニューを下へスクロールして「ホーム画面に追加」を選ぶ
4. 名前を確認して「追加」を押す
5. ホーム画面に追加されたアイコンから起動する

## 単語の追加・編集
`words.js` を開き、該当言語の配列に次の形式で追加します。
`["word", "日本語訳", "品詞", "Example sentence.", "例文の日本語訳"]`
実際のファイルは各単語をオブジェクト形式に変換してあります。編集時は、既存の1単語の形（`word`, `meaning`, `pos`, `example`, `exampleJa`）をコピーして変更してください。

## 更新時の注意
公開後に `app.js` などを更新した場合、`sw.js` の `CACHE_NAME` を `kotoba-trainer-v2` のように変更すると新しいキャッシュが使われます。アプリを一度オンラインで開き直してください。

## データと制限
学習データはそのブラウザーの `localStorage` に保存されます。Safariの履歴・Webサイトデータを消すと消える場合があり、別端末とは同期されません。公開URLにアクセスしたユーザーごとに保存領域は別です。単語データは学習用サンプルなので、試験対策に使う場合は辞書や教材でも確認してください。
