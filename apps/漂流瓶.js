import { promises as fs } from "fs";
import fs_ from "fs";
import fetch from "node-fetch";
import { Gimodel, getconfig } from "../model/index.js";
import schedule from "node-schedule";
import path from "path";
import { fileURLToPath } from "url";

const filePath = `plugins/Gi-plugin/resources/plp.txt`;
const GiPath = `./plugins/Gi-plugin`;
const _path = process.cwd().replace(/\\/g, "/");

export class plp extends plugin {
    constructor() {
        super({
            name: "Gi互动:漂流瓶",
            dsc: "Gi互动:漂流瓶",
            event: "message",
            priority: 1,
            rule: [
                {
                    reg: /^(#|\/)?[扔丢]漂流瓶\s*([\s\S]*)$/,
                    fnc: "扔漂流瓶",
                },
                {
                    reg: /^(#|\/)?[捡撿]漂流瓶(.*)$/,
                    fnc: "捡漂流瓶",
                },
                {
                    reg: /^(#|\/)?评论漂流瓶(.*)$/,
                    fnc: "评论漂流瓶",
                },
                {
                    reg: /^(#|\/)?删除漂流瓶(.*)$/,
                    fnc: `delplp`,
                },
            ],
        });
        this.vis_user_key = "Yunzai:giplugin_vis_user";
        this.vis_group_key = "Yunzai:giplugin_vis_group";
        this.resetAtMidnight();
        this.vis_user = {};
        this.vis_group = {};
        this.userNumber = 0;
        this.groupNumber = 0;

        // 启动每日重置
        this.resetAtMidnight();
    }

    resetAtMidnight() {
        const now = new Date();
        const midnight = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
            0,
            0,
            0
        );
        const msUntilMidnight = midnight - now;

        setTimeout(async () => {
            // 检查键是否存在后再删除
            if (await redis.exists(this.vis_user_key)) {
                await redis.del(this.vis_user_key);
            }
            if (await redis.exists(this.vis_group_key)) {
                await redis.del(this.vis_group_key);
            }
            console.log("每日使用统计已重置");
            this.resetAtMidnight();
        }, msUntilMidnight);
    }
    async 评论漂流瓶(e) {
        let { config } = getconfig(`config`, `config`);
        if (!config.dbcomment) {
            await e.reply(`港口管理员未开放评论区哦~`);
            return true;
        }
        let dbid2 = e.msg.match(/^(#|\/)?评论漂流瓶(.*)$/)[2];
        let dbid1 = dbid2.replace(/\s/g, "");
        if (dbid1.length > 8) {
            await e.reply(`港口管理员：哎？漂流瓶ID后面不能跟任何文本哦`);
            return true;
        }
        let dbid = Number(dbid1);
        let dbdata = await redis.get(`Yunzai:giplugin_plp_${dbid}`);
        if (!dbdata) {
            await e.reply(
                `没有找到你说的这个ID为[${dbid}]漂流瓶哦，请检查漂流瓶ID是否正确~`
            );
            return true;
        }
        await redis.set(`comment:${e.user_id}`, dbid);
        await e.reply(
            `你正在评论漂流瓶ID为【${dbid}】的漂流瓶\n请发送你要评论的内容\n发送[0]取消评论`
        );
        this.setContext(`评论漂流瓶_`);
    }
    async 评论漂流瓶_(e) {
        this.finish(`评论漂流瓶_`);
        if (this.e.msg == `0` || this.e.msg == `[0]`) {
            await e.reply(`你已取消评论漂流瓶`);
            await redis.del(`comment:${e.user_id}`);
            return true;
        }
        let dbid = await redis.get(`comment:${e.user_id}`);
        await redis.del(`comment:${e.user_id}`);
        if (!dbid) {
            await e.reply(`获取漂流瓶ID失败`);
            return true;
        }
        let dbcomment;
        try {
            dbcomment = JSON.parse(
                await redis.get(`Yunzai:giplugin_dbcomment_${dbid}`)
            );
        } catch {
            dbcomment = [];
        }
        if (!dbcomment) {
            dbcomment = [];
        }
        dbcomment.push({
            comment_nickname: e.nickname,
            user_id: e.user_id,
            message: this.e.message,
        });
        await redis.set(
            `Yunzai:giplugin_dbcomment_${dbid}`,
            JSON.stringify(dbcomment, null, 3)
        );
        await e.reply(`港口管理员已将你的评论和漂流瓶一起扔向大海喽~`);
        return true;
    }

    async recall_floating_bottle(e) {
        await e.reply(`该功能正在维护中……`);
        // 漂流瓶结构大改，所以撤回漂流瓶要维护
        return true;
        //获取日期，用于读取漂流瓶日志文件
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const day = currentDate.getDate().toString().padStart(2, "0");
        const date_time = `${year}-${month}-${day}`;
        //获取用户在今天发送的漂流瓶
        let dc = {
            filePath: `plugins/Gi-plugin/resources/plp/${date_time}.txt`,
            type: "rfb",
        };
        let plp = await Gimodel.NewgetFile(dc, e);
        //检查用户扔过漂流瓶没有
        if (plp.length == 0) {
            e.reply(`海里似乎没有你今天扔的漂流瓶呢~`);
            return true;
        } else if (plp.length > 1) {
            //今天扔过超过一个漂流瓶则不再撤回。别问为什么，问就是懒得写 （摆烂
            e.reply(`你今天已经扔了超过一个漂流瓶，不支持撤回哦~`);
            return true;
        }
        //从漂流瓶数据文件中删除漂流瓶
        await Gimodel.delfile(filePath, plp[0]);
        //删除漂流瓶日志中的漂流瓶，将其后面加上“已撤回”
        await Gimodel.delfile(dc.filePath, plp[0]);
        fs.appendFile(dc.filePath, plp + `已撤回\n`, `utf-8`);
        e.reply(`已经撤回了哦~`);
        return true;
    }
    async 扔漂流瓶(e) {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const day = currentDate.getDate().toString().padStart(2, "0");
        const date_time = `${year}-${month}-${day}`;
        let date_time2 = await redis.get(`giplugin_db:${e.user_id}`);
        date_time2 = JSON.parse(date_time2);
        let { config } = getconfig(`config`, `config`);
        if (config.Rplp == 0) {
            await e.reply(`港口管理员未开放漂流瓶功能哦~`);
            return true;
        }

        console.log(date_time2);
        if (
            date_time2 &&
            date_time2.number >= config.Rplp &&
            date_time2.date == date_time &&
            !e.isMaster
        ) {
            await e.reply(
                `你今天已经扔过${date_time2.number}次漂流瓶，每天只能扔${config.Rplp}次哦`
            );
            return true;
        }
        const match = e.msg.match(/^(#|\/)?[扔丢]漂流瓶\s*([\s\S]*)$/);
        const content = match?.[2]?.trim() || "";

        // 如果包含内容直接处理
        if (content) {
            // 保留原始消息中的图片
            const newMsg = {
                ...this.e,
                msg: content,
                message: this.e.message, // 保持原始消息结构
            };
            this.e = newMsg;
            return await this.扔漂流瓶1(e);
        } else {
            if (!date_time2 || date_time2.date != date_time) {
                date_time2 = {
                    date: date_time,
                    number: 0,
                };
                await redis.set(`giplugin_db:${e.user_id}`, JSON.stringify(date_time2));
            }
            console.log(JSON.stringify(date_time2));
        }
        await e.reply(
            `发送你想要扔漂流瓶的内容(仅支持文字和图片)\n发送[0]取消扔漂流瓶`
        );
        this.setContext(`扔漂流瓶1`);
    }
    async 扔漂流瓶1(e) {
        this.finish(`扔漂流瓶1`);
        if (this.e.msg == `0` || this.e.msg == `[0]`) {
            e.reply(`已取消扔漂流瓶`);
            return true;
        } else {
            let userDBnumber = JSON.parse(
                await redis.get(`giplugin_db:${e.user_id}`)
            );
            if (userDBnumber) {
                userDBnumber.number++;
                await redis.set(
                    `giplugin_db:${e.user_id}`,
                    JSON.stringify(userDBnumber)
                );
            } else {
                userDBnumber = {
                    date: await Gimodel.date_time(),
                    number: 1,
                };
                await redis.set(
                    `giplugin_db:${e.user_id}`,
                    JSON.stringify(userDBnumber)
                );
            }
        }
        let times_ = await redis.get(`Yunzai:Giplp_${e.user_id}_times`);
        times_ = JSON.parse(times_);

        let rawMessage = this.e.message
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("")
            .replace(/#扔漂流瓶|\/扔漂流瓶|扔漂流瓶/g, "");

        const hasImage = this.e.img?.length > 0;
        if (rawMessage.trim() === "" && !hasImage) {
            await e.reply(`漂流瓶内容不能为空`);
            return true;
        }

        const convertImgToBase64 = async (imgUrls) => {
            const base64List = [];
            try {
                for (const url of imgUrls) {
                    if (url.startsWith("http")) {
                        const response = await fetch(url);
                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        base64List.push(
                            `data:image/png;base64,${buffer.toString("base64")}`
                        );
                    } else if (fs.existsSync(url)) {
                        const buffer = await fs.readFile(url);
                        base64List.push(
                            `data:image/png;base64,${buffer.toString("base64")}`
                        );
                    }
                }
                return base64List;
            } catch (err) {
                console.error("图片转换失败:", err);
                return [];
            }
        };

        let plp_imgUrl = [];
        if (hasImage) {
            plp_imgUrl = await convertImgToBase64(this.e.img);
            if (plp_imgUrl.length === 0) {
                await e.reply("图片处理失败，请重试");
                return true;
            }
        }
        let type;
        let plp_content;

        if (rawMessage.trim() !== "" && hasImage) {
            type = `text_img`;
            plp_content = rawMessage;
            plp_imgUrl = this.e.img;
        } else if (rawMessage.trim() !== "") {
            type = `text`;
            plp_content = rawMessage;
            plp_imgUrl = ``;
        } else if (hasImage) {
            type = `image`;
            plp_content = ``;
            plp_imgUrl = this.e.img;
        } else {
            e.reply(`扔漂流瓶失败了，漂流瓶内容不能为空`);
            return true;
        }

        let plp_id = await redis.incr("Yunzai:giplugin-plpid");          
        plp_id = JSON.parse(plp_id);
        if (plp_id == undefined) {
            plp_id = `1000001`;
        } else {
            plp_id++;
        }

        const plp = {
            plp_id,
            plp_userid: e.user_id,
            plp_nickname: e.nickname,
            plp_groupid: e.group_id,
            plp_type: type,
            plp_text: plp_content,
            plp_imgUrl: plp_imgUrl,            
            timestamp: Date.now(),
        };
        redis.set(`Yunzai:giplugin_plp_${plp_id}`, JSON.stringify(plp));
        redis.set(`Yunzai:giplugin-plpid`, JSON.stringify(plp_id));
        e.reply(`你的[${plp_id}]号漂流瓶成功扔出去了~`);
        logger.mark(`[Gi互动:扔漂流瓶]用户${e.user_id}扔了一个漂流瓶【${plp}】`);
        return true;
    }
    async 捡漂流瓶(e) {
        let userPDBnumber = JSON.parse(
            await redis.get(`giplugin_pdb:${e.user_id}`)
        );
        let { config } = getconfig(`config`, `config`);
        if (config.Jplp == 0) {
            await e.reply(`港口管理员未开放漂流瓶功能哦~`);
            return true;
        }

        let date_time = await Gimodel.date_time();
        let plpid;
        try {
            plpid = JSON.parse(fs_.readFileSync(GiPath + `/data/dbid.json`, `utf-8`));
        } catch {
            plpid = [];
        }
        if (plpid.length === 0) {
            if (config.plpapi) {
                this.捡漂流瓶API(e);
                return true;
            }
            e.reply(`海里空空的，没有漂流瓶呢~`);
            return true;
        }
        console.log(userPDBnumber);
        if (
            userPDBnumber &&
            userPDBnumber.number >= config.Jplp &&
            userPDBnumber.date == date_time &&
            !e.isMaster
        ) {
            await e.reply(
                `你今天已经捡过${userPDBnumber.number}次漂流瓶，每天只能捡${config.Jplp}次哦`
            );
            return true;
        } else {
            if (!userPDBnumber) {
                userPDBnumber = {
                    date: date_time,
                    number: 1,
                };
            } else {
                userPDBnumber.number++;
            }
            await redis.set(
                `giplugin_pdb:${e.user_id}`,
                JSON.stringify(userPDBnumber)
            );
        }

        let plpcontent = null;
        let currentPlpId = null;
        let kkplp1 = e.msg.match(/^(#|\/)?[捡撿]漂流瓶(.*)$/)[2];
        let kkplp = kkplp1.replace(/\s/g, "");
        try {
            if (kkplp) {
                const plpData = await redis.get(`Yunzai:giplugin_plp_${kkplp}`);
                if (!plpData) {
                    await e.reply(`没有找到ID为[${kkplp}]的漂流瓶`);
                    return true;
                }
                plpcontent = JSON.parse(plpData);
                currentPlpId = kkplp.number;
            } else {
                const allKeys = await redis.keys("Yunzai:giplugin_plp_*");
                if (allKeys.length === 0) {
                    await e.reply("当前没有漂流瓶");
                    return true;
                }
                const randomKey = allKeys[Math.floor(Math.random() * allKeys.length)];
                currentPlpId = randomKey.split("_").pop();
                const plpData = await redis.get(randomKey);
                plpcontent = JSON.parse(plpData);
            }
        } catch (err) {
            await e.reply(`[${plpkk}]号漂流瓶出现错误!`);
        }

        let msgList = [];

        const userId = e.user_id;
        const groupId = e.group_id || "private_chat"; //私聊场景用
        // 记录用户和群组到 Redis
        await redis.hSet(this.vis_user_key, userId, Date.now());
        if (groupId !== "private_chat") {
            await redis.hSet(this.vis_group_key, groupId, Date.now());
        }
        // 获取统计数值
        const userNumber = await redis.hLen(this.vis_user_key);
        const groupNumber =
            groupId === "private_chat"
                ? await redis.hLen(this.vis_group_key)
                : await redis.hLen(this.vis_group_key);
        const plpkk = currentPlpId ? currentPlpId : kkplp;
        let msg;
        msgList.push({
            user_id: Bot.uin,
            message: `当前使用人数(及群/包今日/不含重)\n人数:${userNumber ?? 0
                }  群聊:${groupNumber ?? 0}\n漂流瓶ID：${plpkk}`,
        });
        //    let day = await Gimodel.date_calculation(currentPlpId.date)
        if (plpcontent.plp_type === "text") {
            msgList.push({
                nickname: plpcontent.plp_nickname,
                user_id: plpcontent.plp_userid,
                message: plpcontent.plp_text,
            });
        } else if (plpcontent.plp_type === "image") {
            msgList.push({
                nickname: plpcontent.plp_nickname,
                user_id: plpcontent.plp_userid,
                message: plpcontent.plp_imgUrl.map((base64) => segment.image(base64)),
            });
        } else if (plpcontent.plp_type === "text_img") {
            msgList.push({
                nickname: plpcontent.plp_nickname,
                user_id: plpcontent.plp_userid,
                message: [
                    plpcontent.plp_text,
                    ...plpcontent.plp_imgUrl.map((base64) => segment.image(base64)),
                ],
            });
        }
        let comment;
        try {
            comment = JSON.parse(
                await redis.get(`Yunzai:giplugin_dbcomment_${plpkk}`)
            );
        } catch {
            comment = [];
        }
        // if(config.dbcomment && day && day < 3 ){
        if (config.dbcomment) {
            msgList.push({
                user_id: Bot.uin,
                message: `漂流瓶的评论方法：#评论漂流瓶${plpkk}`,
            });
        } else {
            msgList.push({
                user_id: Bot.uin,
                message: "漂流瓶已过期销毁",
            });
        }
        if (comment && comment.length > 0) {
            msgList.push({
                user_id: Bot.uin,
                message: `以下是这个漂流瓶的评论区\n---------------------`,
            });
            for (let item of comment) {
                msgList.push({
                    nickname: item.comment_nickname,
                    user_id: Number(item.user_id),
                    message: item.message,
                });
            }
        }
        try {
            msg = await e.group.makeForwardMsg(msgList);
        } catch {
            msg = await e.friend.makeForwardMsg(msgList);
        }
        let detail = msg.data?.meta?.detail;
        try {
            detail.news = [{ text: `点击查看漂流瓶` }];
        } catch { }
        await e.reply(msg);
        // if(!day || day > 3 || !config.dbcomment)
        // if(!config.dbcomment) {
        //  await Gimodel.deljson(plp_id1, GiPath + `/data/dbid.json`)
        // await redis.del(`Yunzai:giplugin_plp_${plp_id1.number}`)
        //  }
        return true;
    }
    async 捡漂流瓶API(e) {
        let userPDBnumber = JSON.parse(
            await redis.get(`giplugin_pdb:${e.user_id}`)
        );
        let { config } = getconfig(`config`, `config`);
        let date_time = Gimodel.date_time();
        if (
            userPDBnumber &&
            userPDBnumber.number >= config.Jplp &&
            userPDBnumber.date == date_time
        ) {
            await e.reply(
                `你今天已经捡过${userPDBnumber.number}次漂流瓶，每天只能捡${config.Jplp}次哦`
            );
            return true;
        } else {
            if (!userPDBnumber) {
                userPDBnumber = {
                    date: date_time,
                    number: 1,
                };
            } else {
                userPDBnumber.number++;
            }
            await redis.set(
                `giplugin_pdb:${e.user_id}`,
                JSON.stringify(userPDBnumber)
            );
        }
        try {
            var plp = await fetch(
                `https://free.wqwlkj.cn/wqwlapi/drift.php?select=&type=json`
            );
            plp = await plp.json();
        } catch {
            e.reply(`海里空空的，似乎没有漂流瓶呢`);
            return;
        }
        if (plp.code != 1) {
            e.reply(`海里空空的，似乎没有漂流瓶呢`);
            return;
        }
        let msg = `正在查看漂流瓶
这个漂流瓶里有封信哎
【漂流瓶】
标题：${plp.title}
正文：${plp.content}`;
        await e.reply(msg);
    }
    async delplp(e) {
        let { config } = getconfig(`config`, `config`);
        if (!config.dbcomment) {
            await e.reply(`港口管理员未开放此功能哦~`);
            return true;
        }
        if (!e.isMaster) {
            await e.reply(`权限不足!`);
            return true;
        }
        let dbid2 = e.msg.match(/^(#|\/)?删除漂流瓶(.*)$/)[2];
        let dbid1 = dbid2.replace(/\s/g, "");
        if (!dbid1) {
            await e.reply(`你还没有输入漂流瓶ID唉?`);
            return true;
        }
        if (dbid1.length > 8) {
            await e.reply(`哎？漂流瓶的ID最高也就七位叭?`);
            return true;
        }
        try {
            // 删除redis数据
            let dbid = Number(dbid1);
            let dbdata = await redis.get(`Yunzai:giplugin_plp_${dbid}`);
            if (!dbdata) {
                await e.reply(
                    `没有找到你说的这个ID为[${dbid}]漂流瓶哦，请检查漂流瓶ID是否正确~`
                );
                return true;
            }
            await redis.del(`Yunzai:giplugin_plp_${dbid}`);

            await e.reply(`成功删除[${dbid}]号漂流瓶`);
        } catch (err) {
            await e.reply(`删除漂流瓶失败，请开发者前往日志查看`);
            console.error(`删除漂流瓶error:${err}`);
        }
    }
}
