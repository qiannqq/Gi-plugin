import fs from 'fs'
import { common, Fish, getconfig, Gimodel } from '../model/index.js'

let status = {}

export class Gi_yu extends plugin {
  constructor() {
    super({
      name: 'Gi小游戏:钓鱼',
      dsc: 'Gi小游戏:钓鱼',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^(#|/)?(钓鱼|🎣)$',
          fnc: 'diaoyu'
        },
        {
          reg: '^(#|/)?(我的)?(水桶|🪣)$',
          fnc: 'user_bucket'
        },
        {
          reg: '^(#|\/)?出售(.*)\*(.*)$',
          fnc: '出售'
        },
        {
          reg: '^(#|/)?(我的)?(鱼币|金币|💰|钱包)$',
          fnc: 'user_money'
        },
        {
          reg: '^(#|/)?(鱼布斯)?(财富|💰)榜$',
          fnc: 'wealth_list'
        },
        {
          reg: '^(#|/)?加急治疗$',
          fnc: '加急治疗'
        },
        {
          reg: '^(#|/)?修改(钓鱼|🎣)昵称(.*)?$',
          fnc: 'change_nickname'
        },
        {
          reg: '^(#|/)?一键出售所有鱼$',
          fnc: 'sell_all_fish'
        },
        {
          reg: /^(#|\/)?小卖铺(购买.*)?(\*\d*)?$/,
          fnc: 'fish_shop'
        },
        {
          reg: '^(#|/)?(开始)?捕(捞|鱼|渔)$',
          fnc: 'fish_for'
        },
        {
          reg: '^(#|/)?我的(鱼竿|🎣)$',
          fnc: 'my_fishing_info'
        },
        // {
        //   reg: '^(#|/)?出海钓鱼(.*)$',
        //   fnc: 'fishing_at_sea'
        // }
      ]
    })
  }
  async fishing_at_sea(e) {
    
  }
  async my_fishing_info(e) {
      // 写入状态，以免造成并发问题
      let key = `PlayerListMoney:${e.user_id}`
      if(status[key] || status['PlayerListMoney']) return true
      status[key] = true

      let uid = e.user_id
      if(e.at) uid = e.at
      let userInfo;
      try {
        userInfo = JSON.parse(fs.readFileSync(`./plugins/Gi-plugin/data/fishing/PlayerListMoney.json`))
      } catch {}
      let userName
      if(userInfo) {
        for (let item of userInfo) {
          if(item.uid == uid && item.uname) userName = item.uname
        }
      }
      let userMoney = await Fish.get_usermoneyInfo(uid)
      let userBuff
      try {
        userBuff = JSON.parse(await redis.get(`Fishing:${uid}_buff`))
        userBuff = userBuff.number
      } catch {}
      let UserFishFor
      try {
        UserFishFor = JSON.parse(await redis.get(`Fishing:${uid}_fishfor`))
        UserFishFor = UserFishFor.number
      } catch {}
      let FishingCD = await timerManager.getRemainingTime(uid)
      let FishforCD = await timerManager.getRemainingTime(uid + 101)
      if(FishingCD < 0) FishingCD = 0
      if(FishforCD < 0) FishforCD = 0
      let msg = [
        segment.at(uid),
        `\n钓鱼昵称:${userName || `不知名的钓鱼佬`}`,
        `\n鱼币数量:${userMoney}`,
        `\n润滑油数量:${userBuff || 0}`,
        `\n捕鱼网数量:${UserFishFor || 0}`,
        `\n钓鱼竿冷却:${await timerManager.getRemainingTime(uid) || 0}s`,
        `\n捕鱼网冷却:${await timerManager.getRemainingTime(uid + 101) || 0}s`
      ]
      await e.reply(msg)
      delete status[key]
      return true
  }
  async fish_for(e) {
      // let time = await timerManager.getRemainingTime(e.user_id) 获取该用户的倒计时器
      // let timeSet = timerManager.createTimer(e.user_id, 120); timeSet.start(); 设置该用户的倒计时器
      let time = await timerManager.getRemainingTime(e.user_id + 101)
      let diaoyugantime = await timerManager.getRemainingTime(e.user_id)
      if(diaoyugantime >= 1 && await redis.get(`Fishing:${e.user_id}:shayu`)) {
        await e.reply(`你和你的鱼竿还在住院中，距离出院还有${diaoyugantime}s……\n你可以花费5鱼币提前出院【#加急治疗】`)
        return true
      } else {
        await redis.del(`Fishing:${e.user_id}:shayu`)
      }
      if(!time || time <= 0) {
        let key = `bucket:${e.user_id}`
        if(status[key]) return true
        status[key] = true
        let UserFishFor = JSON.parse(await redis.get(`Fishing:${e.user_id}_fishfor`))
        if(!UserFishFor || UserFishFor.number <= 0) {
          await e.reply(`你似乎没有捕鱼网呢，去【#小卖铺】购买捕鱼网再来使用吧~`)
          delete status[key]
          return true
        }
        let { config } = getconfig(`config`, `config`)
        let timeSet = timerManager.createTimer(e.user_id + 101, config.fishcd * 7); timeSet.start()
        UserFishFor = {
          number: UserFishFor.number - 1
        }
        if(UserFishFor.number <= 0) {
          await redis.del(`Fishing:${e.user_id}_fishfor`)
        } else {
          await redis.set(`Fishing:${e.user_id}_fishfor`, JSON.stringify(UserFishFor))
        }
        await e.reply(`你开始了捕鱼……`, false, { recallMsg: 5 })
        await common.sleep(2000)
        let msgList = [segment.at(e.user_id), `\n捕鱼网捞上来了，你获得了：`]
        let yuList = {}
        for (let i = 0; i < 7; i++) {
          let yu = await Fish.get_fish()
          if(yu == `特殊事件`) continue
          await Fish.wr_bucket(e.user_id, yu)
          delete status[key]
          if(yuList[yu]) {
            yuList[yu]++
          } else {
            yuList[yu] = 1
          }
        }
        for (let item in yuList) {
          msgList.push(`\n`+item+` x `+yuList[item])
        }
        await e.reply(msgList)
        return true
      } else {
        await e.reply(`河里的鱼需要休息……(${time}s)`)
        return true
      }
  }
  async fish_shop(e) {
    let command = e.msg.match(/^(#|\/)?小卖铺(购买.*)?(\*\d+)?$/)
    let { config } = getconfig(`defSet`, `shop`)
    if(!command[2]) {
      let msgList = [{nickname: Bot.nickname, user_id: Bot.uin, message: `水库边的小卖铺~`}]
      let rawMsg = []
      for (let item of config.shop) {
        msgList.push({
          nickname: Bot.nickname,
          user_id: Bot.uin,
          message: `商品名称:${item.name}\n商品描述:${item.desc}\n商品价格:${item.price}鱼币\n购买方式:发送#小卖铺购买${item.name}*1`
        })
        rawMsg.push(`商品名称:${item.name}\n商品描述:${item.desc}\n商品价格:${item.price}鱼币\n购买方式:发送#小卖铺购买${item.name}*1`)
      }
      let msg;
      try {
        try {
          msg = await Bot.pickUser(e.user_id).makeForwardMsg(msgList)
        } catch {
          msg = await e.group.makeForwardMsg(msgList)
        }
      } catch {
        msg = rawMsg.join('\n\n')
      }
      await e.reply(msg)
      return true
    } else {
      let buyNumber
      try {
        buyNumber = command[2].match(/.*\*(.*)/)[1]
      } catch { }
      let key = 'PlayerListMoney'
      if(status[key]) return true
      status[key] = true
      let product_info;
      command[2] = command[2].replace(/购买|\*\d*/g, ``)
      for (let item of config.shop) {
        if(command[2] === item.name) product_info = item 
      }
      if(!product_info) {
        await e.reply(`啊嘞，小卖铺好像没有找到你要买的东西呢`)
        delete status[key]
        return true
      }
      if(buyNumber) {
        buyNumber = buyNumber.replace(/\*/, ``)
        buyNumber = Number(buyNumber)
        if(typeof buyNumber === 'number') {
          product_info.price = product_info.price * buyNumber
        }
      }
      if(await Fish.get_usermoneyInfo(e.user_id) < product_info.price) {
        await e.reply([segment.at(e.user_id), `\n小卖铺老板疑惑的看向你兜里的${await Fish.get_usermoneyInfo(e.user_id)}个鱼币，你尴尬的笑了笑。`])
        delete status[key]
        return true
      }
      if(buyNumber <= 0) { 
        await e.reply(`小卖铺老板：你是故意找茬是不是？`)
        delete status[key]
        return true
       }
      switch(product_info.name) {
        case('钓鱼竿润滑油'):
          let userBuff = JSON.parse(await redis.get(`Fishing:${e.user_id}_buff`))
          if(userBuff) {
            var number = userBuff.number  
          } else {
            var number = 0
          }
          let BuffData = {
            buffname: `钓鱼竿润滑油`,
            number: number + 5 * ( buyNumber || 1 )
          }
          await redis.set(`Fishing:${e.user_id}_buff`, JSON.stringify(BuffData))
          break;
        case('捕鱼网'):
          let UserFishFor = JSON.parse(await redis.get(`Fishing:${e.user_id}_fishfor`))
          if(UserFishFor) {
            var number = UserFishFor.number
          } else {
            var number = 0
          }
          let FishforData = {
            number: number + 1 * ( buyNumber || 1 )
          }
          await redis.set(`Fishing:${e.user_id}_fishfor`, JSON.stringify(FishforData))
          break;
        case('捕鱼船票'):
          break;
      }
      await Fish.deduct_money(e.user_id, product_info.price)
      delete status[key]
      await e.reply(`你花费了${product_info.price}鱼币购买了${buyNumber || 1}个${product_info.name}~`)
    }
    return true
  }
  async sell_all_fish(e) {
    let key = 'PlayerListMoney'
    if(status[key]) return true
    status[key] = true
    let userBucket = await Fish.getinfo_bucket(e.user_id)
    if(!userBucket || userBucket.length <= 0) {
      await e.reply(`你似乎没有鱼可以出售呢~`)
      delete status[key]
      return true
    }
    let number = 0
    for (let item of userBucket) {
        let fish_price = await Fish.get_fish_price(item.fishType)
        number = number + item.number * fish_price
        await Fish.del_fish(e.user_id, item.fishType, item.number)
    }
    if(number <= 0) {
      await e.reply(`你似乎没有鱼可以出售呢~`)
      delete status[key]
      return true
    }
    await Fish.wr_money(e.user_id, number, e.nickname)
    delete status[key]
    await e.reply(`出售成功，获得了${number}鱼币`)
    return true
  }
  async change_nickname(e){
    //读取状态，以免造成并发问题
    if(status[`PlayerListMoney:${e.user_id}`] || status[`PlayerListMoney`]) return true
    if(!await Fish.get_usermoneyInfo(e.user_id, true)) {
      await e.reply(`你还没有出售过鱼，请先出售一次鱼在尝试修改昵称吧~`)
      return true
    }
    let msg = e.msg.match(/^(#|\/)?修改(钓鱼|🎣)昵称(.*)?$/)
    if(!msg[3]) {
      e.reply([segment.at(e.user_id), `\n请输入昵称后再尝试修改昵称呢\n例如：#修改🎣昵称张三`])
      return true
    }
    await e.reply([segment.at(e.user_id), `\n修改昵称需要花费30鱼币的改名费，是否继续？\n【#确认支付】`])
    this.setContext(`change_nickname_`)
  }
  async change_nickname_(e) {
    //写入状态，以免造成并发问题
    let key = 'PlayerListMoney'
    status[key] = true

    this.finish(`change_nickname_`)
    if(this.e.msg != `#确认支付`) {
      e.reply(`你取消了支付`)
      delete status[key]
      return true
    }
    if(await Fish.get_usermoneyInfo(e.user_id) < 5) {
      await e.reply(`啊嘞，你的钱似乎不够支付改名费呢~`)
      delete status[key]
      return true
    }
    await Fish.deduct_money(e.user_id, 30)
    let userInfo = await Fish.get_usermoneyInfo(e.user_id, true)
    await Gimodel.deljson(userInfo, `./plugins/Gi-plugin/data/fishing/PlayerListMoney.json`)
    let nickname = e.msg.match(/^(#|\/)?修改(钓鱼|🎣)昵称(.*)?$/)[3]
    userInfo = {
      uid: userInfo.uid,
      uname: nickname,
      money: userInfo.money
    }
    let alluserInfo
    try {
      alluserInfo = JSON.parse(fs.readFileSync(`./plugins/Gi-plugin/data/fishing/PlayerListMoney.json`, `utf-8`))
    } catch {
      alluserInfo = []
    }
    alluserInfo.push(userInfo)
    fs.writeFileSync(`./plugins/Gi-plugin/data/fishing/PlayerListMoney.json`, JSON.stringify(alluserInfo, null, 3), `utf-8`)
    delete status[key]
    await e.reply(`你的🎣昵称已修改为【${nickname}】`)
    return true
  }
  async 加急治疗(e) {
    if(status[`PlayerListMoney:${e.user_id}`] || status[`PlayerListMoney`]) return true
    let time = await timerManager.getRemainingTime(e.user_id)
    if(!time || time == 0 ||!await redis.get(`Fishing:${e.user_id}:shayu`)) {
      await e.reply(`你很健康，不需要加急治疗~`)
      return true
    }
    await e.reply(`你需要支付5鱼币以加急治疗，是否支付？\n【#确认支付】`)
    this.setContext('加急治疗_')
  }
  async 加急治疗_(e) {
    let key = 'PlayerListMoney'
    status[key] = true
    this.finish(`加急治疗_`)
    if(this.e.msg == `#确认支付`) {
      if(await Fish.get_usermoneyInfo(e.user_id) < 5) {
        await e.reply([segment.at(e.user_id), `\n医生疑惑的看向你兜里的${await Fish.get_usermoneyInfo(e.user_id)}个鱼币，你尴尬的笑了笑。`])
        return true
      }
      let timeSet = timerManager.createTimer(e.user_id, 3)
      timeSet.start()
      await redis.del(`Fishing:${e.user_id}:shayu`)
      await e.reply([segment.at(e.user_id), `\n在医生的全力以赴下，你健康的出了院~`])
      await Fish.deduct_money(e.user_id, 5)
      delete status[key]
      return true
    } else {
      await e.reply(`你取消了支付。`)
      delete status[key]
    }
  }
  async wealth_list (e) {
    let PlayerMoneyList
    try {
      PlayerMoneyList = JSON.parse(fs.readFileSync(`./plugins/Gi-plugin/data/fishing/PlayerListMoney.json`))
    } catch (error) {
      PlayerMoneyList = []
    }
    if(PlayerMoneyList.length <= 0) {
      await e.reply(`还没有人上榜哦~`)
      return true
    }
    PlayerMoneyList.sort((a, b) => b.money - a.money)
    PlayerMoneyList = PlayerMoneyList.slice(0, 10)
    let msg = [`鱼布斯最新A市财富榜前十名：`]
    let paiming = 0
    for (let item of PlayerMoneyList) {
      paiming++;
      msg.push(`\n第${paiming}名: ${item.uname || `不知名的钓鱼佬`} · ${item.money}鱼币`)
    }
    await e.reply(msg)
    return true
  }
  async user_money(e) {
    await e.reply(`你的兜里还剩${await Fish.get_usermoneyInfo(e.user_id)}个鱼币~`)
  }
  async 出售(e) {
    let key = 'PlayerListMoney'
    if (status[key]) return true
    status[key] = true
    try {
      let { config } = getconfig(`config`, `config`)
      let playerBucket = await Fish.getinfo_bucket(e.user_id)
      if (playerBucket.length == 0) {
        await e.reply(`你没有鱼可以出售哦~`)
        delete status[key]
        return true
      }
      let fishArray = []
      for (let item of config.fish_sale) {
        fishArray.push(item.type)
      }
      let msg = e.msg.match(/^(#|\/)?出售(.*)\*(.*)?$/)
      if (!fishArray.includes(msg[2])) {
        await e.reply(`啊嘞，生物百科好像没有你说的鱼呢~`)
        delete status[key]
        return true
      }
      let fish_sale = []
      for (let item of playerBucket) {
        if (item.fishType == msg[2]) {
          fish_sale.push(item)
        }
      }
      if (fish_sale[0].number <= 0 || fish_sale.length == 0) {
        e.reply(`啊嘞，你好像没有${msg[2]}呢~`)
        delete status[key]
        return true
      }
      if (msg[3] && msg[3] > 1) {
        if (fish_sale[0].number < msg[3]) {
          e.reply(`啊嘞，数量不够哎？不要虚报数量哦~`)
          delete status[key]
          return true
        }
        let price;
        for (let item of config.fish_sale) {
          if (item.type == msg[2]) price = item.price
        }
        price = price * msg[3]
        await Fish.wr_money(e.user_id, price, e.nickname)
        await Fish.del_fish(e.user_id, msg[2], msg[3])
        await e.reply(`出售成功，获得了${price}鱼币`)
      } else {
        let price;
        for (let item of config.fish_sale) {
          if (item.type == msg[2]) price = item.price
        }
        await Fish.wr_money(e.user_id, price, e.nickname)
        await Fish.del_fish(e.user_id, msg[2])
        await e.reply(`出售成功，获得了${price}鱼币`)
      }
      delete status[key]
    } catch (error) {
      await e.reply('出售失败，请检查你是否有这条鱼')
      delete status[key]
    }
  }
  async user_bucket(e) {
    let playerBucket = await Fish.getinfo_bucket(e.user_id)
    if (playerBucket.length == 0) {
      await e.reply(`你的水桶里好像是空的呢，钓点鱼进来再查看水桶吧！`)
      return true
    }
    let msgList = [segment.at(e.user_id), `\n你的水桶里有……`]
    for (let item of playerBucket) {
      if (item.number > 0) {
        msgList.push(`\n${item.fishType} x ${item.number}`)
      }
    }
    if(msgList.length <= 2) {
      msgList.push(`\n空空如也~`)
    }
    await e.reply(msgList)
    return true
  }
  async diaoyu(e) {
    // let time = await timerManager.getRemainingTime(e.user_id) 获取该用户的倒计时器
    // let timeSet = timerManager.createTimer(e.user_id, 120); timeSet.start(); 设置该用户的倒计时器
    let time = await timerManager.getRemainingTime(e.user_id)
    if (!time || time <= 0) {
      let key = `bucket:${e.user_id}`
      if(status[key]) return true
      status[key] = true

      if(await redis.get(`Fishing:${e.user_id}:shayu`)) {
        redis.del(`Fishing:${e.user_id}:shayu`)
      }
      let { config } = getconfig(`config`, `config`)
      let userBuff = JSON.parse(await redis.get(`Fishing:${e.user_id}_buff`))
      if(userBuff) {
        if(userBuff.number <= 0) {
          await redis.del(`Fishing:${e.user_id}_buff`)
        } else {
          userBuff.number = userBuff.number - 1
          config.fishcd = 10
          await redis.set(`Fishing:${e.user_id}_buff`, JSON.stringify(userBuff))
        }
      }
      let timeSet = timerManager.createTimer(e.user_id, config.fishcd)
      timeSet.start()
      let yu = await Fish.get_fish(e.user_id)
      await e.reply(`你开始了钓鱼……`, false, { recallMsg: 5 })
      await common.sleep(2000)
      
      if (yu == `特殊事件`) {
        await this.特殊事件(e)
        delete status[key]
        return true
      }
      let yu_text = await Fish.fishing_text()
      yu_text = yu_text.replace(/【鱼】/g, yu)
      yu_text = yu_text.replace(/\n$/g, '')
      await e.reply([segment.at(e.user_id), '\n' + yu_text])
      delete status[key]
      await Fish.wr_bucket(e.user_id, yu)
      return true
    } else {
      if(await redis.get(`Fishing:${e.user_id}:shayu`)) {
        await e.reply(`你和你的鱼竿还在住院中，距离出院还有${time}s……\n你可以花费5鱼币提前出院【#加急治疗】`)
        return true
      }
      let randomNumber = Math.floor(Math.random() * 3) + 1;
      switch (randomNumber) {
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
  async 特殊事件(e) {
      try {
        const { fish_cse } = await import(`../fish_cse/default.js`)
        let new_fish_cse = new fish_cse(e)
        let cse_probability = await new_fish_cse.probability()
        let fnc_name = await Gimodel.getRandomName(cse_probability)
        await new_fish_cse[fnc_name](e)
        return true
      } catch (error) {
        return true
      }
  }
  // async se空军(e){
  //   let { config } = getconfig(`config`, `fishText`)
  //   let fishcd = 30
  //   let userBuff = JSON.parse(await redis.get(`Fishing:${e.user_id}_buff`))
  //   if(userBuff) {
  //     if(userBuff.number <= 0) {
  //       await redis.del(`Fishing:${e.user_id}_buff`)
  //     } else {
  //       fishcd = 10
  //     }
  //   }
  //   let timeSet = timerManager.createTimer(e.user_id, fishcd)
  //   timeSet.start()
  //   let text = config.nothingText[Math.floor(Math.random() * config.nothingText.length)]
  //   text = text.replace(/\n$/g, '')
  //   await e.reply([segment.at(e.user_id),'\n' + text])
  //   return true
  // }
  // async se鲨鱼(e){
  //   let msg = [segment.at(e.user_id), `\n水库中突然窜出一条🦈，将你咬伤后逃窜。`]
  //   await e.reply(msg)
  //   await common.sleep(500)
  //   let { config } = getconfig(`config`, `config`)
  //   await e.reply(`你很疑惑，为什么淡水库会有鲨鱼？但医生告诉你：你和你的鱼竿需要住院休息。\n鱼竿的假期时间翻倍(${config.fishcd * 2}s)\n你可以花费5鱼币提前出院【#加急治疗】`)
  //   await redis.set(`Fishing:${e.user_id}:shayu`, `true`)
  //   let timeSet = timerManager.createTimer(e.user_id, config.fishcd * 2)
  //   timeSet.start()
  //   // e.group.muteMember(e.user_id, 60)
  // }
}