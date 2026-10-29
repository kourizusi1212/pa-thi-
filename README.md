# ポップアップ・パーティー 3D

最大8人で遊べるオンライン3Dパーティーゲーム。Node.js + WebSocket(ws) + Three.js 製。
サーバーが移動・当たり判定・得点を管理するサーバー権威方式です。

## ミニゲーム
| ゲーム | 内容 |
|---|---|
| コインラッシュ | 25秒でコインを一番多く集める |
| メテオよけ | 落ちてくる玉をよけて長く生き残る |
| ダッシュレース | 奥のゴールラインに一番乗り |

3ゲームがランダム順で行われ、順位ポイント(5/3/2/1)の合計で優勝が決まります。

## ローカル実行
```bash
npm install
npm start   # http://localhost:3000
```
同じルーム名(または `?room=名前` のURL)で入ると同じ部屋で遊べます。

## GitHub へアップロード
```bash
git init && git add . && git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<あなた>/party3d.git
git push -u origin main
```

## Render へデプロイ
1. Render ダッシュボード → **New → Blueprint**(または **Web Service**)でこのリポジトリを選択
2. `render.yaml` が自動で読み込まれます(Web Service の場合は Build: `npm install` / Start: `npm start`)
3. 発行されたURLを友だちに共有。WebSocketは同じURLで動作します

※ 無料プランは無通信でスリープするため、初回アクセスに30秒ほどかかります。

## 新しいミニゲームの追加
`server.js` の `GAMES` / `DUR` に名前を追加し、`startRound`(初期化)と `update`(ルール)に分岐を足し、
`public/game.js` の `NAMES` / `HOW` / `buildStage` に表示を足すだけです。
