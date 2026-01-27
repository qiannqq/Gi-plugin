import fs from 'fs'
import { getconfig, Gimodel } from './index.js'

let GiPath = `./plugins/Gi-plugin`

class Fish {
    /**
     * 取鱼
     * @param {number} uid 用户QQ号，用于创建独立的随机池
     * @param {string} waters 水域
     * @returns 
     */
    async get_fish(uid, waters = 'reservoir') {
        if(waters === 'reservoir') return await this.get_fish_reservoir(uid)
        if(waters === 'sea') return
        return
    }
    async get_fish_reservoir(uid) {
        let { config } = getconfig('config', 'config')
        let fishArray = []
        let rareFishArray = []
        
        // 分离普通鱼和稀有鱼
        for (let item of config.fish_sale) {
            // 稀有鱼判断：价格大于等于45
            if (item.price >= 45) {
                rareFishArray.push(item.type)
            } else {
                fishArray.push(item.type)
            }
        }
        
        fishArray.push('特殊事件')
        
        // 检查用户是否有幸运状态
        if (uid) {
            let luckyState = JSON.parse(await redis.get(`Fishing:${uid}_lucky_state`))
            if (luckyState && luckyState.remaining > 0) {
                // 减少幸运状态剩余次数
                luckyState.remaining--
                if (luckyState.remaining <= 0) {
                    await redis.del(`Fishing:${uid}_lucky_state`)
                } else {
                    await redis.set(`Fishing:${uid}_lucky_state`, JSON.stringify(luckyState))
                }
                
                // 幸运状态下20%概率生成稀有鱼
                if (rareFishArray.length > 0 && Math.random() < 0.2) {
                    return rareFishArray[Math.floor(Math.random() * rareFishArray.length)]
                }
            }
        }
        
        // 普通情况下检查是否生成稀有鱼
        if (uid && rareFishArray.length > 0 && Math.random() < 0.05) {
            return rareFishArray[Math.floor(Math.random() * rareFishArray.length)]
        }
        
        if(!uid) return fishArray[Math.floor(Math.random() * fishArray.length)]
        let user_random_pool = []
        try {
            user_random_pool = JSON.parse(await redis.get(`giplugin_urp:${uid}`))
            if(!user_random_pool) {
                user_random_pool = []
            }
        } catch {}
        if(user_random_pool.length <= 0) {
            user_random_pool = fishArray
            for (let i = user_random_pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [user_random_pool[i], user_random_pool[j]] = [user_random_pool[j], user_random_pool[i]];
            }
            var target_fish = user_random_pool[0]
            let urp = []
            for (let item of user_random_pool) {
                if(item != user_random_pool[0]) urp.push(item)
            }
            // user_random_pool 初始的用户随机池数组
            // target_fish return
            // urp 去除target_fish的随机池数组
            await redis.set(`giplugin_urp:${uid}`, JSON.stringify(urp))
            return target_fish
        } else {
            var target_fish = user_random_pool[0]
            let urp = []
            for (let item of user_random_pool) {
                if(item != user_random_pool[0]) urp.push(item)
            }
            // user_random_pool 初始的用户随机池数组
            // target_fish return
            // urp 去除target_fish的随机池数组
            if(urp.length <= 0) {
                await redis.del(`giplugin_urp:${uid}`)
            } else {
                await redis.set(`giplugin_urp:${uid}`, JSON.stringify(urp))
            }
            return target_fish
        }
    }
    async fishing_text() {
        let { config } = getconfig('config', 'fishText')
        let textList = config
        return textList.fishText[Math.floor(Math.random() * textList.fishText.length)]
    }
    /**
     * 存鱼
     * @param {number} uid e.user_id 用户QQ
     * @param {string} yu 鱼，fish
     */
    async wr_bucket(uid, yu) {
        let a = `utf-8`
        if(!fs.existsSync(GiPath + `/data`)) {
            fs.mkdirSync(GiPath + `/data`)
        }
        if(!fs.existsSync(GiPath + `/data/fishing`)) {
            fs.mkdirSync(GiPath + '/data/fishing')
        }
        let playerInfo
        try {
            playerInfo = fs.readFileSync(GiPath + `/data/fishing/${uid}.json`, a)
            playerInfo = JSON.parse(playerInfo)
        } catch {
            playerInfo = []
        }
        let number
        for(let item of playerInfo) {
            if(item.fishType == yu) {
                item.number++
                number = true
            }
        }
        if(!number) {
            playerInfo.push({ fishType: yu, number: 1 })
        }
        playerInfo = JSON.stringify(playerInfo, null, 3)
        fs.writeFileSync(GiPath + `/data/fishing/${uid}.json`, playerInfo, a)
        return true
    }
    /**
     * 水桶信息
     * @param {number} uid e.user_id 用户QQ
     * @returns 
     */
    async getinfo_bucket(uid) {
        let a = 'utf-8'
        if(!fs.existsSync(GiPath + '/data/fishing') || !fs.existsSync(GiPath + `/data/fishing/${uid}.json`)) {
            return []
        }
        let playerBucket
        try {
            playerBucket = JSON.parse(fs.readFileSync(GiPath + `/data/fishing/${uid}.json`), a)
        } catch (error) {
            playerBucket = []
        }
        return playerBucket
    }
    /**
     * 为用户的钓鱼账户增加鱼币
     * @param {number} uid 用户QQ
     * @param {number} number 增加的鱼币数量
     * @param {string} nickname e.nickname 用户名称，用于鱼布斯财富榜
     * @returns 
     */
    async wr_money(uid, number, nickname) {
        let a = 'utf-8'
        let playerList_money
        if(!fs.existsSync(GiPath + `/data/fishing`)) {
            fs.mkdirSync(GiPath + `/data/fishing`)
        }
        try {
            playerList_money = JSON.parse(fs.readFileSync(GiPath + `/data/fishing/PlayerListMoney.json`, a))
        } catch {
            playerList_money = []
        }
        let playerInfo = []
        for (let item of playerList_money) {
            if(item.uid == uid) playerInfo.push(item)
        }
        if(playerInfo.length == 0){
            playerInfo.push({ uid: uid, uname: nickname, money: number })
        } else {
            await Gimodel.deljson(playerInfo[0], GiPath + `/data/fishing/PlayerListMoney.json`)
            if(!playerInfo[0].uname){
                playerInfo[0] = {
                    uid,
                    uname: nickname,
                    money: playerInfo[0].money + number,
                }
            } else {
                playerInfo[0].money = playerInfo[0].money + number
            }
        }
        try {
            playerList_money = JSON.parse(fs.readFileSync(GiPath + `/data/fishing/PlayerListMoney.json`, a))
        } catch (error) {
            playerList_money = []
        }
        playerList_money.push(playerInfo[0])
        fs.writeFileSync(GiPath + `/data/fishing/PlayerListMoney.json`, JSON.stringify(playerList_money, null, 3), a) //打字的时候越看这个M越像猫猫，看来我是缺猫了()
        return true
    }
    /**
     * 删鱼
     * @param {number} uid e.user_id 用户QQ
     * @param {string} fish fish 鱼
     * @param {number} number number 数量，不填默认1
     * @returns 
     */
    async del_fish(uid, fish, number = 1){
        let a = `utf-8`
        let playerBucket = await this.getinfo_bucket(uid)
        let targetFish = []
        for (let item of playerBucket) {
            if(item.fishType == fish) targetFish.push(item)
        }
        await Gimodel.deljson(targetFish[0], GiPath + `/data/fishing/${uid}.json`)
        targetFish[0].number = targetFish[0].number - number
        playerBucket = await this.getinfo_bucket(uid)
        playerBucket.push(targetFish[0])
        fs.writeFileSync(GiPath + `/data/fishing/${uid}.json`, JSON.stringify(playerBucket, null, 3), a)
        return true
    }
    /**
     * 获取用户的鱼币数量
     * @param {number} uid e.user_id 用户QQ
     * @returns
     */

    async get_usermoneyInfo(uid, cc = false){
        let a = `utf-8`
        let userNumber
        let b
        try {
            b = JSON.parse(fs.readFileSync(GiPath + `/data/fishing/PlayerListMoney.json`, a))            
        } catch (error) {
            b = []
        }
        for (let c of b) {
            if(c.uid == uid) userNumber = c
        }
        if(cc) return userNumber
        if(!userNumber) return 0
        return userNumber.money
    }
    /**
     * 扣钱
     * @param {number} uid e.user_id 用户QQ
     * @param {number} number 扣多少钱
     * @returns 
     */
    async deduct_money(uid, number) {
        let a = `utf-8`
        let userMoney = await this.get_usermoneyInfo(uid, true)
        await Gimodel.deljson(userMoney, GiPath + `/data/fishing/PlayerListMoney.json`)
        let data
        try {
            data = JSON.parse(fs.readFileSync(GiPath + `/data/fishing/PlayerListMoney.json`, a))
        } catch (error) {
            data = []
        }
        userMoney.money = userMoney.money - number;
        data.push(userMoney)
        fs.writeFileSync(GiPath + `/data/fishing/PlayerListMoney.json`, JSON.stringify(data, null, 3), a)
        return true
    }
    /**
     * 获取鱼的价格
     * @param {string} fish 鱼
     */
    async get_fish_price(fish){
        let { config } = getconfig(`config`, `config`)
        for(let item of config.fish_sale) {
            if(item.type === fish) return item.price
        }
    }

    /**
     * 获取鱼竿耐久度
     * @param {number} uid 用户QQ
     */
    async get_fishing_rod_durability(uid) {
    const key = `Fishing:${uid}:rod_durability`
    let val = await redis.get(key)

    if (val === null) {// 新用户
        await redis.set(key, 100)
        return 100
    }

    // 如果是整数直接返回
    if (/^\d+$/.test(val)) return Number(val)

    // 检测超长小数（≥4 位）
    if (/^\d+\.\d{4,}$/.test(val)) {
        const fixed = Math.max(0, Math.min(100, Math.round(Number(val))))
        await redis.set(key, fixed)     // 立即回写整数
        logger.mark(`[Fishing] 自动净化 ${uid} 的鱼竿耐久度 ${val} → ${fixed}`)
        return fixed
    }

    // 普通小数（1~3 位）直接四舍五入一次，也回写
    const rounded = Math.max(0, Math.min(100, Math.round(Number(val))))
    await redis.set(key, rounded)
    return rounded
    }

    /**
     * 设置鱼竿耐久度
     */
    async set_fishing_rod_durability(uid, durability) {
    durability = Math.max(0, Math.min(100, Math.round(durability)))
    await redis.set(`Fishing:${uid}:rod_durability`, durability)
    return true
    }

    /**
     * 减少耐久度（amount 支持整数或随机整数百分点）
     */
    async reduce_fishing_rod_durability(uid, amount = 0, random = false, min = 1, max = 10) {
    const cur = await this.get_fishing_rod_durability(uid) // 已保证整数
    const delta = random
        ? Math.floor(Math.random() * (max - min + 1)) + min
        : Math.round(amount)
    const next = Math.max(0, cur - delta)
    await this.set_fishing_rod_durability(uid, next)
    return next
    }
}
export default new Fish