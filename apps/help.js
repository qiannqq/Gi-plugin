import { image, getconfig } from '../model/index.js'
import cfg from '../../../lib/config/config.js'

export class example2 extends plugin {
    constructor(){
        super({
            name: 'Gi互动:帮助',
            dsc: 'Gi互动:帮助',
            event: 'message',
            priority: 500,
            rule:[
                {
                    reg: /^(#|\/)?(Gi|互动|群互动)(帮助|菜单|help|功能|说明|指令|使用说明|命令)$/i,
                    fnc: 'help'
                }
            ]
        })
    }
    async help(e){
       let _path = process.cwd().replace(/\\/g, '/')
       const { config } = getconfig(`defSet`, `help`)
       let { img } = await image(e, 'help', 'help', {
            saveId: 'help',
            cwd: _path,
            genshinPath: `${_path}/plugins/genshin/resources/`,
            helpData: config,
            version: GiPluginVersion
       })
       e.reply(img)
    }
}