// 共通で使う処理を実装するファイル

'use strict';

import fs from 'fs';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import packageInfo from '../package.json';

export const CONFIG_JSON_FILENAME = "./config.json"; //設定ファイルの相対パス

// JSONファイルの設定項目
// アプリのJSONファイル設定項目をスキーマ（ルール）で定義する
const AppConfigSchema = z.object({
    src_server_info: z.object({
        req_port: z.number(),
    }),
    switchbot_info: z.object({
        token: z.string(),
        secret: z.string(),
        cleaningIntevalMs: z.number(),
    }),
    mail_info: z.object({
        dstAddrs: z.array(z.string()),
        srcAddr: z.string(),
        srcPass: z.string(),
    }),
    weather_info: z.object({
        latitude: z.number(),
        longitude: z.number(),
        openweather_api_key: z.string(),
        cloudLevelThreshold: z.number(),
    }),
});

// スキーマから「型」を自動抽出する
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type SwitchBotInfo = AppConfig['switchbot_info'];

/**
 * 本アプリにおける通常ログを出力する関数
 * @param {string} logstr -出力するログ文字列
 * @return none
 */
export function printLog(logstr: string) {
    console.log(`<${packageInfo.name}> ${logstr}`);
}

/**
 * 本アプリにおける異常ログを出力する関数
 * @param {string} logstr -出力するログ文字列
 * @return none
 */
export function printErrLog(logstr: string) {
    console.error(`<${packageInfo.name}> ${logstr}`);
}

/**
 * 設定ファイル(JSON形式)を読み出し、各種設定値を取得する。設定値の妥当性確認も行う
 * @param {string} jsonFilename -JSON形式の設定ファイルパス
 * @return 正常に設定ファイルを読み出せた場合はJSONオブジェクト。そうでない場合はnull
 */
export function readJsonConfigFile(jsonFilePath: string): AppConfig {
    if (!fs.existsSync(jsonFilePath)) {
        throw new Error(`設定ファイルが見つかりません: ${jsonFilePath}`);
    }

    const configData = fs.readFileSync(jsonFilePath, 'utf-8');
    const rawConfig = JSON.parse(configData);

    // 解析とバリデーションを一気に行う
    const result = AppConfigSchema.safeParse(rawConfig);
    if (!result.success) {
        // エラー内容が自動で詳細に生成される
        const errorMessages = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`設定ファイルのエラー:\n${errorMessages.join('\n')}`);
    }

    return result.data; // ここでは既に AppConfig 型になっている
}

/**
 * @classdesc メールを送信する関数
 * @param {string} destAddr 宛先メールアドレス
 * @param {title} メールタイトル
 * @param {body} メールの文面
 * @return {boolean} 送信成功ならtrue、送信失敗ならfalse
 */
export async function sendMail(destAddr: string, title: string, body: string) {
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

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));