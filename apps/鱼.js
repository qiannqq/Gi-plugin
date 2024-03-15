import common from'../../../lib/common/common.js'
import Fish from '../model/yu.js'

export class Gi_yu extends plugin {
    constructor () {
      super({
        name: 'Gi互动:钓鱼',
        dsc: 'Gi互动:钓鱼',
        event: 'message',
        priority: 5000,
        rule: [
          {
            reg: '^(#|/)?(钓鱼|🎣)$',
            fnc: 'diaoyu'
          }
        ]
      })
    }
    async diaoyu(e){
        // let time = await timerManager.getRemainingTime(e.user_id) 获取该用户的倒计时器
        // let timeSet = timerManager.createTimer(e.user_id, 120); timeSet.start(); 设置该用户的倒计时器
        let time = await timerManager.getRemainingTime(e.user_id)
        if(!time || time == 0) {
            let timeSet = timerManager.createTimer(e.user_id, 120)
            timeSet.start()
            let yu = await Fish.get_fish()
            await e.reply(`你开始了钓鱼……`)
            await common.sleep(2000)
            // randomNumber = Math.floor(Math.random() * 5) + 1;
            let yu_text = await Fish.fishing_text()
            yu_text = yu_text.replace(/【鱼】/g, yu)
            await e.reply([segment.at(e.user_id), '\n' + yu_text])
            return true
        } else {
            let randomNumber = Math.floor(Math.random() * 3) + 1;
            switch(randomNumber) {
                case 1:
                    await e.reply(`正在重新挂饵中……(${time}s)`)
                    break;
                case 2:
                    await e.reply(`鱼竿：你知道我想说什么。(鱼竿的假期还有${time}s结束)`)
                    break;
                case 3:
                    await e.reply(`鱼被吓跑了，它们需要些时间游回来……(${time}s)`)
                    break;
            }
            return true
        }
    }
}