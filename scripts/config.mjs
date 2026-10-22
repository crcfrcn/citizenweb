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

// 只有产品、工具和入口声明；所有执行函数归build.mjs。
export const repository="crcfrcn/citizenweb";
export const tools=Object.freeze({"node": "25.2.1"});
export const platforms=Object.freeze({"web": "Web"});
export const initialVersion="1.0.12";
export const artifactPrefix='公民官网·Web·v';
export const artifactFilePrefix='citizenweb-web-v';
export const artifactSuffixes=Object.freeze(['tgz','json','sha256']);
export {describeAction} from './build.mjs';
