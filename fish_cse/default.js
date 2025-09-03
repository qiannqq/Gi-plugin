import getconfig from '../model/cfg.js'
import { Fish, common } from '../model/index.js'

export class fish_cse {
    constructor (e) {
        this.e = e
    }
    async probability() {
        return [
            {
                name: '空军',
                probability: 65
            },{
                name: '鲨鱼',
                probability: 30
            },{
                name: '炸弹',
                probability: 5
            }
        ]
    }
    async 空军(e) {
        let { config } = getconfig(`config`, `fishText`)
        let fishcd = 30
        let userBuff = JSON.parse(await redis.get(`Fishing:${e.user_id}_buff`))
        if(userBuff) {
          if(userBuff.number <= 0) {
            await redis.del(`Fishing:${e.user_id}_buff`)
          } else {
            fishcd = 10
          }
        }
        let timeSet = timerManager.createTimer(e.user_id, fishcd)
        timeSet.start()
        let text = config.nothingText[Math.floor(Math.random() * config.nothingText.length)]
        text = text.replace(/\n$/g, '')
        await e.reply([segment.at(e.user_id),'\n' + text])
        return true
    }
    async 鲨鱼(e) {
        let msg = [segment.at(e.user_id), `\n水库中突然窜出一条🦈，将你咬伤后逃窜。`]
        await e.reply(msg)
        await common.sleep(500)
        let { config } = getconfig(`config`, `config`)
        await e.reply(`你很疑惑，为什么淡水库会有鲨鱼？但医生告诉你：你和你的鱼竿需要住院休息。\n鱼竿的假期时间翻倍(${config.fishcd * 2}s)\n你可以花费5鱼币提前出院【#加急治疗】`)
        await redis.set(`Fishing:${e.user_id}:shayu`, `true`)
        let timeSet = timerManager.createTimer(e.user_id, config.fishcd * 2)
        timeSet.start()
    }

    async 炸弹(e) {
        let msg = [segment.at(e.user_id), `\n你钓上来了一个💣！炸弹爆炸了！`]
        await e.reply(msg)
        await common.sleep(500)
        
        // 减少鱼竿随机耐久度（20%-30%）
        let currentDurability = await Fish.get_fishing_rod_durability(e.user_id)
        let newDurability = await Fish.reduce_fishing_rod_durability(e.user_id, 0, true, 20, 30)
        
        await e.reply(`炸弹爆炸损坏了你的鱼竿！耐久度从${currentDurability}%降低到${newDurability}%`)
        
        // 如果耐久度为0，则发送提示
        if (newDurability <= 0) {
            await e.reply(`你的鱼竿已经完全损坏了！需要额外等待720秒才能继续钓鱼。`)
        }
    }
}