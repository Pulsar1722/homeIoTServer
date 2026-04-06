module.exports = {
  apps : [{
    name   : "homeIotServer",
    script : "./server.js",
    log_date_format : "YYYY-MM-DD HH:mm:ss", // ここでタイムスタンプを定義
    env: {
      NODE_ENV: "production",
    }
  }]
}