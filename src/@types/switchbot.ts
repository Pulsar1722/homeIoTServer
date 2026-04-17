// シーン情報のインターフェース定義
export interface SwitchBotScene {
    sceneId: string;
    sceneName: string;
}

// デバイス情報のインターフェース定義
export interface SwitchBotDevice {
    deviceId: string;
    deviceName: string;
    deviceType: string;
    hubDeviceId: string;
}

// 赤外線リモコン情報のインターフェース定義
export interface SwitchBotInfraredRemote {
    deviceId: string;
    deviceName: string;
    remoteType: string;
    hubDeviceId: string;
}