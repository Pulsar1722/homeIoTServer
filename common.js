// 共通で使う処理を実装するファイル

'use strict';

const fs = require('fs');
const nodemailer = require('nodemailer');

//共通パラメータ
const APP_VERSION = {
    major: `4`,
    minor: `0`,
    revision: `0`,
}
const APP_NAME = `homeIotServer`; //本アプリ名
const CONFIG_JSON_FILENAME = "./config.json"; //設定ファイルの相対パス

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
    if (!fs.existsSync(jsonFilePath)) {
        throw new Error(`設定ファイルが見つかりません: ${jsonFilePath}`);
    }

    const configData = fs.readFileSync(jsonFilePath, 'utf-8');
    const config = JSON.parse(configData);

    // 各オブジェクトの必須プロパティを定義
    const requiredConfig = {
        src_server_info: ['req_port'],
        switchbot_info: ['token', 'secret', 'cleaningIntevalMs'],
        mail_info: ['dstAddrs', 'srcAddr', 'srcPass'],
        weather_info: ['latitude', 'longitude', 'openweather_api_key', 'cloudLevelThreshold'],
    };

    const missingProperties = [];

    // 各オブジェクトごとに存在確認とプロパティチェック
    for (const [section, properties] of Object.entries(requiredConfig)) {
        if (!config[section]) {
            missingProperties.push(`設定ファイルに '${section}' オブジェクトが存在しません。`);
        } else {
            // 各プロパティが存在するかを確認
            for (const prop of properties) {
                if (!config[section][prop]) {
                    missingProperties.push(`'${section}' に不足しているプロパティ: ${prop}`);
                }
            }
        }
    }

    // 不足しているプロパティがあればエラーをスロー
    if (missingProperties.length > 0) {
        throw new Error(`設定ファイルのエラー:\n${missingProperties.join('\n')}`);
    }

    return config;
}

/**
 * @classdesc メールを送信する関数
 * @param {string} destAddr 宛先メールアドレス
 * @param {title} メールタイトル
 * @param {body} メールの文面
 * @return {boolean} 送信成功ならtrue、送信失敗ならfalse
 */
async function sendMail(destAddr, title, body) {
    const mail_info = readJsonConfigFile(CONFIG_JSON_FILENAME).mail_info;
    
    // 1. 送信機（Transporter）の作成
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: mail_info.srcAddr, // 送信元Gmailアドレス
            pass: mail_info.srcPass  // Googleアカウントの「アプリパスワード」
        }
    });

    // 2. メール内容の設定
    const mailOptions = {
        from: mail_info.srcAddr,
        to: destAddr,
        subject: title,
        text: body
    };

    try {
        // 3. 送信実行
        const info = await transporter.sendMail(mailOptions);
        printLog(`Email sent: ${info.response}`);
        return true;
    } catch (error) {
        printErrLog(`Email send ERROR: ${error}`);
        return false;
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { printLog, printErrLog, readJsonConfigFile, sendMail, APP_NAME, APP_VERSION, CONFIG_JSON_FILENAME, sleep };