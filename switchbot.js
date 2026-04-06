'use strict';

// 使用モジュール
const axios = require('axios');
const crypto = require('crypto');
const { printLog, printErrLog } = require('./common.js');

// 定数定義
const SWITCHBOT_API_BASE_URL = 'https://api.switch-bot.com/v1.1';

// SwitchBot API用の認証ヘッダを生成
function generateHeaders(switchbotJsonObj) {
    // オブジェクトから必要な値を取り出す
    const { token, secret } = switchbotJsonObj;

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
async function getScenes(switchbotJsonObj) {
    try {
        const headers = generateHeaders(switchbotJsonObj);
        const response = await axios.get(`${SWITCHBOT_API_BASE_URL}/scenes`, { headers });
        return response.data;
    } catch (error) {
        printErrLog('シーン一覧の取得に失敗しました');
        throw error;
    }
}

// シーンIDを使用して指定されたシーンを実行する関数
async function executeScene(switchbotJsonObj, sceneId) {
    try {
        const headers = generateHeaders(switchbotJsonObj);
        const url = `${SWITCHBOT_API_BASE_URL}/scenes/${sceneId}/execute`;
        const response = await axios.post(url, null, { headers });
        printLog(`シーンID「${sceneId}」の実行結果:` + JSON.stringify(response.data));
    } catch (error) {
        printErrLog('シーン実行に失敗しました');
        throw error;
    }
}

// シーン名を指定してシーンを検索・実行する関数
async function executeSceneByName(sceneName, switchbotJsonObj) {
    // 設定ファイル(json)からトークン、シークレットキーを取得
    const { token, secret } = switchbotJsonObj;

    // シーン一覧を取得
    const scenesData = await getScenes(switchbotJsonObj);
    if (scenesData && scenesData.body) {
        // シーン一覧から指定されたシーン名のシーンIDを取得
        const targetScene = scenesData.body.find(scene => scene.sceneName === sceneName);
        if (targetScene) {
            const sceneId = targetScene.sceneId;
            printLog(`シーン「${sceneName}」のID: ${sceneId}`);

            // シーンを実行
            await executeScene(token, secret, sceneId);
        } else {
            printLog(`「${sceneName}」のシーンが見つかりませんでした。`);
        }
    }
}

// SwitchBot APIからシーン一覧を取得する関数
async function getDevices(switchbotJsonObj) {
    try {
        const headers = generateHeaders(switchbotJsonObj);
        const response = await axios.get(`${SWITCHBOT_API_BASE_URL}/devices`, { headers });
        return response.data;
    } catch (error) {
        printErrLog('デバイス一覧の取得に失敗しました');
        throw error;
    }
}

// SwitchBot APIからシーン一覧を取得する関数
async function getDeviceId(switchbotJsonObj, deviceName) {
    try {
        const responseData = await getDevices(switchbotJsonObj);
        if( !responseData || responseData.statusCode !== 100) {
            throw new Error(`デバイス「${deviceId}」のステータスの取得に失敗しました。レスポンス: ${JSON.stringify(responseData)}`);
        }
        
        // デバイス一覧から指定されたデバイス名のデバイスIDを取得
        const targetdevice = responseData.body.deviceList.find(device => device.deviceName === deviceName);
        if (targetdevice) {
            const deviceId = targetdevice.deviceId;
            printLog(`デバイス「${deviceName}」のID: ${deviceId}`);
            return deviceId;
        }
        
        // デバイス一覧から無ければ、赤外線リモコンのリストから指定されたデバイス名のデバイスIDを取得
        const targetRemote = responseData.body.infraredRemoteList.find(device => device.deviceName === deviceName);
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
async function getDeviceStatus(switchbotJsonObj, deviceId) {
    try {
        const headers = generateHeaders(switchbotJsonObj);
        const url = `${SWITCHBOT_API_BASE_URL}/devices/${deviceId}/status`;
        const response = await axios.get(url, { headers });
        printLog(`デバイス「${deviceId}」のステータス:` + JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        printErrLog('デバイスステータス取得に失敗しました');
        throw error;
    }
}

// デバイス名を指定してステータスを取得する関数(デバイスオンラインならtrue)
async function checkDeviceStatusIfOnlineByName(deviceName, switchbotJsonObj) {
    // デバイス一覧を取得
    const deviceId = await getDeviceId(switchbotJsonObj, deviceName);
    if (!deviceId) {
        return false;
    }

    return await checkDeviceStatusIfOnlineById(deviceId, switchbotJsonObj); 
}

// デバイスIDを指定してステータスを取得する関数(デバイスオンラインならtrue)
async function checkDeviceStatusIfOnlineById(deviceId, switchbotJsonObj) {
    // デバイスステータスの取得
    const deviceStatus = await getDeviceStatus(switchbotJsonObj, deviceId);
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

// デバイス名を使用してコマンドを実行する関数
async function executeCommand(switchbotJsonObj, deviceName, command, parameter = 'default', commandType = 'command') {
    try {
        // 設定ファイル(json)からトークン、シークレットキーを取得
        const deviceId = await getDeviceId(switchbotJsonObj, deviceName);
        const isOnline = await checkDeviceStatusIfOnlineById(deviceId, switchbotJsonObj);
        if (!isOnline) {
            printErrLog(`デバイス「${deviceName}」はオフラインのため、コマンドを実行できません。`);
            return;
        }
        const headers = generateHeaders(switchbotJsonObj);
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

module.exports = { executeSceneByName, checkDeviceStatusIfOnlineByName, executeCommand };
