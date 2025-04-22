import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import getconfig from './model/cfg.js';
import fs from 'fs';
import yaml from 'yaml';
import lodash from 'lodash'
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export function supportGuoba() {
  return {
    pluginInfo: {
      name: `Gi-plugin`,
      title: '互动插件(Gi-plugin)',
      author: '@千奈千祁',
      authorLink: 'https://gitee.com/QianNQQ',
      link: 'https://gitee.com/QianNQQ/Gi-plugin',
      isV3: true,
      isV2: false,
      description: `漂流瓶、每日打卡等群友之间互动的娱乐功能`,
      icon: 'mdi:stove',
      iconColor: '#d19f56',
      iconPath: path.join(__dirname, 'resources/logo.png')
    },
    configInfo: {
      schemas: [
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '自动更新设置'
        },
        {
          field: 'autoupdate',
          label: '自动更新',
          helpMessage: '启用时默认每天1:20自动更新',
          bottomHelpMessage: '是否自动更新',
          component: 'Switch',
        },
        {
          field: 'updatetime',
          label: '自动更新时间',
          bottomHelpMessage: '填入或选择cron表达式，该项保存后重启生效',
          component: 'EasyCron',
          required: true,
          componentProps: {
            placeholder: '请输入cron表达式',
          }
        },
        {
          component: 'SOFT_GROUP_BEGIN',
          label: '娱乐功能设置'
        },
        {
          component: 'Divider',
          label: '每日打卡设置'
        },
        {
          field: 'mrdkOH',
          label: '每日打卡欧皇阈值',
          bottomHelpMessage: '某人幸运值高于或等于该值将成为当天的“今日欧皇”',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 100,
            placeholder: '请输入阈值',
          }
        },
        {
          field: 'mrdkFQ',
          label: '每日打卡非酋阈值',
          bottomHelpMessage: '某人幸运值低于或等于该值将成为当天的“今日非酋”',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 100,
            placeholder: '请输入阈值',
          }
        },
        {
          component: 'Divider',
          label: '漂流瓶设置'
        },
        {
          field: 'Jplp',
          label: '每日可捡漂流瓶次数',
          bottomHelpMessage: '每天可捡漂流瓶次数，主人不受限制',
          component: 'InputNumber',
          required: true,
          componentProps: {
            placeholder: '请输入数字',
          }
        },
        {
          field: 'Rplp',
          label: '每日可扔漂流瓶次数',
          bottomHelpMessage: '每天可扔漂流瓶次数，主人不受限制',
          component: 'InputNumber',
          required: true,
          componentProps: {
            placeholder: '请输入数字',
          }
        },
        {
          field: 'dbcomment',
          label: '漂流瓶评论区',
          bottomHelpMessage: '是否开启漂流瓶评论区，开启后漂流瓶的销毁将从捡到及销毁改为三天后销毁',
          component: 'Switch'
        },
        {
          field: 'plpapi',
          label: 'API获取漂流瓶',
          helpMessage: '警告：来自API的漂流瓶的信息不受审核，可能会获取到违规内容，请谨慎开启',
          bottomHelpMessage: '是否从API获取漂流瓶？仅在本地无漂流瓶的情况下生效',
          component: 'Switch'
        },
        {
          component: 'Divider',
          label: '钓鱼设置'
        },
        {
          field: 'fishcd',
          label: '钓竿冷却时间',
          bottomHelpMessage: '单位秒',
          component: 'InputNumber',
          required: true,
          componentProps: {
            placeholder: '单位秒',
          }
        }
      ],
      async getConfigData() {
        let { config } = getconfig(`config`, `config`)
        return config;
      },
      async setConfigData(data, { Result }) {
        // 1.读取现有配置文件
        const configFilePath = path.join(__dirname, 'config', 'config.yaml');
        let config = {};
        if (fs.existsSync(configFilePath)) {
          const configContent = fs.readFileSync(configFilePath, 'utf8');
          config = yaml.parse(configContent) || {};
        }
        // 2. 更新配置对象
        for (const [keyPath, value] of Object.entries(data)) {
          lodash.set(config, keyPath, value);
        }
        // 3. 将更新后的配置对象写回文件
        const updatedConfigYAML = yaml.stringify(config);
        fs.writeFileSync(configFilePath, updatedConfigYAML, 'utf8');
        logger.mark(`[Gi互动:配置文件]配置文件更新`)
        return Result.ok({}, '保存成功~');
      }
    }
  }
}