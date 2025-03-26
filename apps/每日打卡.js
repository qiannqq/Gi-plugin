import plugin from '../../../lib/plugins/plugin.js';
import image from '../model/image.js';
import getconfig from '../model/cfg.js';
import { promises as fs } from 'fs'
import fs_ from 'fs'
import Gimodel from '../model/getFile.js'

export class meiridaka extends plugin {
    constructor(){
      super({
        name: 'Gi互动:每日打卡',
        dsc: 'Gi互动:每日打卡',
        event: 'message',
        priority: 500,
        rule:[
            {
                reg: '^(#|/)?每日打卡$',
                fnc: '每日打卡'
            },
            {
                reg: '^(#|/)?今日欧皇$',
                fnc: '今日欧皇'
            },
            {
                reg: '^(#|/)?让我看看你的卡(.*)$',
                fnc: 'looklookyou'
            },
            {
                reg: '^(#|/)?今日非酋$',
                fnc: '今日非酋'
            },
            {
                reg: '^(#|/)?历史幸运值$',
                fnc: '历史幸运值'
            },
            {
                reg: '^(#|/)?幸运值排行榜(欧皇|非酋)?榜?$',
                fnc: 'luckValue_list'
            }
        ]
      });
    }
    async luckValue_list(e){
      let msg = e.msg.match(/^(#|\/)?幸运值排行榜(欧皇|非酋)?榜?$/)
      let date_time = await Gimodel.date_time()
      if(!fs_.existsSync(`plugins/Gi-plugin/resources/mrdk/${date_time}.json`)){
        await e.reply(`今天好像还没有人打卡呢`)
        return true;
      }
      let date_time2 = await redis.get(`Yunzai:meiridaka3qn:${e.user_id}_daka`);date_time2 = JSON.parse(date_time2);
      if (date_time !== date_time2) {
        e.reply(`你今天还没有打卡，无法查看幸运值排行榜哦~`)
        return;
      }
      let luckValue_data = await fs.readFile(`plugins/Gi-plugin/resources/mrdk/${date_time}.json`, `utf-8`)
      luckValue_data = JSON.parse(luckValue_data)
      let i_luckValue_data = luckValue_data
      if(msg[2] == `欧皇` || !msg[2]) {
        luckValue_data.sort((a, b) => b.user_luckvalue - a.user_luckvalue);
      } else if(msg[2] == `非酋`) {
        luckValue_data.sort((b, a) => b.user_luckvalue - a.user_luckvalue);
      } else {
        return true;
      }
      luckValue_data = luckValue_data.slice(0, 20)
      let new_luckValue_data = [];
      let rankings = 1
      for (let item of luckValue_data){
        new_luckValue_data.push({
          rankings,
          user_id: item.user_id,
          user_img: item.user_img,
          user_name: item.user_name,
          user_luckvalue: item.user_luckvalue
        })
        rankings++;
      }
      let iluckValue_data;
      for (let item of i_luckValue_data) {
        if(item.user_id == e.user_id) {
          iluckValue_data = {
            user_id: e.user_id,
            user_img: item.user_img,
            user_name: item.user_name,
            user_luckvalue: item.user_luckvalue
          }
        }
      }
      for (let item of new_luckValue_data){
        if(item.user_id == e.user_id) {
          iluckValue_data.rankings = item.rankings
        }
      }

      if(!iluckValue_data.rankings){
        iluckValue_data.rankings = `未上榜`
      }
      
      let title;

      if(msg[2] == `欧皇` || !msg[2]) {
        title = `#幸运值排行-欧皇日榜`
      } else if(msg[2] == `非酋`) {
        title = `#幸运值排行-非酋日榜`
      }

      let {img} = await image(e, `luckValue_list`, `luckValue_list`, {new_luckValue_data, iluckValue_data, title, version: GiPluginVersion})
      e.reply(img)
    }
    async 历史幸运值(e){
      if(!fs_.existsSync(`plugins/Gi-plugin/resources/mrdk/${e.user_id}.txt`)){
        e.reply(`你似乎没有打过卡呢~`)
        return true;
      }
      let data = await fs.readFile(`plugins/Gi-plugin/resources/mrdk/${e.user_id}.txt`, `utf-8`)
      e.reply(`你的历史幸运值是……\n${data}`)
      return true;
    }
    async 今日非酋(e) {
      const date_time = await Gimodel.date_time()
      let date_time2 = await redis.get(`Yunzai:fqiuriqi_daka`);date_time2 = JSON.parse(date_time2);
      if (date_time !== date_time2){
        let msg = [
          segment.at(e.user_id),
          `\n今天的非酋还没诞生喵~`
        ]
        e.reply(msg)
        return;
      }
      let fqiuname = await redis.get(`Yunzai:fqiuname_daka`);fqiuname = JSON.parse(fqiuname);
      let fqiuqq = await redis.get(`Yunzai:fqiuqq_daka`);fqiuqq = JSON.parse(fqiuqq);
      let zhi =  await redis.get(`Yunzai:fqiuzhi_daka`);zhi = JSON.parse(zhi)
      let msg = [`今日的首个非酋已诞生！！！！\nta的名字：【${fqiuname}】\nta的幸运值是：${zhi} ！！！`]
      e.reply(msg)
      return true;
    }
    async 每日打卡(e) {
      logger.mark(e.user_id)
        //获取当前日期
        const date_time = await Gimodel.date_time()
        let date_time2 = await redis.get(`Yunzai:meiridaka3qn:${e.user_id}_daka`);date_time2 = JSON.parse(date_time2);//获取用户最后一次打卡日期
        const zhi1 = await redis.get(`Yunzai:meiridakazhi:${e.user_id}_daka`);//获取用户最后一次打卡的幸运值
        //判断该用户的上一次抽取时间是否是今天
        if (date_time === date_time2) {
            let msg = [
                segment.at(e.user_id),
                `\n你今天已经打过卡了喵~\n你今天的幸运值是`+zhi1+`，可别再忘掉哦喵~`
            ]
            e.reply(msg)
            return;
        }
        const zhi = Math.floor(Math.random() * 101);
        console.log(zhi);
        const { img } = await image(e, 'mrdk', 'mrdk', {
          zhi,
        })
        let msg = [segment.at(e.user_id),
          `\n你今天的幸运值是……`,
          img
        ]
        let { config } = getconfig(`config`, `config`)
        if (zhi >= config.mrdkOH){
          let date_time3 = await redis.get(`Yunzai:ohuangriqi_daka`);date_time3 = JSON.parse(date_time3); //获取上一次欧皇诞生时间
          if (date_time3 !== date_time){ //判断上一次欧皇诞生时间是否为今天
            msg = [segment.at(e.user_id),
              `\n你今天的幸运值是……\n`,
              img,
              `恭喜你成为今天首个${config.mrdkOH}幸运值以上的欧皇！`
            ]
            redis.set(`Yunzai:ohuangzhi_daka`, JSON.stringify(zhi)); //写入幸运值
            redis.set(`Yunzai:ohuangname_daka`, JSON.stringify(e.nickname));//写入欧皇名字
            redis.set(`Yunzai:ohuangqq_daka`, JSON.stringify(e.user_id));//写入欧皇的qq号
            redis.set(`Yunzai:ohuangqqun_daka`, JSON.stringify(e.group_id));//写入欧皇诞生的群号
            redis.set(`Yunzai:ohuangriqi_daka`, JSON.stringify(date_time));//写入欧皇诞生的时间
          }
        } else if (zhi <= config.mrdkFQ){
          let date_time3 = await redis.get(`Yunzai:fqiuriqi_daka`);date_time3 = JSON.parse(date_time3);//获取：时间
          if(date_time3 !== date_time){//判断：日期
            msg = [segment.at(e.user_id),
              `\n你今天的幸运值是……\n`,
              img,
              `恭喜你成为今天首个${config.mrdkFQ}幸运值以下的非酋！`
            ]
            redis.set(`Yunzai:fqiuzhi_daka`, JSON.stringify(zhi));//写入：幸运值
            redis.set(`Yunzai:fqiuname_daka`, JSON.stringify(e.nickname));//写入：非酋名字
            redis.set(`Yunzai:fqiuqq_daka`, JSON.stringify(e.user_id));//写入：非酋QQ
            redis.set(`Yunzai:fqiuqqun_daka`, JSON.stringify(e.group_id));//写入：非酋groupid
            redis.set(`Yunzai:fqiuriqi_daka`, JSON.stringify(date_time));//写入：非酋日期
          }
        } else if(zhi <= 10) {
          const fujia = "嗯...看起来你今天的幸运值很低，不过不要丧失对生活的希望哦喵~";
          msg = [segment.at(e.user_id),
            `\n你今天的幸运值是……`,
            img,
            fujia
          ]
        }
        redis.set(`Yunzai:meiridaka3qn:${e.user_id}_daka`, JSON.stringify(date_time));//将当前日期写入redis防止重复抽取
        redis.set(`Yunzai:meiridakazhi:${e.user_id}_daka`, JSON.stringify(zhi));//将打卡获取的幸运值写入redis
        e.reply(msg)
        let zhidata
        if(!fs_.existsSync(`plugins/Gi-plugin/resources/mrdk/${e.user_id}.txt`)){
          zhidata = ``
          await Gimodel.mdfile(`plugins/Gi-plugin/resources/mrdk`, `${e.user_id}.txt`)
        } else {
          zhidata = await fs.readFile(`plugins/Gi-plugin/resources/mrdk/${e.user_id}.txt`, `utf-8`)
        }
        if(!fs_.existsSync(`plugins/Gi-plugin/resources/mrdk/${date_time}.json`)){
          await fs.writeFile(`plugins/Gi-plugin/resources/mrdk/${date_time}.json`, ``, `utf-8`)
        }
        let today_mrdkdata = await fs.readFile(`plugins/Gi-plugin/resources/mrdk/${date_time}.json`, `utf-8`)
        if(today_mrdkdata == ``){
          today_mrdkdata = []
        } else {
          today_mrdkdata = JSON.parse(today_mrdkdata)
        }
        let username;
        if(!e.nickname){
          username = e.member.nickname
        } else if(!e.member || !e.member.nickname){
          username = e.sender.nickname
        }
        today_mrdkdata.push({user_id: e.user_id, user_img: `https://q1.qlogo.cn/g?b=qq&s=100&nk=${e.user_id}`, user_name: username, user_luckvalue: zhi})
        today_mrdkdata = JSON.stringify(today_mrdkdata, null, 3)
        await fs.writeFile(`plugins/Gi-plugin/resources/mrdk/${date_time}.json`, today_mrdkdata, `utf-8`)
        await fs.writeFile(`plugins/Gi-plugin/resources/mrdk/${e.user_id}.txt`, `日期：${date_time}；幸运值${zhi}\n${zhidata}`, `utf-8`)
        return true;//结束运行
    }
    async 今日欧皇(e) {
        //获取当前日期
        const date_time = await Gimodel.date_time()
        let date_time2 = await redis.get(`Yunzai:ohuangriqi_daka`);date_time2 = JSON.parse(date_time2);//获取欧皇最后一次诞生时间
        if (date_time !== date_time2){
          let msg = [
            segment.at(e.user_id),
            `\n今天的欧皇还没诞生喵~`
          ]
          e.reply(msg)
          return;
        }
        let ohuangname = await redis.get(`Yunzai:ohuangname_daka`);ohuangname = JSON.parse(ohuangname);//获取欧皇的名字
        let ohuangqq = await redis.get(`Yunzai:ohuangqq_daka`);ohuangqq = JSON.parse(ohuangqq);//获取欧皇QQ号
        let zhi =  await redis.get(`Yunzai:ohuangzhi_daka`);zhi = JSON.parse(zhi)
        let msg = [`今日的首个欧皇已诞生！！！！\nta的名字：【${ohuangname}】\nta的QQ号：(${ohuangqq})\nta的幸运值是：${zhi} ！！！`]
        e.reply(msg)
        return true;
      }
    async looklookyou(e) {
        const message = e.message[0]
        const at = e.message[1]
        //if(message.text !== `让我看看你的卡` && at.type != `at`) return true;
        //if(e.at == undefined) return true;
        if(message.text !== `让我看看你的卡`) return true;
        if(at == `undefined`) return true;
        logger.mark(at)
        //获取当前日期
        const date_time = await Gimodel.date_time()
        let date_time2 = await redis.get(`Yunzai:meiridaka3qn:${e.at}_daka`);date_time2 = JSON.parse(date_time2);
        const zhi1 = await redis.get(`Yunzai:meiridakazhi:${e.at}_daka`);
        if (date_time !== date_time2) {
          if (e.at === e.user_id){
            e.reply(`你今天还没打卡喵~\n不过我非常不理解你为什么不直接用“每日打卡”来看自己的幸运值，而是还要at一遍自己？？？`)
            return true;
          }
          let msg = [
              segment.at(e.user_id),
              `\nta今天还没打卡喵`
          ]
          e.reply(msg)
          return true;
        }
        if (e.at === e.user_id){
          e.reply(`你为什么不直接用“每日打卡”来看自己的幸运值，而是还要at一遍自己？？？`)
          return true;
        }
        let msg = [`铛铛铛，ta今天的幸运值是${zhi1}`]
        e.reply(msg)
        return true;
    }
  }