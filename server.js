'use strict';

//共通パラメータ
const APP_NAME = `wol`; //本アプリ名
const APP_VERSION = {
    major: `1`,
    minor: `0`,
    revision: `0`,
}

//各種パラメータ
const CONFIG_JSON_FILENAME = "./config.json"; //設定ファイルの(server.jsから見た)相対パス
let confObj = null; //設定ファイルから読みだした値のオブジェクト

//使用モジュール
const wol = require("wake_on_lan");
const express = require("express");
const app = express();

//このファイルがメインモジュールかの確認に用いるらしい
if (require.main === module) {
    main();
}

/**
 * Main関数
 */
function main() {
    printLog(`AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision}`);
}

/**
 * ルーティング
 */
//Wake On Lan
app.get("/wakeOnLan", function (req, res) {
    confObj = readJsonConfigFile(CONFIG_JSON_FILENAME);
    wol.wake(confObj.mac_addr, { address: confObj.ipaddr }, function (error) {
        if (error) {
            printErrLog(`Send magic packet FAILED.(${confObj.ipaddr}, ${confObj.mac_addr})`);
        } else {
            printLog(`Send Magic packet succeeded.(${confObj.ipaddr}, ${confObj.mac_addr})`);
        }
    });
});


//その他関数

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
        if (jsonObj.dest_pc_info === undefined) {
            undefinedParams.push("dest_pc_info");
        } else {
            //サブパラメータについても確認
            if (jsonObj.dest_pc_info.mac_addr === undefined) {
                undefinedParams.push("dest_pc_info.mac_addr");
            }
            if (jsonObj.dest_pc_info.ipaddr === undefined) {
                undefinedParams.push("dest_pc_info.ipaddr");
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