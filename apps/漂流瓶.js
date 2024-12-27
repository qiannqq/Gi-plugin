import plugin from '../../../lib/plugins/plugin.js';
import Gimodel from '../model/getFile.js';
import getconfig from '../model/cfg.js';
import { promises as fs } from 'fs';
import fs_ from 'fs'
import fetch from 'node-fetch';

const filePath = `plugins/Gi-plugin/resources/plp.txt`
const GiPath = `./plugins/Gi-plugin`
const _path = process.cwd().replace(/\\/g, '/')

export class plp extends plugin {
    constructor(){
        super({
            name: 'Gi互动:漂流瓶',
            dsc: 'Gi互动:漂流瓶',
            event: 'message',
            priority: 500,
            rule:[
                {
                    reg: '^(#|/)?扔漂流瓶$',
                    fnc: '扔漂流瓶'
                },{
                    reg: '^(#|/)?捡漂流瓶$',
                    fnc: '捡漂流瓶'
                },{
                    reg: /^(#|\/)?评论漂流瓶(.*)$/,
                    fnc: '评论漂流瓶'
                }
            ]
        })
    }
    async 评论漂流瓶(e) {
        let { config } = getconfig(`config`, `config`)
        if(!config.dbcomment){
            await e.reply(`港口管理员未开放评论区哦~`)
            return true
        }
        let dbid = Number(e.msg.match(/^(#|\/)?评论漂流瓶(.*)$/)[2])
        if(dbid == NaN) {
            await e.reply(`港口管理员：“哎？漂流瓶ID应该是数字吧”`)
            return true
        }
        let dbdata = await redis.get(`Yunzai:giplugin_plp_${dbid}`)
        if(!dbdata) {
            await e.reply(`没有找到你说的这个漂流瓶哦，请检查漂流瓶ID是否正确~`)
            return true
        }
        await redis.set(`comment:${e.user_id}`, dbid)
        await e.reply(`你正在评论漂流瓶ID为【${dbid}】的漂流瓶\n请发送你要评论的内容\n发送[0]取消评论`)
        this.setContext(`评论漂流瓶_`)
    }
    async 评论漂流瓶_(e) {
        this.finish(`评论漂流瓶_`)
        if(this.e.msg == `0` || this.e.msg == `[0]`) {
            await e.reply(`你已取消评论漂流瓶`)
            await redis.del(`comment:${e.user_id}`)
            return true
        }
        let dbid = await redis.get(`comment:${e.user_id}`)
        await redis.del(`comment:${e.user_id}`)
        if(!dbid) {
            await e.reply(`获取漂流瓶ID失败`)
            return true
        }
        let dbcomment;
        try {
            dbcomment = JSON.parse(await redis.get(`Yunzai:giplugin_dbcomment_${dbid}`))
        } catch {
            dbcomment = []
        }
        if(!dbcomment) {
            dbcomment = []
        }
        dbcomment.push({
            comment_nickname: e.nickname,
            user_id: e.user_id,
            message: this.e.message
        })
        await redis.set(`Yunzai:giplugin_dbcomment_${dbid}`, JSON.stringify(dbcomment, null, 3))
        await e.reply(`港口管理员已将你的评论和漂流瓶一起扔向大海喽~`)
        return true

    }
    async recall_floating_bottle(e){
        await e.reply(`该功能正在维护中……`) 
        // 漂流瓶结构大改，所以撤回漂流瓶要维护
        return true
        //获取日期，用于读取漂流瓶日志文件
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        const date_time = `${year}-${month}-${day}`;
        //获取用户在今天发送的漂流瓶
        let dc = {
            filePath: `plugins/Gi-plugin/resources/plp/${date_time}.txt`,
            type: 'rfb'
        }
        let plp = await Gimodel.NewgetFile(dc, e)
        //检查用户扔过漂流瓶没有
        if(plp.length == 0){
            e.reply(`海里似乎没有你今天扔的漂流瓶呢~`)
            return true;
        } else if(plp.length > 1){
            //今天扔过超过一个漂流瓶则不再撤回。别问为什么，问就是懒得写 （摆烂
            e.reply(`你今天已经扔了超过一个漂流瓶，不支持撤回哦~`)
            return true;
        }
        //从漂流瓶数据文件中删除漂流瓶
        await Gimodel.delfile(filePath, plp[0])
        //删除漂流瓶日志中的漂流瓶，将其后面加上“已撤回”
        await Gimodel.delfile(dc.filePath, plp[0])
        fs.appendFile(dc.filePath, plp + `已撤回\n`, `utf-8`)
        e.reply(`已经撤回了哦~`)
        return true;
    }
    async 扔漂流瓶(e){
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        const date_time = `${year}-${month}-${day}`;
        let date_time2 = await redis.get(`giplugin_db:${e.user_id}`);
        date_time2 = JSON.parse(date_time2);
        let { config } = getconfig(`config`, `config`)
        if(config.Rplp == 0) {
            await e.reply(`港口管理员未开放漂流瓶功能哦~`)
            return true
        }
        console.log(date_time2)
        if(date_time2 && date_time2.number >= config.Rplp && date_time2.date == date_time && !e.isMaster) {
            await e.reply(`你今天已经扔过${date_time2.number}次漂流瓶，每天只能扔${config.Rplp}次哦`)
            return true
        } else {
            if(!date_time2 || date_time2.date != date_time) {
                date_time2 = {
                    date: date_time,
                    number: 0
                }
                await redis.set(`giplugin_db:${e.user_id}`, JSON.stringify(date_time2))
            }
            console.log(JSON.stringify(date_time2))
        }
        await e.reply(`发送你想要扔漂流瓶的内容(仅支持文字和图片)\n发送[0]取消扔漂流瓶`)
        this.setContext(`扔漂流瓶1`)
    }
    async 扔漂流瓶1(e){
        this.finish(`扔漂流瓶1`)
        if(this.e.msg == `0`|| this.e.msg == `[0]`){
            e.reply(`已取消扔漂流瓶`)
            return true;
        } else {
            let userDBnumber = JSON.parse(await redis.get(`giplugin_db:${e.user_id}`))
            if(userDBnumber) {
                userDBnumber.number++
                await redis.set(`giplugin_db:${e.user_id}`, JSON.stringify(userDBnumber))
            } else {
                userDBnumber = {
                    date: await Gimodel.date_time(),
                    number: 1
                }
                await redis.set(`giplugin_db:${e.user_id}`, JSON.stringify(userDBnumber))
            }
        }
        let times_ = await redis.get(`Yunzai:Giplp_${e.user_id}_times`)
        times_ = JSON.parse(times_)
        let type;
        let plp_content;
        let plp_imgUrl;
        if(this.e.msg && this.e.img){
            type = `text_img`
            plp_content = this.e.msg
            plp_imgUrl = this.e.img
        } else if(this.e.msg) {
            type = `text`
            plp_content = this.e.msg
            plp_imgUrl = ``
        } else if(this.e.img) {
            type = `image`
            plp_content = ``
            plp_imgUrl = this.e.img
        } else {
            e.reply(`扔漂流瓶失败了，无法在漂流瓶内塞进卡片内容。`)
            return true;
        }

        let plp_id = await redis.get(`Yunzai:giplugin-plpid`)
        plp_id = JSON.parse(plp_id)
        if (plp_id == undefined) {
            plp_id = `1000001`
        } else {
            plp_id++;
        }

        let plp;
        plp = {
            plp_id,
            plp_userid: e.user_id,
            plp_nickname: e.nickname,
            plp_groupid: e.group_id,
            plp_type: type,
            plp_text: plp_content,
            plp_imgUrl,
        }
        redis.set(`Yunzai:giplugin_plp_${plp_id}`, JSON.stringify(plp))
        redis.set(`Yunzai:giplugin-plpid`, JSON.stringify(plp_id))
        let data;
        try {
            data = JSON.parse(await fs.readFile(GiPath + `/data/dbid.json`, `utf-8`))
        } catch {
            data = []
        }
        let date = await Gimodel.date_time()
        data.push({ number: plp_id, qq: e.user_id, date, })
        if(!fs_.existsSync(GiPath + `/data`)) {
            fs_.mkdirSync(GiPath + `/data`)
        }
        await fs.writeFile(GiPath + `/data/dbid.json`, JSON.stringify(data, null, 3), `utf-8`)
        e.reply(`你的漂流瓶成功扔出去了~`)
        logger.mark(`[Gi互动:扔漂流瓶]用户${e.user_id}扔了一个漂流瓶【${plp}】`)
        return true;
    }
    async 捡漂流瓶(e){
        let userPDBnumber = JSON.parse(await redis.get(`giplugin_pdb:${e.user_id}`))
        let { config } = getconfig(`config`, `config`)
        if(config.Jplp == 0) {
            await e.reply(`港口管理员未开放漂流瓶功能哦~`)
            return true
        }
        let date_time = await Gimodel.date_time()
        let plpid;
        try {
            plpid = JSON.parse(fs_.readFileSync(GiPath + `/data/dbid.json`, `utf-8`))
        } catch {
            plpid = []
        }
        if(plpid.length === 0){
            if(config.plpapi) {
                this.捡漂流瓶API(e)
                return true
            }
            e.reply(`海里空空的，没有漂流瓶呢~`)
            return true;
        }
        console.log(userPDBnumber)
        if(userPDBnumber && userPDBnumber.number >= config.Jplp && userPDBnumber.date == date_time && !e.isMaster) {
            await e.reply(`你今天已经捡过${userPDBnumber.number}次漂流瓶，每天只能捡${config.Jplp}次哦`)
            return true
        } else {
            if(!userPDBnumber) {
                userPDBnumber = {
                    date: date_time,
                    number: 1
                }
            } else {
                userPDBnumber.number++
            }
            await redis.set(`giplugin_pdb:${e.user_id}`, JSON.stringify(userPDBnumber))
        }
        let plp_id1 = plpid[Math.floor(Math.random() * plpid.length)]
        let plpcontent = JSON.parse(await redis.get(`Yunzai:giplugin_plp_${plp_id1.number}`))
        let msgList = []
        let msg
        msgList.push({
            user_id: Bot.uin,
            message: `漂流瓶ID：${plp_id1.number}`
        })
        let day = await Gimodel.date_calculation(plp_id1.date)
        if(plpcontent.plp_type == `text`){
            msgList.push({
                nickname: plpcontent.plp_nickname,
                user_id: plp_id1.qq,
                message: plpcontent.plp_text
            })
        } else if(plpcontent.plp_type == `image`){
            msgList.push({
                nickname: plpcontent.plp_nickname,
                user_id: plp_id1.qq,
                message: segment.image(plpcontent.plp_imgUrl[0])
            })
        } else if(plpcontent.plp_type == `text_img`){
            msgList.push({
                nickname: plpcontent.plp_nickname,
                user_id: plp_id1.qq,
                message: [plpcontent.plp_text, segment.image(plpcontent.plp_imgUrl[0])]
            })
        }
        let comment;
        try {
            comment = JSON.parse(await redis.get(`Yunzai:giplugin_dbcomment_${plp_id1.number}`))
        } catch {
            comment = []
        }
        if(config.dbcomment && day && day < 3){
            msgList.push({
                user_id: Bot.uin,
                message: `漂流瓶的评论方法：#评论漂流瓶${plp_id1.number}`
            })
        } else {
            msgList.push({
                user_id: Bot.uin,
                message: '漂流瓶已过期销毁'
            })
        }
        if(comment && comment.length > 0) {
            msgList.push({
                user_id: Bot.uin,
                message: `以下是这个漂流瓶的评论区`
            })
            for (let item of comment) {
                msgList.push({
                    nickname: item.comment_nickname,
                    user_id: Number(item.user_id),
                    message: item.message
                })
            }
        }
        try {
            msg = await e.group.makeForwardMsg(msgList)
        } catch {
            msg = await e.friend.makeForwardMsg(msgList)
        }
        let detail = msg.data?.meta?.detail
        detail.news = [{ text: `点击查看漂流瓶` }]
        await e.reply(msg)
        if(!day || day > 3 || !config.dbcomment) {
            await Gimodel.deljson(plp_id1, GiPath + `/data/dbid.json`)
            await redis.del(`Yunzai:giplugin_plp_${plp_id1.number}`)
        }
        return true;
    }
    async 捡漂流瓶API(e){
        let userPDBnumber = JSON.parse(await redis.get(`giplugin_pdb:${e.user_id}`))
        let { config } = getconfig(`config`, `config`)
        let date_time = Gimodel.date_time()
        if(userPDBnumber && userPDBnumber.number >= config.Jplp && userPDBnumber.date == date_time) {
            await e.reply(`你今天已经捡过${userPDBnumber.number}次漂流瓶，每天只能捡${config.Jplp}次哦`)
            return true
        } else {
            if(!userPDBnumber) {
                userPDBnumber = {
                    date: date_time,
                    number: 1
                }
            } else {
                userPDBnumber.number++
            }
            await redis.set(`giplugin_pdb:${e.user_id}`, JSON.stringify(userPDBnumber))
        }
        try {
            var plp = await fetch(`https://free.wqwlkj.cn/wqwlapi/drift.php?select=&type=json`)
            plp = await plp.json()
        } catch {
            e.reply(`海里空空的，似乎没有漂流瓶呢`)
            return
        }
        if(plp.code != 1) {
            e.reply(`海里空空的，似乎没有漂流瓶呢`)
            return
        }
        let msg =
`正在查看漂流瓶
这个漂流瓶里有封信哎
【漂流瓶】
标题：${plp.title}
正文：${plp.content}`
        await e.reply(msg)
    }
}