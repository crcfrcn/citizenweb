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
      {"environment":"production","name":"CF_ACCOUNT_ID","title":"Cloudflare Account ID","description":"公民官网 Pages 所属账户","revealable":true,"accessLevel":"public","kind":"deployment","format":"hex16"},
      {"environment":"cloudflare","name":"PAGES_DEPLOY","title":"Pages 部署令牌","description":"仅用于公民官网正式 Pages 部署","revealable":false,"accessLevel":"protected","kind":"operation"},
      {"environment":"citizenweb-approval","name":"COLD_SIGNER_PUBLIC_KEY","title":"发布冷签公钥","description":"仅用于公民官网正式发布批准验签","revealable":true,"accessLevel":"protected","kind":"authorization","format":"hex32"}
    ]
  }
});
export function describeConfiguration(){return JSON.parse(JSON.stringify(manifest));}

// 本产品Workflow坐标声明。
export const workflows=Object.freeze({"web":"web.yml"});

// 只返回声明数据；派发与观察归通用调用方，版本及交付归本仓YAML。
export function describeAction({flow,platform,inputs={}}){
 const workflow=workflows[platform];
 if(flow==='release'&&workflow)return {repository:"crcfrcn/citizenweb",workflow,ref:'main',inputs};
 if(['test','build','dev'].includes(flow)&&platform==='web')return {command:process.execPath,args:[fileURLToPath(new URL('build.mjs',import.meta.url)),flow,platform],cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,...inputs.environment}};
 throw Error('本产品未声明该流程：'+flow+'·'+platform);
}
