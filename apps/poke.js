import plugin from '../../../lib/plugins/plugin.js';
import cfg_ from'../../../lib/config/config.js';
import getconfig from '../model/cfg.js';

export class poke extends plugin {
    constructor () {
      super({
        name: '[Gi互动]戳一戳',
        dsc: '[Gi互动]戳一戳',
        event: 'notice.group.poke',
        priority: 500
      })
    }
    async accept(e){
        if(e.target_id != cfg_.qq) return true
        const { config } = getconfig('config', 'poke')
        if(!config.poke) return true
        logger.mark(config.poketxt)
        const randomIndex = Math.floor(Math.random() * config.poketxt.length);
        const poketxt1 = config.poketxt[randomIndex];
        e.reply(poketxt1)
        return true;
    }
}