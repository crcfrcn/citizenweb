use super::*;
use serde_json::json;

#[test]
fn cache_age_stops_at_the_shared_expiry() {
    assert_eq!(cache_age(0, 0), Some(86_400));
    assert_eq!(cache_age(1_000, 0), Some(86_400));
    assert_eq!(cache_age(0, DAY - 1), Some(0));
    assert_eq!(cache_age(0, DAY), None);
    assert_eq!(cache_age(0, DAY + 1), None);
}

#[test]
fn only_returns_a_document_from_the_expected_chain() {
    let digest = format!("0x{}", "0".repeat(64));
    let mut batch = json!([
        {"jsonrpc":"2.0","id":2,"result":{"html":"<h1>宪法</h1>\n","blake2_256":digest,"source":"legislation-raw"}},
        {"jsonrpc":"2.0","id":1,"result":digest}
    ]);
    let bytes = serde_json::to_vec(&batch).unwrap();
    let result = document(&bytes, &digest).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(result).unwrap(),
        batch[0]["result"]
    );
    assert!(document(&bytes, "wrong-chain").is_none());
    batch[0]["result"]["source"] = json!("fixture");
    assert!(document(&serde_json::to_vec(&batch).unwrap(), &digest).is_none());
    assert!(document(&vec![b' '; LIMIT + 1], &digest).is_none());
}
