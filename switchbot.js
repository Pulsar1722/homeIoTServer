// 使用モジュール
const axios = require('axios');
const crypto = require('crypto');
const { printLog, printErrLog } = require('./common.js');

// 定数定義
const SWITCHBOT_API_BASE_URL = 'https://api.switch-bot.com/v1.1';

// SwitchBot APIの認証に必要な時間と署名を生成する関数
function generateAuthParameters(token, secret, nonce) {
    const t = Date.now();
    const data = token + t + nonce;
    const signTerm = crypto.createHmac('sha256', secret)
        .update(Buffer.from(data, 'utf-8'))
        .digest();
    const sign = signTerm.toString("base64");
    return { t, sign };
}

// SwitchBot APIからシーン一覧を取得する関数
async function getScenes(token, t, sign, nonce) {
    try {
        const response = await axios.get(`${SWITCHBOT_API_BASE_URL}/scenes`, {
            headers: {
                'Authorization': token,
                'sign': sign,
                't': t,
                'nonce': nonce
            }
        });
        return response.data;
    } catch (error) {
        printErrLog('シーン一覧の取得に失敗しました');
        throw error;
    }
}

// シーンIDを使用して指定されたシーンを実行する関数
async function executeScene(token, t, sign, nonce, sceneId) {
    try {
        const url = `${SWITCHBOT_API_BASE_URL}/scenes/${sceneId}/execute`;
        const response = await axios.post(url, null, {
            headers: {
                'Authorization': token,
                'sign': sign,
                't': t,
                'nonce': nonce,
                'Content-Type': 'application/json'
            }
        });
        printLog(`シーンID「${sceneId}」の実行結果:` + JSON.stringify(response.data));
    } catch (error) {
        printErrLog('シーン実行に失敗しました');
        throw error;
    }
}

// シーン名を指定してシーンを検索・実行する関数
async function executeSceneByName(sceneName, switchbotJsonObj) {
    // 設定ファイル(json)からトークン、シークレットキー、nonceを取得
    const { token, secret, nonce } = switchbotJsonObj;

    // 時間と署名の生成
    const { t, sign } = generateAuthParameters(token, secret, nonce);

    // シーン一覧を取得
    const scenesData = await getScenes(token, t, sign, nonce);
    if (scenesData && scenesData.body) {
        // シーン一覧から指定されたシーン名のシーンIDを取得
        const targetScene = scenesData.body.find(scene => scene.sceneName === sceneName);
        if (targetScene) {
            const sceneId = targetScene.sceneId;
            printLog(`シーン「${sceneName}」のID: ${sceneId}`);

            // シーンを実行
            await executeScene(token, t, sign, nonce, sceneId);
        } else {
            printLog(`「${sceneName}」のシーンが見つかりませんでした。`);
        }
    }
}



// SwitchBot APIからシーン一覧を取得する関数
async function getDevices(token, t, sign, nonce) {
    try {
        const response = await axios.get(`${SWITCHBOT_API_BASE_URL}/devices`, {
            headers: {
                'Authorization': token,
                'sign': sign,
                't': t,
                'nonce': nonce
            }
        });
        return response.data;
    } catch (error) {
        printErrLog('デバイス一覧の取得に失敗しました');
        throw error;
    }
}

// デバイスIDを使用して指定されたデバイスのステータスを取得する関数
async function getDeviceStatus(token, t, sign, nonce, deviceId) {
    try {
        const url = `${SWITCHBOT_API_BASE_URL}/devices/${deviceId}/status`;
        const response = await axios.get(url, {
            headers: {
                'Authorization': token,
                'sign': sign,
                't': t,
                'nonce': nonce,
                'Content-Type': 'application/json'
            }
        });
        printLog(`デバイス「${deviceId}」のステータス:` + JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        printErrLog('デバイスステータス取得に失敗しました');
        throw error;
    }
}

// デバイス名を指定してステータスを取得する関数(デバイスオンラインならtrue)
async function checkDeviceStatusIfOnlineByName(deviceName, switchbotJsonObj) {
    // 設定ファイル(json)からトークン、シークレットキー、nonceを取得
    const { token, secret, nonce } = switchbotJsonObj;

    // 時間と署名の生成
    const { t, sign } = generateAuthParameters(token, secret, nonce);

    // シーン一覧を取得
    const devicesData = await getDevices(token, t, sign, nonce);
    if (devicesData && devicesData.body.deviceList) {
        // シーン一覧から指定されたシーン名のシーンIDを取得
        const targetdevice = devicesData.body.deviceList.find(device => device.deviceName === deviceName);
        if (targetdevice) {
            const deviceId = targetdevice.deviceId;
            printLog(`デバイス「${deviceName}」のID: ${deviceId}`);

            // デバイスステータスの取得
            deviceStatus = await getDeviceStatus(token, t, sign, nonce, deviceId);
            if (deviceStatus.body.onlineStatus == "online") {
                return true;
            } else {
                return false;
            }
        } else {
            printLog(`「${deviceName}」が見つかりませんでした。`);
        }
    }
    return false;
}

module.exports = { executeSceneByName, checkDeviceStatusIfOnlineByName };
