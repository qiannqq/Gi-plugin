import plugin from "../../../lib/plugins/plugin.js";
import getconfig from "../model/cfg.js";

export class daanzhishu extends plugin {
    constructor(){
        super({
            name: 'Gi互动:答案之书',
            dsc: 'Gi互动:答案之书',
            event: 'message',
            priority: 500,
            rule:[
                {
                    reg: '^(#|/)?答案之书(.*)$',
                    fnc: '答案之书'
                }
            ]
        })
    }
    async 答案之书(e){
        const { config } = getconfig(`resources`, `boa`)
        let wenti = e.msg
        wenti = wenti.replace(/#?答案之书/g, '')
        const randomIndex = Math.floor(Math.random() * config.book_of_answers.length)
        const daan = config.book_of_answers[randomIndex];
        let msg =
`${e.nickname}
你的问题是:${wenti}
答案之书给出的答案是：
【${daan}】`
        e.reply(msg, true)
        return true
    }
}