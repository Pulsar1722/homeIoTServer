# homeIotServer
Home IoT Server(for IFTTT)

## 動作確認環境
Nodejsバージョン: v14.21.1
yarnバージョン: v1.22.22

## 動作環境構築手順
詳しいことは、
https://github.com/Pulsar1722/ab_alive_monitoring_app/blob/main/how2use.md
を見ること。(1.GMAILアカウント・・・の手順は不要)

## サービス名
homeIotServer

動作ログを見るなら
```Bash
systemctl status homeIotServer
```
または
```Bash
journalctl -n 50 -u homeIotServer
```
で見れる(下のコマンドは直近50件を取得)