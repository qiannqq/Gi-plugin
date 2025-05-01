import puppeteer from "../../../lib/puppeteer/puppeteer.js"
import cfg from '../../../lib/config/config.js'
/**
 * 浏览器截图
 * @param {*} e 已废弃
 * @param {*} file html模板在resources的名称 不需要带后缀名
 * @param {*} name Yunzai内部名称
 * @param {object} obj 渲染变量，类型为对象
 * @param {string} htmlFilePath 自定义html模板位置，可选
 * @returns 
 */
async function image(e, file, name, obj, htmlFilePath) {
  let botname = cfg.package.name
  if (cfg.package.name == `yunzai`) {
   botname = `Yunzai-Bot`
  } else if (cfg.package.name == `miao-yunzai`){
   botname = `Miao-Yunzai`
  } else if (cfg.package.name == `trss-yunzai`){
   botname = `TRSS-Yunzai`
  } else if (cfg.package.name == `a-yunzai`){
   botname = `A-Yunzai`
  } else if (cfg.package.name == `biscuit-yunzai`){
   botname = `Biscuit-Yunzai`
  }
  let tplFile
  if(htmlFilePath) {
    tplFile = htmlFilePath
  } else {
    tplFile = `./plugins/Gi-plugin/resources/html/${file}.html`
  }
  let data = {
    quality: 100,
    tplFile,
    ...obj
  }
  let img = await puppeteer.screenshot(name, {
    botname,
    MiaoV: cfg.package.version,
    ...data
  })

  return {
    img
  };
}

export default image;