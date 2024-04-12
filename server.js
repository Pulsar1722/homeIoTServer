'use strict';

//共通パラメータ
const APP_NAME = `homeIotServer`; //本アプリ名
const APP_VERSION = {
    major: `2`,
    minor: `0`,
    revision: `1`,
}

//各種パラメータ
const CONFIG_JSON_FILENAME = "./config.json"; //設定ファイルの(server.jsから見た)相対パス
let confObj = null; //設定ファイルから読みだした値のオブジェクト

class HomeMember {
    constructor(name, japaneseName, isInHome, leftWorkplaceFunc) {
        this.name = name;
        this.japaneseName = japaneseName;
        this.isInHome = isInHome;
        this.leftWorkplaceFunc = leftWorkplaceFunc;
    }

    // 帰宅時処理
    comeHome() {
        printLog(`${this.name} came home.`);
        this.isInHome = true;
    }

    // 外出時処理
    leaveHome() {
        printLog(`${this.name} left home.`);
        this.isInHome = false;
    }
}
let homeMembers = [new HomeMember("Haruki", "はるき", true, leftWorkplaceHaruki), new HomeMember("Kako", "かこ", true, null)];


//使用モジュール
const express = require("express");
const app = express();
const axios = require("axios");

//このファイルがメインモジュールかの確認に用いるらしい
if (require.main === module) {
    main();
}

/**
 * Main関数
 */
function main() {
    confObj = readJsonConfigFile(CONFIG_JSON_FILENAME);
    app.listen(confObj.src_server_info.req_port) //外部からのリクエストを受け付けるポート番号を指定
    printLog(`AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision}`);
}

/**
 * ルーティング
 */
// 家に到着時
app.get("/arrivedHome/:name", function (req, res) {
    for (let member of homeMembers) {
        if (req.params.name === member.name) {
            member.comeHome();
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
        // 帰宅した最初の一人の場合、IFTTTにリクエスト送信
        sendReqToIfttt("one_member_into_home", null);
    }

});

// 家から離れたとき
app.get("/leftHome/:name", function (req, res) {
    for (let member of homeMembers) {
        if (req.params.name === member.name) {
            member.leaveHome();
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
        // 全員家から離れたら、IFTTTにリクエスト送信
        sendReqToIfttt("all_member_out_of_home", null);
    }
});

// 職場から離れたとき
app.get("/leftWorkplace/:name", function (req, res) {
    for (let member of homeMembers) {
        if (req.params.name === member.name) {
            if (member.leftWorkplaceFunc != null) {
                member.leftWorkplaceFunc();
            }
            break;
        }
    }
});

//その他関数

/**
 * Harukiの職場から離れたときの処理
 * @param none
 * @return none
 */
function leftWorkplaceHaruki() {
    // 現在の日本時間を取得
    const currentJapanTime = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));

    // 17:30以降に職場を離れた場合、帰路についたと判断する
    if (currentJapanTime.getHours() >= 18 ||
        currentJapanTime.getHours() >= 17 && currentJapanTime.getMinutes() >= 30) {
        // IFTTTにてLINEにメッセージ送信
        const postData = {
            value1: "はるきが帰宅します",
        };
        sendReqToIfttt("sendline", postData);
    }
}

/**
 * ホームメンバの在宅状態をコンソール二出力(在宅:true,不在;false)
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

/**
 * IFTTT宛にWebhookリクエストを送信する
 * @param {string} event - Webhookイベント
 * @param {string} postData - ポストデータ
 * @return none
 */
function sendReqToIfttt(event, postData) {
    confObj = readJsonConfigFile(CONFIG_JSON_FILENAME);
    const url = `https://maker.ifttt.com/trigger/${event}/with/key/${confObj.ifttt_webhook_info.key}`;
    axios.post(url, postData)
        .then(response => {
            // とりあえずログ出力は不要
            // printLog(response);
        })
        .catch(function (error) {
            printErrLog(error.toJSON());
        });
}

/**
 * 本アプリにおける通常ログを出力する関数
 * @param {string} logstr -出力するログ文字列
 * @return none
 */
function printLog(logstr) {
    console.log(`<${APP_NAME}> ${logstr}`);
}

/**
 * 本アプリにおける異常ログを出力する関数
 * @param {string} logstr -出力するログ文字列
 * @return none
 */
function printErrLog(logstr) {
    console.error(`<${APP_NAME}> ${logstr}`);
}

/**
 * 設定ファイル(JSON形式)を読み出し、各種設定値を取得する。設定値の妥当性確認も行う
 * @param {string} jsonFilename -JSON形式の設定ファイルパス
 * @return 正常に設定ファイルを読み出せた場合はJSONオブジェクト。そうでない場合はnull
 */
function readJsonConfigFile(jsonFilePath) {
    let jsonObj = null;
    let undefinedParams = [];

    try {
        //ファイルパスが異常なら、ここでエラーをthrowする
        jsonObj = require(jsonFilePath);
        delete require.cache[require.resolve(jsonFilePath)]; //ここでrequireのキャッシュを削除し、次回以降も再度ファイルを読み出すようにする

        /**以下、設定値の確認 */
        if (jsonObj.ifttt_webhook_info === undefined) {
            undefinedParams.push("ifttt_webhook_info");
        } else {
            //サブパラメータについても確認
            if (jsonObj.ifttt_webhook_info.key === undefined) {
                undefinedParams.push("ifttt_webhook_info.key");
            }
        }

        if (jsonObj.src_server_info === undefined) {
            undefinedParams.push("src_server_info");
        } else {
            //サブパラメータについても確認
            if (jsonObj.src_server_info.req_port === undefined) {
                undefinedParams.push("src_server_info.req_port");
            }
        }

        // 1個以上のパラメータが設定されていなければエラー扱い
        if (undefinedParams.length !== 0) {
            throw `${undefinedParams} is undefined.`;
        }
    } catch (error) {
        printErrLog(error);
        jsonObj = null;
    }

    return jsonObj;
}