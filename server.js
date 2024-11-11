'use strict';

//使用モジュール
const express = require("express");
const app = express();
const { printLog, printErrLog, readJsonConfigFile, sendMail, APP_NAME, APP_VERSION, CONFIG_JSON_FILENAME } = require('./common.js');
const { executeSceneByName, checkDeviceStatusIfOnlineByName } = require('./switchbot.js');

class HomeMember {
    constructor(name, japaneseName, isInHome, arrivedHomeFunc, leftHomeFunc) {
        this.name = name;
        this.japaneseName = japaneseName;
        this.isInHome = isInHome;
        this.arrivedHomeFunc = arrivedHomeFunc;
        this.leftHomeFunc = leftHomeFunc;
    }

    // 帰宅時処理
    arrivedHome() {
        if (this.arrivedHomeFunc != null) {
            this.arrivedHomeFunc();
        }
        printLog(`${this.name} came home.`);
        this.isInHome = true;
    }

    // 外出時処理
    leftHome() {
        if (this.leftHomeFunc != null) {
            this.leftHomeFunc();
        }
        printLog(`${this.name} left home.`);
        this.isInHome = false;
    }
}
let homeMembers = [new HomeMember("Haruki", "はるき", true, null, leftHomeHaruki), new HomeMember("Kako", "かこ", true, null, null)];

//このファイルがメインモジュールかの確認に用いるらしい
if (require.main === module) {
    main();
}

/**
 * Main関数
 */
function main() {
    try {
        const confObj = readJsonConfigFile(CONFIG_JSON_FILENAME);
        app.listen(confObj.src_server_info.req_port) //外部からのリクエストを受け付けるポート番号を指定
        printLog(`AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision}`);
    } catch (error) {
        printErrLog(error);
    }
}

/**
 * ルーティング
 */
// 家に到着時
app.get("/arrivedHome/:name", function (req, res) {
    for (let member of homeMembers) {
        if (req.params.name === member.name) {
            member.arrivedHome();
            break;
        }
    }
    printHomeStatus();

    // 帰宅した最初の一人かどうかを判定
    let inHomeCounter = 0;
    for (let member of homeMembers) {
        if (member.isInHome === true) {
            inHomeCounter++;
        }
    }
    if (inHomeCounter === 1) {
        // 帰宅した最初の一人の場合の処理実行
        oneMemberArrivedHome();
    }

    res.send(homeMembers);
});

// 家から離れたとき
app.get("/leftHome/:name", function (req, res) {
    for (let member of homeMembers) {
        if (req.params.name === member.name) {
            member.leftHome();
            break;
        }
    }
    printHomeStatus();

    // 全員家から離れたか判定
    let inHomeCounter = 0;
    for (let member of homeMembers) {
        if (member.isInHome === true) {
            inHomeCounter++;
        }
    }
    if (inHomeCounter === 0) {
        // 全員家から離れた場合の処理実行
        allMembersLeftHome();
    }

    res.send(homeMembers);
});

// 現在の家の状況
app.get("/homeStatus", function (req, res) {
    printHomeStatus();
    res.send(homeMembers);
});

//その他関数

/**
 * ホームメンバの在宅状態をコンソールに出力(在宅:true,不在;false)
 * @param none
 * @return none
 */
function printHomeStatus() {
    let msg = "InHome Status -> ";
    for (let member of homeMembers) {
        msg += `${member.name}:${member.isInHome}, `;
    }
    printLog(msg);
}

// 前回の清掃開始時刻を記録する変数
let lastCleaningTime = null;
/**
 * 清掃開始処理
 * 前回の清掃から規定時間が経過しているときのみ清掃開始。経過していなければ清掃開始はしない
 * @param なし
 * @return none
 */
async function startCleaning() {
    const switchbotInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).switchbot_info;
    const now = Date.now();
    if (lastCleaningTime && now - lastCleaningTime < switchbotInfo.cleaningIntevalMs) {
        // 前回の清掃から規定時間が経過していない場合、清掃開始をスキップ
        return;
    }

    // ロボット掃除機は何故かオフラインになりやすいので、デバイスステータスの確認を行う
    try {
        let onlineStatus = await checkDeviceStatusIfOnlineByName("ロボット掃除機K10+", switchbotInfo);
        if (!onlineStatus) {
            // オフラインなら例外送出
            throw new Error("ロボット掃除機K10+ OFFLINE");
        }
    } catch (error) {
        // ステータスの中身を問わず、オフラインであれば例外が送出される
        printErrLog(error);
        sendMailWhenErrorThrow(error);
        return;
    }

    lastCleaningTime = now;
    executeSceneByName("清掃開始", switchbotInfo);
}

/**
 * 例外発生時のメール送信処理
 * @param {error} error内容
 * @return none
 */
function sendMailWhenErrorThrow(error) {
    const mail_info = readJsonConfigFile(CONFIG_JSON_FILENAME).mail_info;
    const title = `<${APP_NAME}> 例外発生！！！`;
    const body =
        error + `\n` +
        `\n` +
        `AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision} `;

    for (let dstAddr of mail_info.dstAddrs) {
        sendMail(dstAddr, title, body);
    }
}

/**
 * Harukiの外出時の処理
 * @param none
 * @return none
 */
function leftHomeHaruki() {
    try {
        const switchbotInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).switchbot_info;
        executeSceneByName("はるき部屋シャットダウン", switchbotInfo);
    } catch (error) {
        printErrLog(error);
        sendMailWhenErrorThrow(error);
    }
}

/**
 * 全員家から離れた時の処理
 * @param なし
 * @return none
 */
function allMembersLeftHome() {
    try {
        const switchbotInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).switchbot_info;
        executeSceneByName("家電シャットダウン", switchbotInfo);
        startCleaning();
    } catch (error) {
        printErrLog(error);
        sendMailWhenErrorThrow(error);
    }
}

/**
 * 最初の一人が家に帰宅したときの処理
 * @param なし
 * @return none
 */
function oneMemberArrivedHome() {
    try {
        const switchbotInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).switchbot_info;
        executeSceneByName("リビング家電アクティブ", switchbotInfo);
        executeSceneByName("清掃終了", switchbotInfo);
    } catch (error) {
        printErrLog(error);
        sendMailWhenErrorThrow(error);
    }
}