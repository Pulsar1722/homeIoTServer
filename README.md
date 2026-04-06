# Home IoT Server (SwitchBot API Control)

SwitchBot API v1.1 を使用して、在宅状況に基づいた家電（ロボット掃除機、照明、エアコン、テレビ）の自動制御を行う Node.js サーバーです。

## 機能
- **在宅管理**: 家族の帰宅・外出を API で受け取り、照明や掃除機を自動操作。
- **スマート掃除**: 全員外出時に K10+ の清掃を開始。
- **インテリジェント照明**: 日没時刻や雲量を OpenWeatherMap API で取得し、暗い時だけ点灯。
- **家電操作**: テレビ（地上波切り替え等）やエアコンの赤外線制御。

## セットアップ (ローカル開発)

1. リポジトリをクローン
2. `npm install` を実行
3. `config.json` を作成（後述の「設定」を参照）
4. `node server.js` で起動

---

## デプロイ手順 (GCP Ubuntu 24.04)

### 1. Node.js のインストール (NVM経由推奨)
```bash
# NVMのインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Node.js LTSのインストール
nvm install --lts
```
2. リポジトリのクローンとビルド
```Bash
cd ~
git clone https://github.com/Pulsar1722/homeIoTServer
cd homeIoTServer
npm install
```
3. 設定ファイルの作成 (手動)

.gitignore により config.json は含まれていないため、サーバー上で直接作成します。
```Bash
nano config.json
```
# ローカルの内容をコピー＆ペーストして保存
4. PM2 によるプロセスの永続化

サーバーを閉じても動き続けるように設定します。
```Bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# 表示されたコマンドをコピーして実行する（自動起動設定、sudoから始まる）
```

※動作ログの1日ごとにログを分割・圧縮する方法(任意)
```Bash
# インストールするだけで自動設定される
pm2 install pm2-logrotate
```
5. GCP ファイアウォールの設定

GCP コンソールの「VPC ネットワーク」>「ファイアウォール」にて、config.json似て指定したポートを許可するルールを作成し、インスタンスにタグを付与してください。

API エンドポイント
---
GET /: サーバー稼働確認

GET /arrivedHome/:name: 名前を指定して帰宅処理を実行

GET /leftHome/:name: 名前を指定して外出処理を実行

GET /homeStatus: 現在の在宅状況を確認

## 動作確認環境
Nodejsバージョン: v24.14.1
npmバージョン: 11.11.0

## サービス名
homeIotServer

動作ログを見るなら
```Bash
pm2 logs 
```

更新後の反映
```Bash
pm2 restart 
```
