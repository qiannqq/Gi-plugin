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
        for (let item of config.fish_sale) {
            fishArray.push(item.type)
        }
        fishArray.push('特殊事件')
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
        let durability = await redis.get(`Fishing:${uid}:rod_durability`)
        if (!durability) {
            // 默认耐久度为100%
            durability = 100
            await redis.set(`Fishing:${uid}:rod_durability`, durability)
        }
        return Number(durability)
    }

    /**
     * 设置鱼竿耐久度
     * @param {number} uid 用户QQ
     * @param {number} durability 耐久度百分比
     */
    async set_fishing_rod_durability(uid, durability) {
        await redis.set(`Fishing:${uid}:rod_durability`, durability)
        return true
    }

    /**
     * 减少鱼竿耐久度
     * @param {number} uid 用户QQ
     * @param {number} amount 减少的百分比，如果为0则使用随机区间
     * @param {boolean} random 是否使用随机耐久度减少
     * @param {number} min 随机区间最小值（百分比）
     * @param {number} max 随机区间最大值（百分比）
     */
    async reduce_fishing_rod_durability(uid, amount = 0, random = false, min = 0.1, max = 10) {
        let currentDurability = await this.get_fishing_rod_durability(uid)
        
        let reductionAmount = amount
        if (random) {
            // 生成随机减少量
            reductionAmount = Math.random() * (max - min) + min
        }
        
        let newDurability = Math.max(0, currentDurability - reductionAmount)
        await this.set_fishing_rod_durability(uid, newDurability)
        return newDurability
    }

}
export default new Fish