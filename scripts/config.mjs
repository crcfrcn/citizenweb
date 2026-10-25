import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// 本产品配置需求的公开入口；只登记名称、类型和规则，不保存配置值。
export const manifest=Object.freeze({
  "schema": 1,
  "product_id": "citizenweb",
  "configuration": {
    "id": "citizenweb",
    "kind": "web",
    "title": "官网配置",
    "items": [
      {
        "name": "CLOUDFLARE_ACCOUNT",
        "description": "Cloudflare账户编号",
        "accessLevel": "public",
        "kind": "deployment",
        "format": "hex16"
      },
      {
        "name": "PAGES_DEPLOY",
        "description": "仅用于公民官网正式 Pages 部署",
        "accessLevel": "protected",
        "kind": "operation",
        "format": "不适用"
      },
      {
        "name": "COLDSIGN_PUBLICKEY",
        "description": "产品发布冷签公钥",
        "accessLevel": "protected",
        "kind": "authorization",
        "format": "hex32"
      }
    ]
  }
});
export function describeConfiguration(){return JSON.parse(JSON.stringify(manifest));}

// 本产品Workflow坐标声明。
export const workflows=Object.freeze({"web":"web.yml"});

// 只返回声明数据；派发与观察归通用调用方，版本及交付归本仓YAML。
export function describeAction({flow,platform,inputs={}}){
 const workflow=workflows[platform];
 // 本产品声明发布入口、签名协议和分阶段配置引用；这里不包含配置值。
 if(flow==='publish'&&platform==='web'){
  const prepare=[{name:'CLOUDFLARE_ACCOUNT'},{name:'PAGES_DEPLOY'}],publish=prepare;
  return {schema:1,productId:'citizenweb',platform,actionId:'citizenweb-publish-web',canonicalId:'citizenweb.web.publish',
   entry:'scripts/publish.mjs',nodeVersion:JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).engines.node,code:15,domain:'474d4224',
   signer:{name:'COLDSIGN_PUBLICKEY'},prepare,publish};
 }
 if(flow==='release'&&workflow)return {repository:"crcfrcn/citizenweb",workflow,ref:'main',inputs};
 if(['test','build','dev'].includes(flow)&&platform==='web')return {command:process.execPath,args:[fileURLToPath(new URL('build.mjs',import.meta.url)),flow,platform],cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,...inputs.environment}};
 throw Error('本产品未声明该流程：'+flow+'·'+platform);
}
