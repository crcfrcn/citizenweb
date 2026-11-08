#![cfg(any(test, target_arch = "wasm32"))]

use serde::Deserialize;
use serde_json::value::RawValue;
use std::borrow::Cow;

const DAY: u64 = 86_400_000;
const LEASE: u64 = 30_000;
// 对齐公民链锁定 SDK 的默认 RPC 响应上限。
const LIMIT: usize = 15 * 1024 * 1024;

fn cache_age(uploaded: u64, now: u64) -> Option<u64> {
    let remaining = uploaded.saturating_add(DAY).checked_sub(now)?;
    (remaining > 0).then_some(remaining.min(DAY) / 1000)
}

fn hash(value: &str) -> bool {
    value.len() == 66
        && value.starts_with("0x")
        && value.as_bytes()[2..]
            .iter()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

#[derive(Deserialize)]
struct Reply<'a> {
    jsonrpc: &'a str,
    id: u8,
    #[serde(borrow)]
    result: &'a RawValue,
    error: Option<&'a RawValue>,
}

#[derive(Deserialize)]
struct Document<'a> {
    #[serde(borrow)]
    html: Cow<'a, str>,
    blake2_256: &'a str,
    source: &'a str,
}

fn document<'a>(bytes: &'a [u8], genesis: &str) -> Option<&'a str> {
    if bytes.len() > LIMIT {
        return None;
    }
    let [mut chain, mut law]: [Reply<'a>; 2] = serde_json::from_slice(bytes).ok()?;
    if chain.id == 2 {
        std::mem::swap(&mut chain, &mut law);
    }
    if chain.id != 1
        || law.id != 2
        || chain.jsonrpc != "2.0"
        || law.jsonrpc != "2.0"
        || chain.error.is_some()
        || law.error.is_some()
        || serde_json::from_str::<&str>(chain.result.get()).ok()? != genesis
    {
        return None;
    }
    let result = law.result.get();
    let law: Document<'_> = serde_json::from_str(result).ok()?;
    (law.source == "legislation-raw" && hash(law.blake2_256) && !law.html.trim().is_empty())
        .then_some(result)
}

#[cfg(target_arch = "wasm32")]
mod pages {
    use super::*;
    use js_sys::{futures::JsFuture, Function, Object, Promise, Reflect, Uint8Array};
    use wasm_bindgen::{prelude::*, JsCast};
    use web_sys::{
        AbortSignal, Headers, ReadableStream, ReadableStreamDefaultReader, Request, RequestInit,
        RequestRedirect, Response, ResponseInit, WorkerGlobalScope,
    };

    const PAGE: &str = "https://www.crcfrcn.com/constitution/data";
    const KEY: &str = "constitution";
    const LOCK_SIZE: usize = 16;
    const NODE: &str = "https://chain.crcfrcn.com/";
    const QUERY: &str = r#"[{"jsonrpc":"2.0","id":1,"method":"chain_getBlockHash","params":[0]},{"jsonrpc":"2.0","id":2,"method":"constitution_getDocument","params":[]}]"#;
    type Result<T> = std::result::Result<T, JsValue>;

    fn unavailable() -> JsValue {
        JsValue::UNDEFINED
    }

    fn get(target: &JsValue, key: &str) -> Result<JsValue> {
        Reflect::get(target, &key.into())
    }

    fn set(target: &Object, key: &str, value: &JsValue) -> Result<()> {
        Reflect::set(target, &key.into(), value)?
            .then_some(())
            .ok_or_else(unavailable)
    }

    fn string(target: &JsValue, key: &str) -> Result<String> {
        get(target, key)?
            .as_string()
            .filter(|v| !v.is_empty())
            .ok_or_else(unavailable)
    }

    async fn call(target: &JsValue, method: &str, args: &[JsValue]) -> Result<JsValue> {
        let result = get(target, method)?
            .dyn_into::<Function>()?
            .apply(target, &js_sys::Array::from_iter(args))?;
        JsFuture::from(result.dyn_into::<Promise>()?).await
    }

    fn now() -> u64 {
        js_sys::Date::now() as u64
    }

    fn response_init(status: u16, age: Option<u64>, retry: Option<u64>) -> Result<ResponseInit> {
        let init = ResponseInit::new();
        init.set_status(status);
        let headers = Headers::new()?;
        if let Some(age) = age {
            headers.set("cache-control", &format!("private, max-age={age}"))?;
            headers.set("content-type", "application/json; charset=utf-8")?;
            headers.set("x-content-type-options", "nosniff")?;
        } else {
            headers.set("cache-control", "no-store")?;
        }
        if let Some(retry) = retry {
            headers.set("retry-after", &retry.to_string())?;
        }
        init.set_headers_headers(&headers);
        Ok(init)
    }

    fn empty(status: u16, retry: Option<u64>) -> Result<Response> {
        Response::new_with_opt_str_and_init(None, &response_init(status, None, retry)?)
    }

    async fn write(bucket: &JsValue, bytes: &[u8], etag: Option<&str>) -> Result<Option<String>> {
        let only_if = Object::new();
        match etag {
            Some(etag) => set(&only_if, "etagMatches", &etag.into())?,
            None => set(&only_if, "etagDoesNotMatch", &"*".into())?,
        }
        let options = Object::new();
        set(&options, "onlyIf", only_if.as_ref())?;
        let value = call(
            bucket,
            "put",
            &[KEY.into(), Uint8Array::from(bytes).into(), options.into()],
        )
        .await?;
        if value.is_null() {
            Ok(None)
        } else {
            Ok(Some(string(&value, "etag")?))
        }
    }

    struct Cache {
        entry: JsValue,
        size: usize,
        uploaded: u64,
    }

    impl Cache {
        fn response(&self, now: u64) -> Result<Option<Response>> {
            if self.size <= LOCK_SIZE {
                return Ok(None);
            }
            let Some(age) = cache_age(self.uploaded, now) else {
                return Ok(None);
            };
            let body = get(&self.entry, "body")?.dyn_into::<ReadableStream>()?;
            Ok(Some(Response::new_with_opt_readable_stream_and_init(
                Some(&body),
                &response_init(200, Some(age), None)?,
            )?))
        }

        fn refreshing(&self, now: u64) -> bool {
            self.size == LOCK_SIZE && now < self.uploaded.saturating_add(LEASE)
        }
    }

    async fn read(bucket: &JsValue) -> Result<Option<Cache>> {
        let entry = call(bucket, "get", &[KEY.into()]).await?;
        if entry.is_null() {
            return Ok(None);
        }
        let size = get(&entry, "size")?.as_f64().ok_or_else(unavailable)? as usize;
        if !matches!(size, 0 | LOCK_SIZE) && !(LOCK_SIZE + 1..=LIMIT + 64).contains(&size) {
            return Err(unavailable());
        }
        let uploaded = get(&entry, "uploaded")?
            .dyn_into::<js_sys::Date>()?
            .get_time();
        if !uploaded.is_finite() || uploaded < 0.0 {
            return Err(unavailable());
        }
        Ok(Some(Cache {
            entry,
            size,
            uploaded: uploaded as u64,
        }))
    }

    async fn chain(global: &WorkerGlobalScope, env: &JsValue) -> Result<Vec<u8>> {
        let headers = Headers::new()?;
        headers.set("content-type", "application/json")?;
        headers.set("CF-Access-Client-Id", &string(env, "CFACCESS_CLIENTID")?)?;
        headers.set("CF-Access-Client-Secret", &string(env, "CHAIN_SECRET")?)?;
        let init = RequestInit::new();
        init.set_method("POST");
        init.set_headers_headers(&headers);
        init.set_body(&QUERY.into());
        init.set_redirect(RequestRedirect::Error);
        init.set_signal(Some(&AbortSignal::timeout_with_u32(10_000)));
        let request = Request::new_with_str_and_init(NODE, &init)?;
        let response = JsFuture::from(global.fetch_with_request(&request))
            .await?
            .dyn_into::<Response>()?;
        if response.status() != 200 {
            return Err(unavailable());
        }
        let reader = response
            .body()
            .ok_or_else(unavailable)?
            .get_reader()
            .unchecked_into::<ReadableStreamDefaultReader>();
        let mut bytes = Vec::new();
        loop {
            let chunk = JsFuture::from(reader.read()).await?;
            if get(&chunk, "done")?.as_bool() == Some(true) {
                return Ok(bytes);
            }
            let value = get(&chunk, "value")?.dyn_into::<Uint8Array>()?;
            if value.length() as usize > LIMIT - bytes.len() {
                let _ = reader.cancel();
                return Err(unavailable());
            }
            let start = bytes.len();
            bytes.resize(start + value.length() as usize, 0);
            value.copy_to(&mut bytes[start..]);
        }
    }

    async fn constitution(env: &JsValue) -> Result<Response> {
        let bucket = get(env, "CACHE")?;
        let previous = read(&bucket).await?;
        let current = now();
        let etag = if let Some(previous) = &previous {
            if let Some(response) = previous.response(current)? {
                return Ok(response);
            }
            if previous.refreshing(current) {
                return empty(503, Some(2));
            }
            Some(string(&previous.entry, "etag")?)
        } else {
            None
        };
        let genesis = string(env, "CHAIN_GENESISHASH")?;
        if !hash(&genesis) {
            return Err(unavailable());
        }
        let global = js_sys::global().unchecked_into::<WorkerGlobalScope>();
        let mut marker = [0; LOCK_SIZE];
        global
            .crypto()?
            .get_random_values_with_u8_array(&mut marker)?;
        let Some(lease) = write(&bucket, &marker, etag.as_deref()).await? else {
            if let Some(current) = read(&bucket).await? {
                if let Some(response) = current.response(now())? {
                    return Ok(response);
                }
            }
            return empty(503, Some(2));
        };
        // 同一 R2 键两次成功写入至少间隔一秒，回源时间计入间隔。
        let next_write = now().saturating_add(1000);
        let bytes = chain(&global, env).await;
        let result = bytes
            .as_ref()
            .ok()
            .and_then(|bytes| document(bytes, &genesis));
        let Some(result) = result.and_then(|value| value.strip_prefix('{')) else {
            // 保留短时占位，避免故障期间反复回源。
            return empty(503, None);
        };
        let delay = next_write.saturating_sub(now());
        if delay > 0 {
            call(&get(global.as_ref(), "scheduler")?, "wait", &[(delay as f64).into()]).await?;
        }
        // 缓存时间让同一版正文每次刷新也有新 ETag，旧请求不能覆盖新缓存。
        let body = format!("{{\"cached_at\":{},{}", now(), result);
        if write(&bucket, body.as_bytes(), Some(&lease))
            .await?
            .is_none()
        {
            return empty(503, Some(2));
        }
        Response::new_with_opt_str_and_init(
            Some(&body),
            &response_init(200, Some(DAY / 1000), None)?,
        )
    }

    #[wasm_bindgen(js_name = fetchWorker)]
    pub async fn fetch_worker(request: Request, env: JsValue) -> Result<Response> {
        let url = request.url();
        // 普通静态请求由 Pages 直接处理；仅为平台调度保留静态资产入口。
        if !url
            .split_once("://")
            .and_then(|(_, rest)| rest.split_once('/'))
            .is_some_and(|(_, path)| path.split('?').next() == Some("constitution/data"))
        {
            return call(&get(&env, "ASSETS")?, "fetch", &[request.into()])
                .await?
                .dyn_into::<Response>();
        }
        if url != PAGE {
            return empty(404, None);
        }
        if request.method() != "GET" {
            return empty(405, None);
        }
        match constitution(&env).await {
            Ok(response) => Ok(response),
            Err(_) => empty(503, None),
        }
    }
}

#[cfg(test)]
mod tests;
