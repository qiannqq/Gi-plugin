import { Gimodel, image } from '../model/index.js'
import fs from 'fs'
let GiPath = './plugins/Gi-plugin'

export class chafen extends plugin {
    constructor(){
        super({
            name: 'Gi互动:模拟高考查分',
            dsc: 'Gi互动:模拟高考查分',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^(#|/)?查分$',
                    fnc: '查分'
                }
            ]
        })
    }
    async 查分(e){
        let data = []
        data.push({ title: '考生姓名', value: this.nickname || this.e.nickname || e.sender.nickname || '未知考生' })
        data.push({ title: '考生号', value: e.user_id })
        if(!fs.existsSync(`${GiPath}/data/gaokao`)) await fs.promises.mkdir(`${GiPath}/data/gaokao`)
        let total_score = 0
        let subject
        if(fs.existsSync(`${GiPath}/data/gaokao/2024_${e.user_id}.json`)) {
            try {
                subject = JSON.parse(await fs.promises.readFile(`${GiPath}/data/gaokao/2024_${e.user_id}.json`, 'utf-8'))
            } catch (error) {
                subject = []
            }
        } else {
            subject = [
                { title: '语文', value: await Gimodel.getReadmeNumber(111, 40) },
                { title: '数学、物理', value: await Gimodel.getReadmeNumber(182, 70) },
                { title: '英语', value: await Gimodel.getReadmeNumber(111, 40) },
                { title: '生物、化学', value: await Gimodel.getReadmeNumber(142, 60) },
            ]
        }
        if(subject.length != 4) {
            await fs.promises.unlink(`${GiPath}/data/gaokao/2024_${e.user_id}.json`)
            await e.reply('查询失败，请稍后重试')
            return false
        }
        for (let item of subject) {
            total_score = total_score + item.value
        }
        data.push(...subject, { title: '总分', value: total_score })
        let { img } = await image(e, 'chafen', 'chafen', {
            data,
            vCode: await Gimodel.getRandom64Code()
        })
        await fs.promises.writeFile(`${GiPath}/data/gaokao/2024_${e.user_id}.json`, JSON.stringify(subject, null, 3), 'utf-8')
        await e.reply([segment.at(e.user_id), `\n考生号：${e.user_id}\n(每年仅能查一次)\n你的成绩为：`, img])
        return true;
    }
}