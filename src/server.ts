//使用モジュール
import express from "express";
import axios from 'axios';
const app = express();
import packageInfo from '../package.json';
import { printLog, printErrLog, readJsonConfigFile, sendMail, CONFIG_JSON_FILENAME, sleep, SwitchBotInfo } from './common';
import { executeCommand, checkK10HasDone, } from './switchbot';

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

// const CMD_REMOTE_SETALL= "setAll";

const CMD_TV_DTTV= "地上D_API用";

// コマンドタイプ
const CMD_TYPE_CUSTOMIZE = "customize";

// 型名
type EventFunc = ( ) => void;
type UnixTimestamp = number;

class HomeMember {
    arrivedHomeFunc: EventFunc | null;
    isInHome: boolean;
    japaneseName: string;
    leftHomeFunc: EventFunc | null;
    name: string;
    constructor(name: string, japaneseName: string, isInHome: boolean, arrivedHomeFunc: EventFunc | null, leftHomeFunc: EventFunc | null) {
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
        printLog(`AppVersion: ${packageInfo.version}`);
    } catch (error) {
        if (error instanceof Error) {
            printErrLog(error.message);
        } else {
            printErrLog(String(error));
        }
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
app.get("/homeStatus", function (_req, res) {
    printHomeStatus();
    res.send(homeMembers);
});

// Index
app.get("/", function (_req, res) {    
    res.send({
        status: "success",
        app: `${packageInfo.name}`,
        version: `${packageInfo.version}`
    });
});

// 雲量
app.get("/cloud", function (_req, res) {
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

let lastCleaningTime: UnixTimestamp | null = null; // 前回の清掃開始時刻を記録する変数
let hasPrevCleaningHasDone: boolean = false; // 前回の清掃が完了しているかどうかを記録する変数 (初期値はfalseとする。アプリ起動後最初の清掃開始時には前回の清掃は完了していないとみなす)
/**
 * 清掃開始処理
 * 前回の清掃から規定時間が経過しているときのみ清掃開始。経過していなければ清掃開始はしない
 * @param なし
 * @return none
 */
async function startCleaning(switchbotInfo: SwitchBotInfo) {
    const now = Date.now();
    if ( (hasPrevCleaningHasDone === true) && 
         (lastCleaningTime && now - lastCleaningTime < switchbotInfo.cleaningIntevalMs) ) {
        // 前回の清掃が完了済み、かつ前回の清掃から規定時間が経過していない場合、清掃開始をスキップ
        return;
    }
    lastCleaningTime = now;
    executeCommand(switchbotInfo, ROBOT_CLEANER_DEVICE_NAME, CMD_ROBOT_CLEANER_START);
}

/**
 * 清掃終了処理
 * 清掃を終了する。このとき、もう清掃が終わっているのか、それとも途中で清掃が中断されたかを確認する
 * @param なし
 * @return none
 */
async function stopCleaning(switchbotInfo: SwitchBotInfo) {
    hasPrevCleaningHasDone = await checkK10HasDone(switchbotInfo, ROBOT_CLEANER_DEVICE_NAME); // 今現在清掃が完了しているかを確認して記憶しておく
    executeCommand(switchbotInfo, ROBOT_CLEANER_DEVICE_NAME, CMD_ROBOT_CLEANER_STOP);         // 清掃停止コマンドを送る
}

/**
 * 例外発生時のメール送信処理
 * @param {string} error内容
 * @return none
 */
function sendMailWhenErrorThrow(error: string) {
    const mail_info = readJsonConfigFile(CONFIG_JSON_FILENAME).mail_info;
    const title = `<${packageInfo.name}> 例外発生！！！`;
    const body =
        error + `\n` +
        `\n` +
        `AppVersion: ${packageInfo.version} `;

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
        if (error instanceof Error) {
            printErrLog(error.message);
            sendMailWhenErrorThrow(error.message);
        } else {
            printErrLog(String(error));
            sendMailWhenErrorThrow(String(error));
        }
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
        if (error instanceof Error) {
            printErrLog(error.message);
            sendMailWhenErrorThrow(error.message);
        } else {
            printErrLog(String(error));
            sendMailWhenErrorThrow(String(error));
        }
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
        if (error instanceof Error) {
            printErrLog(error.message);
            sendMailWhenErrorThrow(error.message);
        } else {
            printErrLog(String(error));
            sendMailWhenErrorThrow(String(error));
        }
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
        if (error instanceof Error) {
            // ここでは error が Error 型として認識されるので .message が使える
            printErrLog('天気APIの取得に失敗しました:' + error.message);
        } else {
            // Errorオブジェクト以外（文字列など）が投げられた場合の予備処理
            printErrLog('天気APIの取得に失敗しました:' + String(error));
        }
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
        stopCleaning(switchbotInfo);
        // executeCommand(switchbotInfo, LIVING_AIR_CONDITIONER_DEVICE_NAME, CMD_REMOTE_SETALL, "25,2,1,on");
        if( await checkDarkness() ) {
            // 暗いときだけ照明をつける
            executeCommand(switchbotInfo, LIVING_LIGHT_DEVICE_NAME, CMD_LIGHT_ON);
        }
        executeCommand(switchbotInfo, TV_DEVICE_NAME, CMD_LIGHT_ON);
        await sleep(10 * 1000);
    executeCommand(switchbotInfo, TV_DEVICE_NAME, CMD_TV_DTTV, undefined, CMD_TYPE_CUSTOMIZE);
    } catch (error) {
        if (error instanceof Error) {
            printErrLog(error.message);
            sendMailWhenErrorThrow(error.message);
        } else {
            printErrLog(String(error));
            sendMailWhenErrorThrow(String(error));
        }
    }
}