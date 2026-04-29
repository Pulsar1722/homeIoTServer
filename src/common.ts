// 共通で使う処理を実装するファイル

'use strict';

import fs from 'fs';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import yaml from 'js-yaml';
import packageInfo from '../package.json';

// 設定ファイルの相対パス（YAML形式に対応）
export const CONFIG_YAML_FILENAME = "./config.yaml"; 

// 設定ファイル全体をスキーマ（ルール）で定義する
const AppConfigSchema = z.object({
    src_server_info: z.object({
        req_port: z.number(),
    }),
    switchbot_info: z.object({
        token: z.string(),
        secret: z.string(),
        cleaningIntevalSec: z.number(),
        lightOnBeforeSunsetSec: z.number(),
        lightOnAfterSunriseSec: z.number(),
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
 * 設定ファイル（YAML形式）を読み出し、各種設定値を取得する。
 * 設定値の妥当性確認も行う。
 * @param {string} yamlFilePath -設定ファイルパス
 * @return 正常に設定ファイルを読み出せた場合は設定オブジェクト。そうでない場合はnull
 */
export function readYamlConfigFile(yamlFilePath: string): AppConfig {
    if (!fs.existsSync(yamlFilePath)) {
        throw new Error(`設定ファイルが見つかりません: ${yamlFilePath}`);
    }

    // YAMLファイルをテキストとして読み込み
    const configData = fs.readFileSync(yamlFilePath, 'utf-8');
    
    // YAMLをパース
    const rawConfig = yaml.load(configData);

    // Zodによるバリデーション
    const result = AppConfigSchema.safeParse(rawConfig);
    if (!result.success) {
        const errorMessages = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`設定ファイル(${yamlFilePath})のエラー:\n${errorMessages.join('\n')}`);
    }

    return result.data;
}

/**
 * @classdesc メールを送信する関数
 * @param {string} destAddr 宛先メールアドレス
 * @param {title} メールタイトル
 * @param {body} メールの文面
 * @return {boolean} 送信成功ならtrue、送信失敗ならfalse
 */
export async function sendMail(destAddr: string, title: string, body: string) {
    // 設定ファイル読み込み関数を汎用的に変更したので、
    // CONFIG_YAML_FILENAME を渡すように変更
    const mail_info = readYamlConfigFile(CONFIG_YAML_FILENAME).mail_info; 
    
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