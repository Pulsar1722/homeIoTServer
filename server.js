'use strict';

//使用モジュール
const express = require("express");
const axios = require('axios');
const app = express();
const { printLog, printErrLog, readJsonConfigFile, sendMail, APP_NAME, APP_VERSION, CONFIG_JSON_FILENAME, sleep } = require('./common.js');
const { executeSceneByName, executeCommand, checkDeviceStatusIfOnlineByName } = require('./switchbot.js');

// デバイス名
const ROBOT_CLEANER_DEVICE_NAME = "ロボット掃除機K10+";
const HARUKI_LIGHT_DEVICE_NAME = "シーリングライト_はるき";
const KAKO_LIGHT_DEVICE_NAME = "シーリングライト_かこ";
const LIVING_LIGHT_DEVICE_NAME = "シーリングライトプロ_リビング";
const LIVING_AIR_CONDITIONER_DEVICE_NAME = "エアコン";
const TV_DEVICE_NAME = "テレビ";

// コマンド
const CMD_ROBOT_CLEANER_START = "start";
const CMD_ROBOT_CLEANER_STOP = "dock";

const CMD_LIGHT_ON = "turnOn";
const CMD_LIGHT_OFF= "turnOff";

const CMD_REMOTE_SETALL= "setAll";

const CMD_TV_DTTV= "地上D_API用";

// コマンドタイプ
const CMD_TYPE_CUSTOMIZE = "customize";


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
let homeMembers = [new HomeMember("Haruki", "はるき", true, null, leftHomeHaruki), new HomeMember("Kako", "かこ", true, null, leftHomeKako)];

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

// Index
app.get("/", function (req, res) {    
    res.send({
        status: "success",
        app: APP_NAME,
        version: `${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision}`
    });
});

// 雲量
app.get("/cloud", function (req, res) {
    getCloudiness().then(cloudiness => {
        res.send("cloud:" + cloudiness);
    });
});

async function getCloudiness() {
    const weatherInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).weather_info;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${weatherInfo.latitude}&lon=${weatherInfo.longitude}&appid=${weatherInfo.openweather_api_key}&units=metric`;
    const weatherRes = await axios.get(url);
    return weatherRes.data.clouds.all;
}

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
async function startCleaning(switchbotInfo) {
    const now = Date.now();
    if (lastCleaningTime && now - lastCleaningTime < switchbotInfo.cleaningIntevalMs) {
        // 前回の清掃から規定時間が経過していない場合、清掃開始をスキップ
        return;
    }
    lastCleaningTime = now;
    executeCommand(switchbotInfo, ROBOT_CLEANER_DEVICE_NAME, CMD_ROBOT_CLEANER_START);
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
        //executeSceneByName("はるき部屋シャットダウン", switchbotInfo);
        executeCommand(switchbotInfo, HARUKI_LIGHT_DEVICE_NAME, CMD_LIGHT_OFF);
    } catch (error) {
        printErrLog(error);
        sendMailWhenErrorThrow(error);
    }
}

/**
 * Kakoの外出時の処理
 * @param none
 * @return none
 */
function leftHomeKako() {
    try {
        const switchbotInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).switchbot_info;
        executeCommand(switchbotInfo, KAKO_LIGHT_DEVICE_NAME, CMD_LIGHT_OFF);
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
        // executeSceneByName("家電シャットダウン", switchbotInfo);
        executeCommand(switchbotInfo, LIVING_LIGHT_DEVICE_NAME, CMD_LIGHT_OFF);
        executeCommand(switchbotInfo, KAKO_LIGHT_DEVICE_NAME, CMD_LIGHT_OFF);
        executeCommand(switchbotInfo, HARUKI_LIGHT_DEVICE_NAME, CMD_LIGHT_OFF);
        executeCommand(switchbotInfo, LIVING_AIR_CONDITIONER_DEVICE_NAME, CMD_LIGHT_OFF);
        startCleaning(switchbotInfo);
    } catch (error) {
        printErrLog(error);
        sendMailWhenErrorThrow(error);
    }
}

/**
 * 暗いかどうかを判定する (日没 or 雲量)
 */
async function checkDarkness() {
    try {
        const weatherInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).weather_info;
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${weatherInfo.latitude}&lon=${weatherInfo.longitude}&appid=${weatherInfo.openweather_api_key}&units=metric`;
        const res = await axios.get(url);
        
        const { sys, clouds, dt } = res.data;
        const sunset = sys.sunset;   // 日没時刻 (UNIXタイム)
        const sunrise = sys.sunrise; // 日の出時刻 (UNIXタイム)
        const cloudiness = clouds.all; // 雲の量 (0-100%)
        const currentTime = dt;      // 現在時刻 (UNIXタイム)
        const OFFSET_SEC = 30 * 60; // 30分の余裕を持たせる

        printLog(`現在の雲量: ${cloudiness}%`);

        // 条件設定
        const isEvening  = (currentTime > (sunset - OFFSET_SEC) || currentTime < (sunrise + OFFSET_SEC)); // 日没30分前から日の出30分後までは夜とみなす
        const isVeryCloudy = (cloudiness >= weatherInfo.cloudLevelThreshold); // 雲量が指定された閾値以上なら「暗い」とみなす

        if (isEvening) {
            printLog('判定結果: 暗い (時間帯による判定)');
            return true;
        } else if (isVeryCloudy) {
            printLog('判定結果: 暗い (雲量による判定)');
            return true;
        } else {
            printLog('判定結果: 明るい');
            return false;
        }
    } catch (error) {
        printErrLog('天気APIの取得に失敗しました', error.message);
        return false;
    }
}

/**
 * 最初の一人が家に帰宅したときの処理
 * @param なし
 * @return none
 */
async function oneMemberArrivedHome() {
    try {
        const switchbotInfo = readJsonConfigFile(CONFIG_JSON_FILENAME).switchbot_info;
        // executeSceneByName("リビング家電アクティブ", switchbotInfo);
        executeCommand(switchbotInfo, ROBOT_CLEANER_DEVICE_NAME, CMD_ROBOT_CLEANER_STOP);
        // executeCommand(switchbotInfo, LIVING_AIR_CONDITIONER_DEVICE_NAME, CMD_REMOTE_SETALL, "25,2,1,on");
        if( await checkDarkness() ) {
            // 暗いときだけ照明をつける
            executeCommand(switchbotInfo, LIVING_LIGHT_DEVICE_NAME, CMD_LIGHT_ON);
        }
        executeCommand(switchbotInfo, TV_DEVICE_NAME, CMD_LIGHT_ON);
        await sleep(10 * 1000);
    executeCommand(switchbotInfo, TV_DEVICE_NAME, CMD_TV_DTTV, undefined, CMD_TYPE_CUSTOMIZE);
    } catch (error) {
        printErrLog(error);
        sendMailWhenErrorThrow(error);
    }
}