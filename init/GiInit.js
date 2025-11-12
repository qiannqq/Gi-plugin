import yaml from 'yaml'
import fs from 'node:fs'
import init from '../model/init.js';

let GiPath = './plugins/Gi-plugin'

export default new class GiInit {
    async init() {
        try {
            await this.loadConfig() //加载配置文件
            await this.loadPlp() //加载漂流瓶文件
            await this.initPlp() //初始化漂流瓶数据文件
            await this.initTimer() //初始化计时器
            await this.globalGiVersion() //全局声明Gi版本
            return { boolean: true, msg: null }
        } catch (error) {
            return { boolean: false, msg: error }
        }
    }
    async loadConfig() {
        let configFolder = `${GiPath}/config`
        let defSetFolder = `${GiPath}/defSet`
        if (!fs.existsSync(configFolder)) {
          fs.mkdirSync(configFolder);
        }
        const configFilePath = `${configFolder}/config.yaml`
        const defConfigFilePath = `${defSetFolder}/config.yaml`
        if (!fs.existsSync(configFilePath)) {
          fs.copyFileSync(defConfigFilePath, configFilePath);
        } else {
          const defConfig = yaml.parse(fs.readFileSync(defConfigFilePath, 'utf8'));
          let config = yaml.parse(fs.readFileSync(configFilePath, 'utf8'));
          for (const key in defConfig) {
            if (!config.hasOwnProperty(key)) {
              config[key] = defConfig[key];
            }
          }
          const updatedConfigYAML = yaml.stringify(config);
          fs.writeFileSync(configFilePath, updatedConfigYAML, 'utf8');
        }
        const pokeFilePath = `${configFolder}/poke.yaml`
        const defPokeFilePath = `${defSetFolder}/poke.yaml`
        if (!fs.existsSync(pokeFilePath)) {
          fs.copyFileSync(defPokeFilePath, pokeFilePath);
        }
        
        if(!fs.existsSync(`./plugins/Gi-plugin/config/fishText.yaml`)) {
          fs.copyFileSync(`./plugins/Gi-plugin/defSet/fishText.yaml`, `./plugins/Gi-plugin/config/fishText.yaml`)
        } else {
          let config = yaml.parse(fs.readFileSync(`./plugins/Gi-plugin/config/fishText.yaml`, `utf-8`))
          let configNT = config.nothingText || []
          config = config.fishText
          let defcfg = yaml.parse(fs.readFileSync(`./plugins/Gi-plugin/defSet/fishText.yaml`, `utf-8`))
          let defcfgNT = defcfg.nothingText
          defcfg = defcfg.fishText
          fs.writeFileSync(`./plugins/Gi-plugin/config/fishText.yaml`, yaml.stringify({ fishText: [...new Set(config.concat(defcfg))], nothingText: [...new Set(configNT.concat(defcfgNT))] }), `utf-8`)
        }
    }
    async loadPlp() {
        let resourcesFolderPath = './plugins/Gi-plugin/resources'
        let plpFilePath = `${resourcesFolderPath}/plp.txt`
        // console.log(resourcesFolderPath)
        if (!fs.existsSync(resourcesFolderPath)) {
          fs.mkdirSync(resourcesFolderPath);
        }
        
        if (!fs.existsSync(plpFilePath)) {
          fs.closeSync(fs.openSync(plpFilePath, 'w'));
        }
    }
    async initPlp() {
        //创建数据文件夹
        if (!fs.existsSync(`./plugins/Gi-plugin/resources/data`)) {
            fs.mkdirSync(`./plugins/Gi-plugin/resources/data`)
        }
        //迁移旧版漂流瓶数据文件至新版
        if (!fs.existsSync(`./plugins/Gi-plugin/resources/data/dont_del`)) {
            init.plp()
  }
    }
    async initTimer() {
        class CountdownTimer {
            constructor(duration) {
                this.duration = duration;
            }
          
            start() {
                return new Promise((resolve, reject) => {
                    const interval = setInterval(() => {
                        this.duration--;
          
                        if (this.duration <= 0) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, 1000);
                });
            }
          
            getRemainingTime() {
                return this.duration;
            }
          }
          
          class TimerManager {
            constructor() {
                this.timers = {};
            }
          
            createTimer(user_id, duration) {
                this.timers[user_id] = new CountdownTimer(duration);
                return this.timers[user_id];
            }
          
            getRemainingTime(user_id) {
                const timer = this.timers[user_id];
                if (timer) {
                    return timer.getRemainingTime();
                } else {
                    return null;
                }
            }
          }
          
          let timerManager = new TimerManager();
          global.timerManager = timerManager
    }
    async globalGiVersion () {
        let GiPluginVersion = JSON.parse(fs.readFileSync(`./plugins/Gi-plugin/package.json`, `utf-8`))
        GiPluginVersion = GiPluginVersion.version
        global.GiPluginVersion = GiPluginVersion
    }
}