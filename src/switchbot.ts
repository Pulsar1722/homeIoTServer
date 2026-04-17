'use strict';

// 使用モジュール
import axios from 'axios';
import crypto from 'crypto';
import { printLog, printErrLog, SwitchBotInfo } from './common';
import { SwitchBotScene, SwitchBotDevice, SwitchBotInfraredRemote, SwitchBotK10 } from './@types/switchbot';

// 定数定義
const SWITCHBOT_API_BASE_URL = 'https://api.switch-bot.com/v1.1';

// SwitchBot API用の認証ヘッダを生成
function generateHeaders(switchbotInfo: SwitchBotInfo) {
    // オブジェクトから必要な値を取り出す
    const { token, secret } = switchbotInfo;

    const t = Date.now();
    const nonce = crypto.randomUUID();
    const data = token + t + nonce;
    const sign = crypto.createHmac('sha256', secret)
        .update(Buffer.from(data, 'utf-8'))
        .digest();
    const signature = sign.toString('base64');

    return {
        'Authorization': token,
        'sign': signature,
        'nonce': nonce,
        't': t,
        'Content-Type': 'application/json; charset=utf8'
    };
}

// SwitchBot APIからシーン一覧を取得する関数
async function getScenes(switchbotInfo: SwitchBotInfo): Promise<{ body: SwitchBotScene[] }> {
    try {
        const headers = generateHeaders(switchbotInfo);
        const response = await axios.get(`${SWITCHBOT_API_BASE_URL}/scenes`, { headers });
        return response.data;
    } catch (error) {
        printErrLog('シーン一覧の取得に失敗しました');
        throw error;
    }
}

// シーンIDを使用して指定されたシーンを実行する関数
async function executeScene(switchbotInfo: SwitchBotInfo, sceneId: string) {
    try {
        const headers = generateHeaders(switchbotInfo);
        const url = `${SWITCHBOT_API_BASE_URL}/scenes/${sceneId}/execute`;
        const response = await axios.post(url, null, { headers });
        printLog(`シーンID「${sceneId}」の実行結果:` + JSON.stringify(response.data));
    } catch (error) {
        printErrLog('シーン実行に失敗しました');
        throw error;
    }
}

// シーン名を指定してシーンを検索・実行する関数
export async function executeSceneByName(sceneName: string, switchbotInfo: SwitchBotInfo) {
    // シーン一覧を取得
    const scenesData = await getScenes(switchbotInfo);
    if (scenesData && scenesData.body) {
        // シーン一覧から指定されたシーン名のシーンIDを取得
        const targetScene = scenesData.body.find((scene) => scene.sceneName === sceneName);
        if (targetScene) {
            const sceneId = targetScene.sceneId;
            printLog(`シーン「${sceneName}」のID: ${sceneId}`);

            // シーンを実行
            await executeScene(switchbotInfo, sceneId);
        } else {
            printLog(`「${sceneName}」のシーンが見つかりませんでした。`);
        }
    }
}

// SwitchBot APIからシーン一覧を取得する関数
async function getDevices(switchbotInfo: SwitchBotInfo): Promise<{ body: { deviceList: SwitchBotDevice[], infraredRemoteList: SwitchBotInfraredRemote[] } }> {
    try {
        const headers = generateHeaders(switchbotInfo);
        const response = await axios.get(`${SWITCHBOT_API_BASE_URL}/devices`, { headers });
        if( !response || response.status !== 100) {
            throw new Error(`デバイス一覧の取得に失敗しました。レスポンス: ${JSON.stringify(response.data)}`);
        }
        return response.data;
    } catch (error) {
        printErrLog('デバイス一覧の取得に失敗しました');
        throw error;
    }
}

// SwitchBot APIからシーン一覧を取得する関数
async function getDeviceId(switchbotInfo: SwitchBotInfo, deviceName: string) {
    try {
        const responseData = await getDevices(switchbotInfo);
        
        // デバイス一覧から指定されたデバイス名のデバイスIDを取得
        const targetdevice = responseData.body.deviceList.find((device) => device.deviceName === deviceName);
        if (targetdevice) {
            const deviceId = targetdevice.deviceId;
            printLog(`デバイス「${deviceName}」のID: ${deviceId}`);
            return deviceId;
        }
        
        // デバイス一覧から無ければ、赤外線リモコンのリストから指定されたデバイス名のデバイスIDを取得
        const targetRemote = responseData.body.infraredRemoteList.find((device) => device.deviceName === deviceName);
        if (targetRemote) {
            const deviceId = targetRemote.deviceId;
            printLog(`リモコン「${deviceName}」のID: ${deviceId}`);
            return deviceId;
        }

        printLog(`「${deviceName}」が見つかりませんでした。`);
        return null;
    } catch (error) {
        printErrLog('デバイス一覧の取得に失敗しました');
        throw error;
    }
}

// デバイスIDを使用して指定されたデバイスのステータスを取得する関数
async function getDeviceStatus(switchbotInfo: SwitchBotInfo, deviceId: string) {
    try {
        const headers = generateHeaders(switchbotInfo);
        const url = `${SWITCHBOT_API_BASE_URL}/devices/${deviceId}/status`;
        const response = await axios.get(url, { headers });
        printLog(`デバイス「${deviceId}」のステータス:` + JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        printErrLog('デバイスステータス取得に失敗しました');
        throw error;
    }
}

// デバイスIDを指定してステータスを取得する関数(デバイスオンラインならtrue)
async function checkDeviceStatusIfOnlineById(deviceId: string, switchbotInfo: SwitchBotInfo) {
    // デバイスステータスの取得
    const deviceStatus = await getDeviceStatus(switchbotInfo, deviceId);
    const successCodes = [100, 190]; // 正常、wrong deviceIdの両方をオンラインとみなす(ステータス取得に非対応のデバイスはそもそも判定しない)

    // APIリクエスト自体が失敗している場合は即座に false
    if (!deviceStatus || !successCodes.includes(deviceStatus.statusCode) || !deviceStatus.body) {
        return false;
    }

    // onlineのとき、およびonlineStatusがundefinedのときはオンラインとみなす
    if (deviceStatus.body.onlineStatus === undefined || deviceStatus.body.onlineStatus === "online") {
        return true;
    } else {
        return false;
    }
}

// ロボット掃除機K10の掃除が終了しているかを確認する関数。終了しているときはtrue、そうでないときはfalseを返す
export async function checkK10HasDone(switchbotInfo: SwitchBotInfo, deviceName: string ) : Promise<boolean> {
    const deviceId = await getDeviceId(switchbotInfo, deviceName);
    if( !deviceId ) {
        printErrLog(`デバイス「${deviceName}」が見つからないため、ステータスを取得できません。`);
        return false;
    }
    // デバイスステータスの取得
    const deviceStatus = await getDeviceStatus(switchbotInfo, deviceId);
    const successCodes = [100, 190]; // 正常、wrong deviceIdの両方をオンラインとみなす(ステータス取得に非対応のデバイスはそもそも判定しない)

    // APIリクエスト自体が失敗している場合は即座に false
    if (!deviceStatus || !successCodes.includes(deviceStatus.statusCode) || !deviceStatus.body) {
        return false;
    }

    // K10+のステータス情報を取得して、workingStatusからみてまだ掃除未完了かを確認する
    const k10Status = deviceStatus.body as SwitchBotK10;
    const cleaningHasNotDoneStatus = ["Clearing", "Paused", "Dormant", "InTrouble"]; // 掃除が完了していない状態
    if (cleaningHasNotDoneStatus.includes(k10Status.workingStatus)) {
        return false; // 掃除がまだ完了していない状態
    } else {
        return true; // 掃除が完了している状態
    }
}

// デバイス名を使用してコマンドを実行する関数
export async function executeCommand(switchbotInfo: SwitchBotInfo, deviceName: string, command: string, parameter: string = 'default', commandType: string = 'command') {
    try {
        const deviceId = await getDeviceId(switchbotInfo, deviceName);
        if( !deviceId ) {
            printErrLog(`デバイス「${deviceName}」が見つからないため、コマンドを実行できません。`);
            return;
        }
        const isOnline = await checkDeviceStatusIfOnlineById(deviceId, switchbotInfo);
        if (!isOnline) {
            printErrLog(`デバイス「${deviceName}」はオフラインのため、コマンドを実行できません。`);
            return;
        }
        const headers = generateHeaders(switchbotInfo);
        const commandBody = {
            command: command,
            parameter: parameter,
            commandType: commandType,
        };
        const url = `${SWITCHBOT_API_BASE_URL}/devices/${deviceId}/commands`;
        const response = await axios.post(url, commandBody, { headers });
        printLog(`デバイスID「${deviceId}」の実行結果:` + JSON.stringify(response.data));
    } catch (error) {
        printErrLog('デバイスコマンド実行に失敗しました');
        throw error;
    }
}
